import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ThTaxonomyException } from '../../database/entities/th-taxonomy-exception.entity';
import { TAXONOMY_REGISTRY, LEGACY_MAPPINGS } from './transformhub-pipeline.service';
import { TransformHubAiService } from './transformhub-ai.service';

@Injectable()
export class TransformHubTaxonomyService {
  constructor(
    @InjectRepository(ThTaxonomyException)
    private readonly exceptionRepo: Repository<ThTaxonomyException>,
    private readonly ai: TransformHubAiService,
  ) {}

  private normalizeRawValue(rawValue: string): string {
    return String(rawValue || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  private buildExceptionKey(type: string, rawValue: string): string {
    return `${type}:${this.normalizeRawValue(rawValue)}`;
  }

  private resolveCanonicalCode(rawValue: string, type: string): string | null {
    const normalized = this.normalizeRawValue(rawValue);
    if (!normalized) return null;

    const inRegistry = TAXONOMY_REGISTRY.find(
      (code) => code.type === type && (code.code.toLowerCase() === normalized || this.normalizeRawValue(code.label) === normalized),
    );
    if (inRegistry) return inRegistry.code;

    const legacy = LEGACY_MAPPINGS.find(
      (mapping) => mapping.type === type && this.normalizeRawValue(mapping.legacyValue) === normalized,
    );
    return legacy?.canonicalCode ?? null;
  }

  private buildRowChecks(row: any): Array<{ rawValue: string | null; normalizedRawValue: string; type: 'fund' | 'appeal'; normalizedCode: string | null }> {
    return [
      {
        rawValue: row.raw_fund,
        normalizedRawValue: this.normalizeRawValue(row.raw_fund),
        type: 'fund',
        normalizedCode: row.normalized_fund ?? null,
      },
      {
        rawValue: row.raw_appeal,
        normalizedRawValue: this.normalizeRawValue(row.raw_appeal),
        type: 'appeal',
        normalizedCode: row.normalized_appeal ?? null,
      },
    ];
  }

  private buildRuleSuggestedCode(check: { normalizedRawValue: string; type: 'fund' | 'appeal' }): string | null {
    return LEGACY_MAPPINGS.find(
      (mapping) => mapping.type === check.type && check.normalizedRawValue.includes(this.normalizeRawValue(mapping.legacyValue).split(' ')[0]),
    )?.canonicalCode ?? null;
  }

  private buildRuleEvidence(row: any, check: { rawValue: string | null; normalizedRawValue: string; type: 'fund' | 'appeal' }, ruleSuggestedCode: string | null) {
    const evidence: Array<Record<string, any>> = [
      { source: 'rule', key: 'rowRef', value: row.source_row_ref ?? null },
      { source: 'rule', key: 'rawValue', value: check.rawValue ?? '' },
      { source: 'rule', key: 'normalizedRawValue', value: check.normalizedRawValue },
      { source: 'rule', key: 'type', value: check.type },
    ];

    if (row.source_platform) evidence.push({ source: 'rule', key: 'sourcePlatform', value: row.source_platform });
    if (row.entity_name) evidence.push({ source: 'rule', key: 'entityName', value: row.entity_name });
    if (row.memo) evidence.push({ source: 'rule', key: 'memo', value: row.memo });
    if (ruleSuggestedCode) evidence.push({ source: 'rule', key: 'legacyPrefixCandidate', value: ruleSuggestedCode });

    return evidence;
  }

  private buildSampleValues(row: any, check: { rawValue: string | null; type: 'fund' | 'appeal' }): string[] {
    return Array.from(
      new Set(
        [
          check.rawValue,
          row.entity_name,
          row.memo,
          row.account_name,
          row.account_code,
          row[check.type === 'fund' ? 'raw_appeal' : 'raw_fund'],
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }

  private serializeException(exception: ThTaxonomyException) {
    return {
      ...exception,
      ruleEvidence: exception.ruleEvidence ?? [],
      sampleValues: exception.sampleValues ?? [],
      aiSuggestion: exception.aiSuggestion ?? null,
      aiReviewStatus: exception.aiReviewStatus ?? null,
      aiRejectedReason: exception.aiRejectedReason ?? null,
    };
  }

  private buildViolation(row: any, check: { rawValue: string | null; type: 'fund' | 'appeal' }, exception: Partial<ThTaxonomyException> & { id?: string | null }) {
    const aiSuggestion = exception.aiSuggestion ?? null;
    return {
      rowRef: row.source_row_ref,
      field: check.type,
      rawValue: check.rawValue,
      exceptionId: exception.id ?? null,
      suggestedCode: exception.resolvedCode ?? aiSuggestion?.code ?? null,
      suggestionSource: exception.aiSuggested ? 'ai' : exception.resolvedCode ? 'rule' : null,
      aiSuggested: Boolean(exception.aiSuggested),
      aiReviewStatus: exception.aiReviewStatus ?? null,
      aiReasoning: exception.aiReasoning ?? aiSuggestion?.reasoning ?? null,
      aiConfidence: aiSuggestion?.confidence ?? null,
      aiEvidence: aiSuggestion?.evidence ?? [],
      ruleEvidence: exception.ruleEvidence ?? [],
    };
  }

  applyNormalizedTaxonomy(rows: any[]): any[] {
    return rows.map((row) => {
      const nextFund = row.normalized_fund ?? (row.raw_fund ? this.resolveCanonicalCode(row.raw_fund, 'fund') : null);
      const nextAppeal = row.normalized_appeal ?? (row.raw_appeal ? this.resolveCanonicalCode(row.raw_appeal, 'appeal') : null);
      const nextResolutionSource = row.resolution_source ?? ((nextFund && !row.normalized_fund) || (nextAppeal && !row.normalized_appeal) ? 'direct' : null);

      return {
        ...row,
        normalized_fund: nextFund,
        normalized_appeal: nextAppeal,
        resolution_source: nextResolutionSource,
      };
    });
  }

  private async loadResolvedExceptionsByKey(rows: any[]): Promise<Map<string, ThTaxonomyException>> {
    const normalizedRawValues = Array.from(
      new Set(
        rows
          .flatMap((row) => this.buildRowChecks(row).map((check) => check.normalizedRawValue))
          .filter(Boolean),
      ),
    );

    if (normalizedRawValues.length === 0) {
      return new Map();
    }

    const exceptions = await this.exceptionRepo.find({
      where: {
        status: 'resolved',
        normalizedRawValue: In(normalizedRawValues),
      },
      order: { resolvedAt: 'DESC', updatedAt: 'DESC', createdAt: 'DESC' },
    });

    const resolvedByKey = new Map<string, ThTaxonomyException>();
    for (const exception of exceptions) {
      if (!exception.resolvedCode) continue;
      const key = this.buildExceptionKey(exception.type, exception.rawValue);
      if (!resolvedByKey.has(key)) {
        resolvedByKey.set(key, exception);
      }
    }

    return resolvedByKey;
  }

  private async loadOpenExceptionsByKey(rows: any[]): Promise<Map<string, ThTaxonomyException>> {
    const normalizedRawValues = Array.from(
      new Set(
        rows
          .flatMap((row) => this.buildRowChecks(row).map((check) => check.normalizedRawValue))
          .filter(Boolean),
      ),
    );

    if (normalizedRawValues.length === 0) {
      return new Map();
    }

    const exceptions = await this.exceptionRepo.find({
      where: {
        status: 'open',
        normalizedRawValue: In(normalizedRawValues),
      },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });

    const openByKey = new Map<string, ThTaxonomyException>();
    for (const exception of exceptions) {
      const key = this.buildExceptionKey(exception.type, exception.rawValue);
      if (!openByKey.has(key)) {
        openByKey.set(key, exception);
      }
    }

    return openByKey;
  }

  private async hydrateResolvedExceptions(rows: any[]): Promise<any[]> {
    const normalizedRows = this.applyNormalizedTaxonomy(rows);
    const exceptionIds = Array.from(new Set(normalizedRows.map((row) => row.taxonomy_exception_id).filter(Boolean)));
    const exceptionById = new Map<string, ThTaxonomyException>();

    if (exceptionIds.length > 0) {
      const exceptions = await this.exceptionRepo.findBy({ id: In(exceptionIds) });
      exceptions.forEach((exception) => exceptionById.set(exception.id, exception));
    }

    const resolvedByKey = await this.loadResolvedExceptionsByKey(normalizedRows);

    return normalizedRows.map((row) => {
      let nextRow = { ...row };

      for (const check of this.buildRowChecks(row)) {
        if (!check.rawValue?.trim()) continue;
        if (check.normalizedCode) continue;

        const exceptionFromRow = row.taxonomy_exception_id ? exceptionById.get(row.taxonomy_exception_id) : null;
        const resolvedException =
          (exceptionFromRow && exceptionFromRow.status === 'resolved' && exceptionFromRow.resolvedCode && exceptionFromRow.type === check.type
            ? exceptionFromRow
            : null) ?? resolvedByKey.get(`${check.type}:${check.normalizedRawValue}`);

        if (!resolvedException?.resolvedCode) continue;

        if (check.type === 'fund') {
          nextRow = {
            ...nextRow,
            taxonomy_exception_id: resolvedException.id,
            normalized_fund: nextRow.normalized_fund ?? resolvedException.resolvedCode,
            resolution_source: 'reused_resolved_exception',
          };
        } else {
          nextRow = {
            ...nextRow,
            taxonomy_exception_id: resolvedException.id,
            normalized_appeal: nextRow.normalized_appeal ?? resolvedException.resolvedCode,
            resolution_source: 'reused_resolved_exception',
          };
        }
      }

      return nextRow;
    });
  }

  async queueTaxonomyExceptions(rows: any[]): Promise<any> {
    const normalizedRows = await this.hydrateResolvedExceptions(rows);
    const openExceptionsByKey = await this.loadOpenExceptionsByKey(normalizedRows);
    const violations: any[] = [];
    const touchedExceptions = new Map<string, ThTaxonomyException>();
    let resolvedCount = 0;
    let unmappedCount = 0;
    let exCount = await this.exceptionRepo.count();

    const queuedRows = [];
    for (const row of normalizedRows) {
      let taxonomyExceptionId = row.taxonomy_exception_id ?? null;

      for (const check of this.buildRowChecks(row)) {
        if (!check.rawValue?.trim()) continue;
        if (check.normalizedCode) {
          resolvedCount++;
          continue;
        }

        const key = `${check.type}:${check.normalizedRawValue}`;
        const existingOpen = openExceptionsByKey.get(key);
        if (existingOpen) {
          taxonomyExceptionId = taxonomyExceptionId ?? existingOpen.id;
          touchedExceptions.set(existingOpen.id, existingOpen);
          violations.push(this.buildViolation(row, check, existingOpen));
          unmappedCount++;
          continue;
        }

        const ruleSuggestedCode = this.buildRuleSuggestedCode(check);
        const ruleEvidence = this.buildRuleEvidence(row, check, ruleSuggestedCode);
        const sampleValues = this.buildSampleValues(row, check);
        let suggestedCode = ruleSuggestedCode;
        let aiSuggested = false;
        let aiReasoning: string | null = null;
        let aiSuggestion: Record<string, any> | null = null;

        if (!suggestedCode) {
          const aiResult = await this.ai.suggestTaxonomyCode({
            rawValue: String(check.rawValue || ''),
            type: check.type,
            registry: TAXONOMY_REGISTRY,
            legacyMappings: LEGACY_MAPPINGS,
            ruleEvidence,
            sampleValues,
          });
          if (aiResult) {
            suggestedCode = aiResult.code;
            aiSuggested = Boolean(aiResult.code);
            aiReasoning = aiResult.reasoning;
            aiSuggestion = {
              ...aiResult,
              generatedAt: new Date().toISOString(),
              ruleEvidence,
              sampleValues,
            };
          }
        }

        const exceptionId = 'EX-' + String(1000 + exCount++).padStart(4, '0');
        const exception = this.exceptionRepo.create({
          id: exceptionId,
          rawValue: check.rawValue,
          normalizedRawValue: check.normalizedRawValue,
          type: check.type,
          sourceRowRef: row.source_row_ref,
          sessionId: row.sessionId ?? null,
          status: 'open',
          resolvedCode: suggestedCode,
          notes: null,
          assignedTo: null,
          resolvedAt: null,
          aiSuggested,
          aiReasoning,
          ruleEvidence,
          sampleValues,
          aiSuggestion,
          aiReviewStatus: aiSuggestion ? 'pending' : null,
          aiReviewedAt: null,
          aiReviewedBy: null,
          aiRejectedReason: null,
        });
        await this.exceptionRepo.save(exception);
        openExceptionsByKey.set(key, exception);
        touchedExceptions.set(exception.id, exception);
        violations.push(this.buildViolation(row, check, exception));
        taxonomyExceptionId = taxonomyExceptionId ?? exceptionId;
        unmappedCount++;
      }

      queuedRows.push({ ...row, taxonomy_exception_id: taxonomyExceptionId });
    }

    return {
      rows: queuedRows,
      violations,
      exceptions: Array.from(touchedExceptions.values()).map((exception) => this.serializeException(exception)),
      resolvedCount,
      unmappedCount,
    };
  }

  async evaluateTaxonomy(rows: any[]): Promise<any> {
    const result = await this.queueTaxonomyExceptions(rows);
    return {
      violations: result.violations,
      exceptions: result.exceptions,
      resolvedCount: result.resolvedCount,
      unmappedCount: result.unmappedCount,
    };
  }

  async buildPreflightIssues(rows: any[]): Promise<any[]> {
    const normalizedRows = await this.hydrateResolvedExceptions(rows);
    const issues: any[] = [];

    normalizedRows.forEach((row) => {
      if (row.raw_fund && !row.normalized_fund) {
        issues.push({ rowId: row.id, severity: 'error', message: 'Unknown fund code remains unresolved: ' + row.raw_fund });
      }
      if (row.raw_appeal && !row.normalized_appeal) {
        issues.push({ rowId: row.id, severity: 'error', message: 'Unknown appeal code remains unresolved: ' + row.raw_appeal });
      }
      if (row.taxonomy_exception_id) {
        issues.push({ rowId: row.id, severity: 'error', message: 'Taxonomy exception ' + row.taxonomy_exception_id + ' must be resolved before posting.' });
      }
    });

    return issues;
  }

  async getTaxonomy(): Promise<any> {
    const dbExceptions = await this.exceptionRepo.find({ order: { createdAt: 'DESC' } });
    return { registry: TAXONOMY_REGISTRY, legacyMappings: LEGACY_MAPPINGS, exceptions: dbExceptions.map((exception) => this.serializeException(exception)) };
  }

  async reviewSuggestion(
    exceptionId: string,
    payload: { action: 'approve' | 'reject'; resolvedCode?: string; notes?: string; assignedTo?: string; reviewedBy?: string },
  ): Promise<any> {
    const exception = await this.exceptionRepo.findOne({ where: { id: exceptionId } });
    if (!exception) {
      throw new NotFoundException('Taxonomy exception ' + exceptionId + ' not found.');
    }

    const now = new Date();
    if (payload.action === 'approve') {
      const resolvedCode = payload.resolvedCode ?? exception.aiSuggestion?.code ?? exception.resolvedCode;
      if (!resolvedCode) {
        throw new BadRequestException('resolvedCode is required to approve a taxonomy suggestion.');
      }

      const updated = this.exceptionRepo.create({
        ...exception,
        normalizedRawValue: this.normalizeRawValue(exception.rawValue),
        status: 'resolved',
        resolvedCode,
        notes: payload.notes ?? exception.notes ?? null,
        assignedTo: payload.assignedTo ?? exception.assignedTo ?? null,
        resolvedAt: now,
        aiReviewStatus: 'approved',
        aiReviewedAt: now,
        aiReviewedBy: payload.reviewedBy ?? exception.aiReviewedBy ?? 'user',
        aiRejectedReason: null,
      });
      await this.exceptionRepo.save(updated);
      return { exception: this.serializeException(updated) };
    }

    const updated = this.exceptionRepo.create({
      ...exception,
      normalizedRawValue: this.normalizeRawValue(exception.rawValue),
      status: 'open',
      resolvedCode: null,
      notes: payload.notes ?? exception.notes ?? null,
      assignedTo: payload.assignedTo ?? exception.assignedTo ?? null,
      aiReviewStatus: 'rejected',
      aiReviewedAt: now,
      aiReviewedBy: payload.reviewedBy ?? exception.aiReviewedBy ?? 'user',
      aiRejectedReason: payload.notes ?? exception.aiRejectedReason ?? 'AI suggestion rejected by reviewer.',
    });
    await this.exceptionRepo.save(updated);
    return { exception: this.serializeException(updated) };
  }

  async resolveException(exceptionId: string, payload: { resolvedCode: string; notes?: string; assignedTo?: string }): Promise<any> {
    const exception = await this.exceptionRepo.findOne({ where: { id: exceptionId } });
    if (!exception) {
      throw new NotFoundException('Taxonomy exception ' + exceptionId + ' not found.');
    }

    const updated = this.exceptionRepo.create({
      ...exception,
      normalizedRawValue: this.normalizeRawValue(exception.rawValue),
      status: 'resolved',
      resolvedCode: payload.resolvedCode,
      notes: payload.notes ?? exception.notes ?? null,
      assignedTo: payload.assignedTo ?? exception.assignedTo ?? null,
      resolvedAt: new Date(),
    });

    await this.exceptionRepo.save(updated);
    return { exception: this.serializeException(updated) };
  }
}
