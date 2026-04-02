import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ThIdentityMemory } from '../../database/entities/th-identity-memory.entity';
import { ThHousehold } from '../../database/entities/th-household.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';
import { matchesNormalizedKey } from './transformhub-key-normalization';
import { TransformHubAiService } from './transformhub-ai.service';

@Injectable()
export class TransformHubIdentityService {
  constructor(
    @InjectRepository(ThIdentityMemory)
    private readonly personRepo: Repository<ThIdentityMemory>,
    @InjectRepository(ThHousehold)
    private readonly householdRepo: Repository<ThHousehold>,
    @InjectRepository(ThAuditDecision)
    private readonly auditDecisionRepo: Repository<ThAuditDecision>,
    private readonly ai: TransformHubAiService,
  ) {}

  private normStr(s: string): string {
    return String(s || "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "").replace(/ +/g, " ");
  }

  private normalizePhone(s: string): string {
    return String(s || '').replace(/\D/g, '').slice(-10);
  }

  private normalizeEmail(s: string): string {
    const raw = String(s || '').toLowerCase().trim();
    if (!raw || !raw.includes('@')) return raw;
    const [localPart, domain] = raw.split('@');
    const normalizedLocal = localPart.split('+')[0];
    return `${normalizedLocal}@${domain}`;
  }

  private buildFingerprints(input: { name?: string; email?: string; phone?: string; address?: string; zip?: string; city?: string; state?: string }, firstName?: string, lastName?: string): string[] {
    const fingerprints = new Set<string>();
    const normalizedName = this.normStr(input.name || [firstName, lastName].filter(Boolean).join(' '));
    const normalizedEmail = this.normalizeEmail(input.email || '');
    const normalizedPhone = this.normalizePhone(input.phone || '');
    const normalizedAddress = this.normStr(input.address || '');
    const normalizedZip = this.normStr(input.zip || '');
    const normalizedCity = this.normStr(input.city || '');
    const normalizedState = this.normStr(input.state || '');

    if (normalizedEmail) fingerprints.add(`email:${normalizedEmail}`);
    if (normalizedPhone) fingerprints.add(`phone:${normalizedPhone}`);
    if (normalizedName && normalizedZip) fingerprints.add(`name_zip:${normalizedName}|${normalizedZip}`);
    if (normalizedName && normalizedCity && normalizedState) fingerprints.add(`name_location:${normalizedName}|${normalizedCity}|${normalizedState}`);
    if (normalizedAddress && normalizedZip) fingerprints.add(`address_zip:${normalizedAddress}|${normalizedZip}`);

    return Array.from(fingerprints);
  }

  private buildInputFingerprints(input: { name?: string; email?: string; phone?: string; address?: string; zip?: string; city?: string; state?: string }): string[] {
    const nameParts = this.normStr(input.name || '').split(' ').filter(Boolean);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
    const lastName = nameParts.slice(-1)[0] || '';
    return this.buildFingerprints(input, firstName, lastName);
  }

  private buildEntityName(row: any): string {
    return String(
      row.entity_name
        || row.displayName
        || row.donorName
        || [row.firstName, row.lastName].filter(Boolean).join(' ')
        || row.organizationName
        || row.householdName
        || '',
    ).trim();
  }

  private fallbackRawValue(rawValues: Record<string, string> | undefined, aliases: string[], validator?: (value: string) => boolean): string {
    if (!rawValues) return '';
    for (const [key, value] of Object.entries(rawValues)) {
      if (!matchesNormalizedKey(key, aliases)) continue;
      const normalizedValue = String(value || '').trim();
      if (!normalizedValue) continue;
      if (!validator || validator(normalizedValue)) return normalizedValue;
    }
    return '';
  }

  private extractPersonInput(row: any): { name: string; email: string; phone: string; address: string; zip: string; householdName: string; city: string; state: string } {
    const rawValues = row.rawValues as Record<string, string> | undefined;
    const email = String(row.email || '').trim() || this.fallbackRawValue(rawValues, ['email', 'email address', 'e-mail', 'mail address'], (value) => value.includes('@'));
    const phone = String(row.phone || '').trim() || this.fallbackRawValue(rawValues, ['phone', 'phone number', 'telephone', 'mobile', 'cell'], (value) => this.normalizePhone(value).length >= 10);
    const address = String(row.addressLine1 || row.address || '').trim() || this.fallbackRawValue(rawValues, ['address', 'address 1', 'mailing address', 'street', 'addr']);
    const zip = String(row.zip || row.postalCode || '').trim() || this.fallbackRawValue(rawValues, ['zip', 'zip code', 'postal', 'postal code'], (value) => /\d{5}/.test(value));
    const householdName = String(row.householdName || row.household_name || '').trim() || this.fallbackRawValue(rawValues, ['household', 'household name']);
    const city = String(row.city || '').trim() || this.fallbackRawValue(rawValues, ['city']);
    const state = String(row.state || '').trim() || this.fallbackRawValue(rawValues, ['state', 'province']);

    return {
      name: this.buildEntityName(row),
      email,
      phone,
      address,
      zip,
      householdName,
      city,
      state,
    };
  }

  private scorePersonPair(
    candidate: any,
    input: { name: string; email: string; phone: string; address: string; zip: string; householdName: string },
  ): { score: number; matchedFields: string[] } {
    let score = 0;
    const matchedFields: string[] = [];

    const inputEmail = this.normalizeEmail(input.email);
    const candidateEmail = this.normalizeEmail(candidate.email);
    if (inputEmail && candidateEmail && inputEmail === candidateEmail) {
      score += 35;
      matchedFields.push('email_alias');
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
      score += 25;
      matchedFields.push('phone');
    }

    if (
      input.zip
      && candidate.zip
      && input.zip.trim() === candidate.zip.trim()
      && this.normStr(input.address)
      && this.normStr(input.address) === this.normStr(candidate.addressLine1)
    ) {
      score += 25;
      matchedFields.push('address_zip');
    }

    if (input.householdName && candidate.lastName && this.normStr(input.householdName).includes(this.normStr(candidate.lastName))) {
      score += 10;
      matchedFields.push('household');
    }

    if (matchedFields.includes('full_name') && matchedFields.includes('phone') && matchedFields.includes('address_zip')) {
      score += 15;
      matchedFields.push('strong_multisignal');
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


  private householdLocationKey(person: any): string {
    const zip = String(person.zip || '').trim();
    if (zip) return `zip:${zip}`;
    const city = this.normStr(person.city || '');
    const state = this.normStr(person.state || '');
    if (city || state) return `city:${city}|state:${state}`;
    return 'unknown';
  }

  private householdExactAddressZipKey(person: any): string | null {
    const address = this.normStr(person.addressLine1 || person.address || '');
    const zip = String(person.zip || '').trim();
    if (!address || !zip) return null;
    return `addrzip:${address}|${zip}`;
  }

  private householdSurnameZipKey(person: any): string | null {
    const lastName = this.normStr(person.lastName || '');
    const zip = String(person.zip || '').trim();
    if (!lastName || !zip) return null;
    return `surnamezip:${lastName}|${zip}`;
  }

  private normalizedHouseholdName(person: any): string {
    return this.normStr(person.householdName || person.household_name || '');
  }

  private normalizedEmailDomain(email: string): string {
    const normalizedEmail = this.normalizeEmail(email || '');
    if (!normalizedEmail.includes('@')) return '';
    return normalizedEmail.split('@')[1] || '';
  }

  private isConsumerEmailDomain(domain: string): boolean {
    return new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'aol.com']).has(domain);
  }

  private sharedValueEvidence(values: string[], evidenceKey: string): string[] {
    const counts = new Map<string, number>();
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
    return Array.from(counts.values()).some((count) => count >= 2) ? [evidenceKey] : [];
  }

  private getSurnameZipSupportEvidence(group: any[]): string[] {
    const evidence = new Set<string>();
    this.sharedValueEvidence(group.map((person) => this.normalizedHouseholdName(person)), 'same_household_name').forEach((item) => evidence.add(item));
    this.sharedValueEvidence(group.map((person) => this.normalizePhone(person.phone || '')).filter((value) => value.length >= 7), 'same_phone').forEach((item) => evidence.add(item));
    this.sharedValueEvidence(group.map((person) => this.normalizeEmail(person.email || '')).filter(Boolean), 'shared_email').forEach((item) => evidence.add(item));
    this.sharedValueEvidence(
      group
        .map((person) => this.normalizedEmailDomain(person.email || ''))
        .filter((domain) => domain && !this.isConsumerEmailDomain(domain)),
      'shared_email_domain',
    ).forEach((item) => evidence.add(item));
    return Array.from(evidence);
  }

  private hasConflictingExactAddresses(group: any[]): boolean {
    const exactAddresses = Array.from(new Set(group.map((person) => this.householdExactAddressZipKey(person)).filter(Boolean)));
    return exactAddresses.length > 1;
  }

  private householdKeyForPeople(people: any[]): string | null {
    const exactAddressKey = people
      .map((person) => this.householdExactAddressZipKey(person))
      .find((key): key is string => Boolean(key));
    if (exactAddressKey) return exactAddressKey;
    const surnameZipKey = people
      .map((person) => this.householdSurnameZipKey(person))
      .find((key): key is string => Boolean(key));
    if (surnameZipKey) return surnameZipKey;
    const primary = people.find((person) => person.lastName) ?? people[0];
    if (!primary?.lastName) return null;
    return `${this.normStr(primary.lastName)}|${this.householdLocationKey(primary)}`;
  }

  private householdKeyForHousehold(household: any): string | null {
    const locationKey = String(household.locationKey || '').trim() || 'unknown';
    const primaryAddress = this.normStr(household?.primaryAddress || '');
    if (primaryAddress && locationKey.startsWith('zip:')) {
      return `addrzip:${primaryAddress}|${locationKey.slice(4)}`;
    }
    if (household?.lastName && locationKey.startsWith('zip:')) {
      return `surnamezip:${this.normStr(household.lastName)}|${locationKey.slice(4)}`;
    }
    if (!household?.lastName) return null;
    return `${this.normStr(household.lastName)}|${locationKey}`;
  }

  private nextHouseholdId(count: number): string {
    return `HH-${String(10000 + count).padStart(5, '0')}`;
  }

  private buildHouseholdPayload(group: any[], existing?: any) {
    const primary = group[0];
    const salutation = group.length === 2 ? 'joint' : 'formal';
    const salutationText = salutation === 'joint' && group.length === 2
      ? `${group[0].firstName} and ${group[1].firstName} ${group[0].lastName}`
      : `The ${primary.lastName} Family`;
    const primaryAddress = primary.addressLine1 || `${primary.city || ''}, ${primary.state || ''} ${primary.zip || ''}`.trim() || null;
    const memberIds = Array.from(new Set(group.map((person) => person.id)));

    return {
      ...existing,
      lastName: primary.lastName || existing?.lastName || null,
      primaryMemberId: primary.id || existing?.primaryMemberId || null,
      primaryAddress: primaryAddress || existing?.primaryAddress || null,
      locationKey: this.householdLocationKey(primary),
      salutation,
      salutationText,
      memberIds,
      version: existing
        ? JSON.stringify(existing.memberIds || []) === JSON.stringify(memberIds)
          ? existing.version
          : (existing.version || 1) + 1
        : 1,
      jointGivingTotal: existing?.jointGivingTotal || 0,
    };
  }

  private createPersonIndex(persons: any[]) {
    const exactName = new Map<string, Set<any>>();
    const lastName = new Map<string, Set<any>>();
    const token = new Map<string, Set<any>>();
    const email = new Map<string, Set<any>>();
    const phone = new Map<string, Set<any>>();
    const fingerprint = new Map<string, Set<any>>();

    const add = (map: Map<string, Set<any>>, key: string, person: any) => {
      if (!key) return;
      const bucket = map.get(key) ?? new Set<any>();
      bucket.add(person);
      map.set(key, bucket);
    };

    const addPerson = (person: any) => {
      add(exactName, this.personDisplayName(person), person);
      add(lastName, this.normStr(person.lastName || ''), person);
      add(email, this.normalizeEmail(person.email || ''), person);
      add(phone, this.normalizePhone(person.phone || ''), person);
      (Array.isArray(person.fingerprints) ? person.fingerprints : []).forEach((fingerprintValue: string) => add(fingerprint, fingerprintValue, person));
      this.personNameTokens(person).forEach((tokenValue) => add(token, tokenValue, person));
    };

    persons.forEach(addPerson);
    return { exactName, lastName, token, email, phone, fingerprint, addPerson };
  }

  private candidatePersonsForInput(
    index: ReturnType<TransformHubIdentityService['createPersonIndex']>,
    input: { name: string; email: string; phone: string; address: string; zip: string; city?: string; state?: string },
  ): any[] {
    const candidates = new Set<any>();
    const normalizedName = this.normStr(input.name);
    const normalizedEmail = this.normalizeEmail(input.email);
    const normalizedPhone = this.normalizePhone(input.phone);
    const parts = normalizedName.split(' ').filter((part) => part.length > 1);
    const inputLastName = parts.at(-1) ?? '';
    const inputFingerprints = this.buildInputFingerprints(input);

    const addAll = (values?: Set<any>) => {
      values?.forEach((person) => candidates.add(person));
    };

    addAll(index.exactName.get(normalizedName));
    addAll(index.lastName.get(inputLastName));
    addAll(index.email.get(normalizedEmail));
    addAll(index.phone.get(normalizedPhone));
    inputFingerprints.forEach((fingerprint) => addAll(index.fingerprint.get(fingerprint)));
    parts.forEach((part) => addAll(index.token.get(part)));

    return Array.from(candidates);
  }

  private applyDecisionPolicy(storedDecisions: ThAuditDecision[], candidates: any[]) {
    const storedMergeDecision = storedDecisions.find((decision) => decision.merge && decision.matchedPersonId);
    const blockedPersonIds = new Set(
      storedDecisions
        .filter((decision) => decision.split && decision.matchedPersonId)
        .map((decision) => decision.matchedPersonId as string),
    );
    const hasGlobalSplitDecision = storedDecisions.some((decision) => decision.split && !decision.matchedPersonId);
    const eligibleCandidates = candidates.filter((candidate) => !blockedPersonIds.has(candidate.id));

    return {
      storedMergeDecision,
      blockedPersonIds,
      hasGlobalSplitDecision,
      eligibleCandidates,
    };
  }

  private async ensureStoredMatchPerson(persons: any[], matchedPersonId: string | null | undefined) {
    if (!matchedPersonId) return null;
    const existing = persons.find((person) => person.id === matchedPersonId);
    if (existing) return existing;
    const dbPerson = await this.personRepo.findOne({ where: { id: matchedPersonId } });
    if (dbPerson) persons.push(dbPerson);
    return dbPerson;
  }

  private createNewPerson(row: any, persons: any[], sequence: number, scope: { platform?: string | null; fileClass?: string | null } = {}, rowRef?: string) {
    const input = this.extractPersonInput(row);
    const nameParts = input.name.trim().split(/\s+/);
    const firstName = row.firstName || nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
    const lastName = row.lastName || nameParts.slice(-1)[0] || '';
    const newPerson = this.personRepo.create({
      id: this.nextPersonId(persons.length + sequence),
      firstName,
      lastName,
      email: input.email,
      phone: input.phone,
      addressLine1: input.address,
      city: input.city,
      state: input.state,
      zip: input.zip,
      tags: Array.isArray(row.tags) ? row.tags : [],
      lifecycle: 'active',
      sourcePlatform: scope.platform ?? null,
      sourceFileClass: scope.fileClass ?? null,
      fingerprints: this.buildFingerprints(input, firstName, lastName),
      decisionState: 'confirmed',
      lastConfirmedAt: new Date(),
    });
    persons.push(newPerson);
    return newPerson;
  }

  private mergePersonSignals(person: any, input: { email: string; phone: string; address: string; zip: string; city: string; state: string }, rowRef: string, scope: { platform?: string | null; fileClass?: string | null } = {}) {
    person.updatedAt = new Date();
    if (!person.email && input.email) person.email = input.email;
    if (!person.phone && input.phone) person.phone = input.phone;
    if (!person.addressLine1 && input.address) person.addressLine1 = input.address;
    if (!person.zip && input.zip) person.zip = input.zip;
    if (!person.city && input.city) person.city = input.city;
    if (!person.state && input.state) person.state = input.state;
    if (!person.sourcePlatform && scope.platform) person.sourcePlatform = scope.platform;
    if (!person.sourceFileClass && scope.fileClass) person.sourceFileClass = scope.fileClass;
    person.fingerprints = this.buildFingerprints({
      name: [person.firstName, person.lastName].filter(Boolean).join(' '),
      email: person.email,
      phone: person.phone,
      address: person.addressLine1,
      zip: person.zip,
      city: person.city,
      state: person.state,
    }, person.firstName, person.lastName);
    person.lastConfirmedAt = new Date();
    if (!person.decisionState) person.decisionState = 'confirmed';
  }

  private buildMatchReviewPayload(
    row: any,
    rowRef: string,
    input: { name: string; email: string; phone: string; address: string; zip: string; householdName: string; city: string; state: string },
    matchedFields: string[],
    candidate?: any,
    aiSuggestion?: { suggestedAction: 'confirm_merge' | 'keep_separate'; confidence: 'high' | 'medium' | 'low'; reason: string; evidence: string[]; model: string } | null,
    matchedInputRef?: string | null,
  ) {
    return {
      rowRef,
      rawValues: row.rawValues ?? null,
      matchedInputRef: matchedInputRef ?? null,
      input: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        zip: input.zip,
        householdName: input.householdName,
        city: input.city,
        state: input.state,
      },
      matchedEvidence: matchedFields,
      aiSuggestion: aiSuggestion ?? null,
      candidate: candidate
        ? {
            id: candidate.id,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            email: candidate.email,
            phone: candidate.phone,
            addressLine1: candidate.addressLine1,
            city: candidate.city,
            state: candidate.state,
            zip: candidate.zip,
          }
        : null,
    };
  }

