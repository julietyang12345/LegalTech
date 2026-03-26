import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ThCanonicalPerson } from '../../database/entities/th-canonical-person.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';

@Injectable()
export class TransformHubIdentityService {
  constructor(
    @InjectRepository(ThCanonicalPerson)
    private readonly personRepo: Repository<ThCanonicalPerson>,
    @InjectRepository(ThAuditDecision)
    private readonly auditDecisionRepo: Repository<ThAuditDecision>,
  ) {}

  private normStr(s: string): string {
    return String(s || '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }

  private normalizePhone(s: string): string {
    return String(s || '').replace(/\D/g, '').slice(-10);
  }

  private scorePersonPair(candidate: any, input: { name: string; email: string; phone: string; address: string; zip: string }): { score: number; matchedFields: string[] } {
    let score = 0;
    const matchedFields: string[] = [];

    if (input.email && candidate.email && input.email.toLowerCase().trim() === candidate.email.toLowerCase().trim()) {
      score += 50;
      matchedFields.push('email');
    }

    const inputName = this.normStr(input.name);
    const candidateName = this.normStr(`${candidate.firstName} ${candidate.lastName}`);

    if (inputName && candidateName && inputName === candidateName) {
      score += 35;
      matchedFields.push('full_name');
    } else if (inputName && candidateName) {
      const inputTokens = new Set(inputName.split(' ').filter((token) => token.length > 1));
      const candidateTokens = new Set(candidateName.split(' ').filter((token) => token.length > 1));
      const overlap = [...inputTokens].filter((token) => candidateTokens.has(token)).length;
      const total = Math.max(inputTokens.size, candidateTokens.size, 1);
      if (overlap / total >= 0.75) {
        score += 20;
        matchedFields.push('name_partial');
      } else if (overlap > 0 && this.normStr(input.name).includes(this.normStr(candidate.lastName))) {
        score += 10;
        matchedFields.push('last_name');
      }
    }

    const inputPhone = this.normalizePhone(input.phone);
    const candidatePhone = this.normalizePhone(candidate.phone);
    if (inputPhone && candidatePhone && inputPhone.length >= 7 && inputPhone === candidatePhone) {
      score += 20;
      matchedFields.push('phone');
    }

    if (
      input.zip &&
      candidate.zip &&
      input.zip.trim() === candidate.zip.trim() &&
      this.normStr(input.address) &&
      this.normStr(input.address) === this.normStr(candidate.addressLine1)
    ) {
      score += 20;
      matchedFields.push('address_zip');
    }

    return { score, matchedFields };
  }

  private getConfidenceBand(score: number): string {
    if (score >= 85) return 'auto';
    if (score >= 60) return 'review';
    return 'separate';
  }

  private nextPersonId(count: number): string {
    return `P-${String(10000 + count).padStart(5, '0')}`;
  }

  private personDisplayName(person: any): string {
    return this.normStr(`${person.firstName || ''} ${person.lastName || ''}`);
  }

  private personNameTokens(person: any): string[] {
    return this.personDisplayName(person).split(' ').filter((token) => token.length > 1);
  }

  private createPersonIndex(persons: any[]) {
    const exactName = new Map<string, Set<any>>();
    const lastName = new Map<string, Set<any>>();
    const token = new Map<string, Set<any>>();

    const add = (map: Map<string, Set<any>>, key: string, person: any) => {
      if (!key) return;
      const bucket = map.get(key) ?? new Set<any>();
      bucket.add(person);
      map.set(key, bucket);
    };

    const addPerson = (person: any) => {
      add(exactName, this.personDisplayName(person), person);
      add(lastName, this.normStr(person.lastName || ''), person);
      this.personNameTokens(person).forEach((tokenValue) => add(token, tokenValue, person));
    };

    persons.forEach(addPerson);
    return { exactName, lastName, token, addPerson };
  }

  private candidatePersonsForInput(
    index: ReturnType<TransformHubIdentityService['createPersonIndex']>,
    input: { name: string; email: string; phone: string; address: string; zip: string },
  ): any[] {
    const candidates = new Set<any>();
    const normalizedName = this.normStr(input.name);
    const parts = normalizedName.split(' ').filter((part) => part.length > 1);
    const inputLastName = parts.at(-1) ?? '';

    const addAll = (values?: Set<any>) => {
      values?.forEach((person) => candidates.add(person));
    };

    addAll(index.exactName.get(normalizedName));
    addAll(index.lastName.get(inputLastName));
    parts.forEach((part) => addAll(index.token.get(part)));

    return Array.from(candidates);
  }

  private async ensureStoredMatchPerson(persons: any[], matchedPersonId: string | null | undefined) {
    if (!matchedPersonId) return null;
    const existing = persons.find((person) => person.id === matchedPersonId);
    if (existing) return existing;
    const dbPerson = await this.personRepo.findOne({ where: { id: matchedPersonId } });
    if (dbPerson) persons.push(dbPerson);
    return dbPerson;
  }

  private createNewPerson(row: any, persons: any[], dbPersonCount: number, sequence: number) {
    const nameParts = row.entity_name.trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
    const lastName = nameParts.slice(-1)[0] || '';
    const newPerson = this.personRepo.create({
      id: this.nextPersonId(dbPersonCount + sequence),
      firstName,
      lastName,
      email: '',
      phone: '',
      addressLine1: '',
      city: '',
      state: '',
      zip: '',
      tags: [],
      lifecycle: 'active',
      sourceRowRefs: [row.source_row_ref],
    });
    persons.push(newPerson);
    return newPerson;
  }

  async resolvePersons(rows: any[], existingPersons: any[] = [], sessionId?: string): Promise<any> {
    void sessionId;
    const dbPersons = existingPersons.length > 0 ? existingPersons : await this.personRepo.find();
    const persons = [...dbPersons];
    const personIndex = this.createPersonIndex(persons);
    const matches: any[] = [];
    const pendingPersonSaves: ThCanonicalPerson[] = [];
    let autoMatched = 0;
    let needsReviewCount = 0;
    let separated = 0;
    let newPersonCount = 0;
    const seen = new Set<string>();

    const inputKeys = Array.from(new Set(rows.map((row) => this.normStr(row.entity_name || '')).filter(Boolean)));
    const permanentDecisions = inputKeys.length > 0
      ? await this.auditDecisionRepo.find({ where: { permanent: true, inputKey: In(inputKeys) }, order: { updatedAt: 'DESC' } })
      : [];
    const decisionsByInputKey = new Map<string, ThAuditDecision[]>();
    permanentDecisions.forEach((decision) => {
      const key = decision.inputKey || '';
      const current = decisionsByInputKey.get(key) ?? [];
      current.push(decision);
      decisionsByInputKey.set(key, current);
    });

    for (const row of rows) {
      if (!row.entity_name) continue;
      const seenKey = `${this.normStr(row.entity_name)}|${row.source_row_ref}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);

      const input = { name: row.entity_name, email: '', phone: '', address: '', zip: '' };
      const inputKey = this.normStr(row.entity_name);
      const storedDecisions = decisionsByInputKey.get(inputKey) ?? [];
      const storedMergeDecision = storedDecisions.find((decision) => decision.merge && decision.matchedPersonId);

      if (storedMergeDecision?.matchedPersonId) {
        const storedPerson = await this.ensureStoredMatchPerson(persons, storedMergeDecision.matchedPersonId);
        if (storedPerson) {
          storedPerson.updatedAt = new Date();
          storedPerson.sourceRowRefs = [...(storedPerson.sourceRowRefs || []), row.source_row_ref];
          pendingPersonSaves.push(storedPerson);
          matches.push({
            inputRef: row.source_row_ref,
            score: 100,
            band: 'auto',
            decision: 'auto',
            matchedPersonId: storedPerson.id,
            matchedFields: ['stored_decision'],
          });
          autoMatched++;
          continue;
        }
      }

      const candidates = this.candidatePersonsForInput(personIndex, input);
      let bestScore = 0;
      let bestMatch: any = null;
      let bestMatchedFields: string[] = [];

      for (const person of candidates) {
        const { score, matchedFields } = this.scorePersonPair(person, input);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = person;
          bestMatchedFields = matchedFields;
        }
      }

      const storedSplitDecision = storedDecisions.find(
        (decision) => decision.split && (!decision.matchedPersonId || decision.matchedPersonId === bestMatch?.id),
      );
      const band = storedSplitDecision ? 'separate' : this.getConfidenceBand(bestScore);
      let matchedPersonId: string | null = null;
      let decision = 'new';

      if (band === 'auto' && bestMatch) {
        bestMatch.updatedAt = new Date();
        bestMatch.sourceRowRefs = [...(bestMatch.sourceRowRefs || []), row.source_row_ref];
        pendingPersonSaves.push(bestMatch);
        matchedPersonId = bestMatch.id;
        decision = 'auto';
        autoMatched++;
      } else if (band === 'review' && bestMatch) {
        matchedPersonId = bestMatch.id;
        decision = 'review';
        needsReviewCount++;
      } else {
        const newPerson = this.createNewPerson(row, persons, dbPersons.length, ++newPersonCount);
        pendingPersonSaves.push(newPerson);
        personIndex.addPerson(newPerson);
        matchedPersonId = newPerson.id;
        decision = 'new';
        separated++;
        if (storedSplitDecision) bestMatchedFields = [...bestMatchedFields, 'stored_separate_decision'];
      }

      matches.push({ inputRef: row.source_row_ref, score: bestScore, band, decision, matchedPersonId, matchedFields: bestMatchedFields });
    }


    if (pendingPersonSaves.length > 0) {
      const dedupedPersonSaves = Array.from(new Map(pendingPersonSaves.map((person) => [person.id, person])).values());
      await this.personRepo.save(dedupedPersonSaves);
    }

    return { persons, matches, autoMatched, needsReview: needsReviewCount, separated };
  }

  resolveHouseholds(persons: any[]): any {
    const households: any[] = [];
    const grouped = new Map<string, any[]>();
    const ungroupedPersonIds: string[] = [];
    let hhCount = 0;

    for (const person of persons) {
      if (!person.lastName) {
        ungroupedPersonIds.push(person.id);
        continue;
      }
      const key = `${this.normStr(person.lastName)}|${person.zip || person.city || 'unknown'}`;
      const group = grouped.get(key) ?? [];
      group.push(person);
      grouped.set(key, group);
    }

    for (const [, group] of grouped) {
      if (group.length < 2) {
        ungroupedPersonIds.push(group[0].id);
        continue;
      }
      const primary = group[0];
      const salutation = group.length === 2 ? 'joint' : 'formal';
      const salutationText = salutation === 'joint' && group.length === 2
        ? `${group[0].firstName} and ${group[1].firstName} ${group[0].lastName}`
        : `The ${primary.lastName} Family`;
      households.push({
        id: `HH-${String(10000 + hhCount++).padStart(5, '0')}`,
        lastName: primary.lastName,
        memberIds: group.map((person) => person.id),
        primaryAddress: primary.addressLine1 || `${primary.city}, ${primary.state} ${primary.zip}`.trim(),
        salutation,
        salutationText,
        jointGivingTotal: 0,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return { households, ungroupedPersonIds };
  }

  async getAllPersons(): Promise<ThCanonicalPerson[]> {
    return this.personRepo.find();
  }
}