  private async buildAiReviewSuggestion(
    rowRef: string,
    input: { name: string; email: string; phone: string; address: string; zip: string; householdName: string; city: string; state: string },
    matchedFields: string[],
    score: number,
    candidate?: any,
  ) {
    if (!candidate || !this.ai.isEnabled) return null;
    return this.ai.suggestPersonMatch({
      rowRef,
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      zip: input.zip,
      householdName: input.householdName,
      city: input.city,
      state: input.state,
      matchedEvidence: matchedFields,
      score,
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        addressLine1: candidate.addressLine1,
        city: candidate.city,
        state: candidate.state,
        zip: candidate.zip,
      },
    });
  }

  async resolvePersons(rows: any[], existingPersons?: any[], options?: { usePersistentIdentityMemory?: boolean; forceReviewOnAutoMatches?: boolean; seedExistingPersonsFromDb?: boolean; baselinePlatform?: string; baselineFileClass?: string; persistIdentityMemory?: boolean; includeAiSuggestions?: boolean }): Promise<any> {
    const usePersistentIdentityMemory = options?.usePersistentIdentityMemory === true;
    const forceReviewOnAutoMatches = options?.forceReviewOnAutoMatches === true;
    const seedExistingPersonsFromDb = options?.seedExistingPersonsFromDb === true;
    const baselinePlatform = options?.baselinePlatform || null;
    const baselineFileClass = options?.baselineFileClass || null;
    const persistIdentityMemory = options?.persistIdentityMemory !== false;
    const includeAiSuggestions = options?.includeAiSuggestions !== false;
    const personScope = { platform: baselinePlatform, fileClass: baselineFileClass };
    const seedPersons = Array.isArray(existingPersons)
      ? existingPersons
      : seedExistingPersonsFromDb && baselinePlatform && baselineFileClass
        ? await this.personRepo.find({ where: { sourcePlatform: baselinePlatform, sourceFileClass: baselineFileClass } })
        : [];
    const persons = [...seedPersons];
    const personIndex = this.createPersonIndex(persons);
    const matches: any[] = [];
    const pendingPersonSaves: ThIdentityMemory[] = [];
    const personInputRefs = new Map<string, string>();
    let autoMatched = 0;
    let needsReviewCount = 0;
    let separated = 0;
    let newPersonCount = 0;
    const seen = new Set<string>();

    const inputKeys = Array.from(new Set(rows.map((row) => this.normStr(this.buildEntityName(row))).filter(Boolean)));
    const permanentDecisions = usePersistentIdentityMemory && inputKeys.length > 0
      ? await this.auditDecisionRepo.find({ where: { permanent: true, inputKey: In(inputKeys) }, order: { updatedAt: 'DESC' } })
      : [];
    const decisionsByInputKey = new Map<string, ThAuditDecision[]>();
    permanentDecisions.forEach((decision) => {
      const key = decision.inputKey || '';
      const current = decisionsByInputKey.get(key) ?? [];
      current.push(decision);
      decisionsByInputKey.set(key, current);
    });

    for (const [index, row] of rows.entries()) {
      const input = this.extractPersonInput(row);
      if (!input.name) continue;
      const rowRef = row.source_row_ref || row.sourceRowRef || String(index);
      const seenKey = `${this.normStr(input.name)}|${rowRef}`;
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);

      const inputKey = this.normStr(input.name);
      const storedDecisions = decisionsByInputKey.get(inputKey) ?? [];
      const decisionPolicy = this.applyDecisionPolicy(storedDecisions, this.candidatePersonsForInput(personIndex, input));
      const storedMergeDecision = decisionPolicy.storedMergeDecision;

      if (storedMergeDecision?.matchedPersonId) {
        const storedPerson = await this.ensureStoredMatchPerson(persons, storedMergeDecision.matchedPersonId);
        if (storedPerson) {
          this.mergePersonSignals(storedPerson, input, rowRef, personScope);
          pendingPersonSaves.push(storedPerson);
          const matchedInputRef = personInputRefs.get(storedPerson.id) ?? null;
          matches.push({
            inputRef: rowRef,
            score: 100,
            band: 'auto',
            decision: 'auto',
            matchedPersonId: storedPerson.id,
            matchedFields: ['stored_decision'],
            reviewPayload: this.buildMatchReviewPayload(row, rowRef, input, ['stored_decision'], storedPerson, null, matchedInputRef),
          });
          autoMatched++;
          continue;
        }
      }

      const candidates = decisionPolicy.eligibleCandidates;
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
      const baseBand = decisionPolicy.hasGlobalSplitDecision ? 'separate' : this.getConfidenceBand(bestScore);
      const band = forceReviewOnAutoMatches && baseBand === 'auto' && bestMatch ? 'review' : baseBand;
      let matchedPersonId: string | null = null;
      let decision = 'new';

      let aiSuggestion = null;
      const matchedInputRef = bestMatch ? (personInputRefs.get(bestMatch.id) ?? null) : null;

      if (band === 'auto' && bestMatch) {
        this.mergePersonSignals(bestMatch, input, rowRef, personScope);
        pendingPersonSaves.push(bestMatch);
        matchedPersonId = bestMatch.id;
        decision = 'auto';
        autoMatched++;
      } else if (band === 'review' && bestMatch) {
        matchedPersonId = bestMatch.id;
        decision = 'review';
        needsReviewCount++;
        if (includeAiSuggestions) {
          aiSuggestion = await this.buildAiReviewSuggestion(rowRef, input, bestMatchedFields, bestScore, bestMatch);
        }
      } else {
        const newPerson = this.createNewPerson(row, persons, ++newPersonCount, personScope, rowRef);
        pendingPersonSaves.push(newPerson);
        personIndex.addPerson(newPerson);
        matchedPersonId = newPerson.id;
        personInputRefs.set(newPerson.id, rowRef);
        decision = 'new';
        separated++;
        if (storedSplitDecision || decisionPolicy.hasGlobalSplitDecision) bestMatchedFields = [...bestMatchedFields, 'stored_separate_decision'];
      }

      matches.push({
        inputRef: rowRef,
        score: bestScore,
        band,
        decision,
        matchedPersonId,
        matchedFields: bestMatchedFields,
        reviewPayload: this.buildMatchReviewPayload(row, rowRef, input, bestMatchedFields, bestMatch, aiSuggestion, matchedInputRef),
      });
    }

    if (persistIdentityMemory && pendingPersonSaves.length > 0) {
      const dedupedPersonSaves = Array.from(new Map(pendingPersonSaves.map((person) => [person.id, person])).values());
      await this.personRepo.save(dedupedPersonSaves);
    }

    return {
      persons,
      canonicalPersons: persons,
      matches,
      autoMatched,
      autoMergedCount: autoMatched,
      needsReview: needsReviewCount,
      pendingReviewCount: needsReviewCount,
      separated,
    };
  }

  private async buildHouseholdReviewSuggestions(reviewCandidates: Array<{ key: string; members: any[]; evidence: string[] }>) {
    if (!this.ai.isEnabled) return [];

    const suggestions: any[] = [];
    let sequence = 0;
    for (const candidate of reviewCandidates) {
      const addressKey = candidate.key;
      const members = candidate.members;
      if (members.length < 2) continue;
      const aiSuggestion = await this.ai.suggestHouseholdMatch({
        addressKey,
        evidence: candidate.evidence,
        members: members.map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          addressLine1: member.addressLine1,
          city: member.city,
          state: member.state,
          zip: member.zip,
        })),
      });
      suggestions.push({
        id: `hs-review-${++sequence}`,
        proposedMemberIds: members.map((member) => member.id),
        proposedMembers: members.map((member) => ({
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          addressLine1: member.addressLine1,
          city: member.city,
          state: member.state,
          zip: member.zip,
        })),
        matchedEvidence: candidate.evidence,
        aiSuggestion,
      });
    }

    return suggestions;
  }

  async resolveHouseholds(persons: any[], options?: { usePersistentHouseholdMemory?: boolean }): Promise<any> {
    const households: any[] = [];
    const ungroupedPersonIds: string[] = [];
    const usePersistentHouseholdMemory = options?.usePersistentHouseholdMemory === true;
    const assignedPersonIds = new Set<string>();
    const reviewCandidateMap = new Map<string, { key: string; members: any[]; evidence: string[] }>();

    const existingHouseholds = usePersistentHouseholdMemory ? await this.householdRepo.find() : [];
    const existingByKey = new Map<string, ThHousehold>();
    existingHouseholds.forEach((household) => {
      const key = this.householdKeyForHousehold(household);
      if (key && !existingByKey.has(key)) existingByKey.set(key, household);
    });

    let hhCount = existingHouseholds.length;
    const pendingHouseholdSaves: ThHousehold[] = [];
    const addHouseholdGroup = (key: string, group: any[]) => {
      const existing = existingByKey.get(key);
      const payload = this.buildHouseholdPayload(group, existing);
      const household = {
        id: existing?.id || this.nextHouseholdId(++hhCount),
        ...payload,
      } as ThHousehold;
      households.push(household);
      pendingHouseholdSaves.push(household);
      existingByKey.set(key, household);
      group.forEach((person) => assignedPersonIds.add(person.id));
    };

    const exactAddressBuckets = new Map<string, any[]>();
    persons.forEach((person) => {
      const key = this.householdExactAddressZipKey(person);
      if (!key) return;
      const bucket = exactAddressBuckets.get(key) ?? [];
      bucket.push(person);
      exactAddressBuckets.set(key, bucket);
    });

    for (const [key, group] of exactAddressBuckets.entries()) {
      const uniqueGroup = Array.from(new Map(group.map((person) => [person.id, person])).values());
      if (uniqueGroup.length < 2) continue;
      addHouseholdGroup(key, uniqueGroup);
    }

    const surnameZipBuckets = new Map<string, any[]>();
    persons.forEach((person) => {
      if (assignedPersonIds.has(person.id)) return;
      const key = this.householdSurnameZipKey(person);
      if (!key) return;
      const bucket = surnameZipBuckets.get(key) ?? [];
      bucket.push(person);
      surnameZipBuckets.set(key, bucket);
    });

    for (const [key, group] of surnameZipBuckets.entries()) {
      const uniqueGroup = Array.from(new Map(group.map((person) => [person.id, person])).values());
      if (uniqueGroup.length < 2) continue;
      const supportEvidence = this.getSurnameZipSupportEvidence(uniqueGroup);
      if (!this.hasConflictingExactAddresses(uniqueGroup) && supportEvidence.length > 0) {
        addHouseholdGroup(key, uniqueGroup);
        continue;
      }
      reviewCandidateMap.set(key, {
        key,
        members: uniqueGroup,
        evidence: ['same_surname', 'same_zip', ...supportEvidence],
      });
    }

    if (pendingHouseholdSaves.length > 0 && usePersistentHouseholdMemory) {
      await this.householdRepo.save(pendingHouseholdSaves);
    }

    persons.forEach((person) => {
      if (!assignedPersonIds.has(person.id)) ungroupedPersonIds.push(person.id);
    });

    const reviewSuggestions = await this.buildHouseholdReviewSuggestions(Array.from(reviewCandidateMap.values()));

    return { households, ungroupedPersonIds, reviewSuggestions };
  }

  async getAllPersons(): Promise<ThIdentityMemory[]> {
    return this.personRepo.find();
  }
}
