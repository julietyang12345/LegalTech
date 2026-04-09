import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { ThDecisionLog } from '../../database/entities/th-decision-log.entity';
import { ThMappingRule } from '../../database/entities/th-mapping-rule.entity';
import { ThNormalizedSourceRow } from '../../database/entities/th-normalized-source-row.entity';
import { ThRawColumn } from '../../database/entities/th-raw-column.entity';
import { ThRawImport } from '../../database/entities/th-raw-import.entity';
import { ThRawTable } from '../../database/entities/th-raw-table.entity';
import { ThSourceEvidence } from '../../database/entities/th-source-evidence.entity';
import { normalizeKey } from './transformhub-key-normalization';

@Injectable()
export class TransformHubStructureService {
  constructor(
    @InjectRepository(ThRawImport)
    private readonly rawImportRepo: Repository<ThRawImport>,
    @InjectRepository(ThRawTable)
    private readonly rawTableRepo: Repository<ThRawTable>,
    @InjectRepository(ThRawColumn)
    private readonly rawColumnRepo: Repository<ThRawColumn>,
    @InjectRepository(ThMappingRule)
    private readonly mappingRuleRepo: Repository<ThMappingRule>,
    @InjectRepository(ThNormalizedSourceRow)
    private readonly normalizedRowRepo: Repository<ThNormalizedSourceRow>,
    @InjectRepository(ThSourceEvidence)
    private readonly sourceEvidenceRepo: Repository<ThSourceEvidence>,
    @InjectRepository(ThDecisionLog)
    private readonly decisionLogRepo: Repository<ThDecisionLog>,
  ) {}

  private makeId(...parts: Array<string | number | null | undefined>) {
    return createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|')).digest('hex').slice(0, 24);
  }

  private dedupe<T>(values: T[]) {
    return Array.from(new Set(values));
  }

  private inferColumnType(values: string[]) {
    const nonEmpty = values.map((value) => String(value || '').trim()).filter(Boolean);
    if (nonEmpty.length === 0) return 'empty';
    if (nonEmpty.every((value) => /^[-+]?[\d,.]+$/.test(value))) return 'numeric';
    if (nonEmpty.every((value) => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?$/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value))) return 'date';
    if (nonEmpty.every((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) return 'email';
    return 'text';
  }

  private buildTableCandidates(parsedFile: any, schema: any) {
    const workbookSheets = Array.isArray(parsedFile?.workbookSheets) && parsedFile.workbookSheets.length > 0
      ? parsedFile.workbookSheets
      : [parsedFile];

    return workbookSheets.map((sheet: any, index: number) => ({
      id: this.makeId('raw-table', parsedFile?.fileName, sheet?.sheetName ?? 'base', index),
      tableName: sheet?.sheetName || parsedFile?.fileName || `table-${index + 1}`,
      sourceSheetName: sheet?.sheetName ?? parsedFile?.sourceSheetName ?? null,
      tableType: sheet?.sheetName === parsedFile?.sourceSheetName || workbookSheets.length === 1
        ? schema?.fileClass ?? sheet?.fileClass ?? null
        : sheet?.fileClass ?? null,
      classificationSource: schema?.aiSuggested ? 'ai_assisted' : 'deterministic',
      classificationConfidence: Number(schema?.confidence ?? 0),
      headers: Array.isArray(sheet?.headers) ? sheet.headers : [],
      rows: Array.isArray(sheet?.rows) ? sheet.rows : [],
      structureAnalysis: sheet?.structureAnalysis ?? parsedFile?.structureAnalysis ?? null,
    }));
  }

  private buildNormalizedRecords(parsedFile: any, schema: any, canonicalRows: any[]) {
    if (schema?.fileClass === 'ledger') {
      return canonicalRows.map((row) => ({
        sourceRowRef: row.source_row_ref,
        sourcePlatform: row.source_platform,
        normalizedPayload: row,
        mappingConfidence: Number(row.mapping_confidence ?? schema?.confidence ?? 0),
        canonicalPersonId: row.canonical_person_id ?? null,
        canonicalHouseholdId: row.canonical_household_id ?? null,
        canonicalDonationId: null,
      }));
    }

    const previewRecords = Array.isArray(parsedFile?.preview?.records) ? parsedFile.preview.records : [];
    return previewRecords.map((record: any) => ({
      sourceRowRef: record.sourceRowRef,
      sourcePlatform: parsedFile?.platform ?? null,
      normalizedPayload: record,
      mappingConfidence: Number(schema?.confidence ?? 0),
      canonicalPersonId: record.canonicalPersonId ?? null,
      canonicalHouseholdId: record.canonicalHouseholdId ?? null,
      canonicalDonationId: record.canonicalDonationId ?? null,
    }));
  }

  async resetSessionStructure(sessionId: string) {
    const rawImports = await this.rawImportRepo.find({ where: { sessionId }, select: ['id'] });
    const rawImportIds = rawImports.map((item) => item.id);
    const rawTables = rawImportIds.length > 0
      ? await this.rawTableRepo.find({ where: rawImportIds.map((rawImportId) => ({ rawImportId })), select: ['id'] })
      : [];
    const rawTableIds = rawTables.map((item) => item.id);

    await this.decisionLogRepo.delete({ sessionId });
    await this.sourceEvidenceRepo.delete({ sessionId });
    await this.normalizedRowRepo.delete({ sessionId });
    await this.mappingRuleRepo.delete({ sessionId });
    if (rawTableIds.length > 0) {
      await this.rawColumnRepo.delete(rawTableIds.map((rawTableId) => ({ rawTableId })));
    }
    if (rawImportIds.length > 0) {
      await this.rawTableRepo.delete(rawImportIds.map((rawImportId) => ({ rawImportId })));
    }
    await this.rawImportRepo.delete({ sessionId });
  }

  async persistSessionStructure(input: {
    sessionId: string;
    datasetId?: string | null;
    parsedFile: any;
    schema: any;
    guardrails?: any[];
    canonicalRows?: any[];
  }) {
    const { sessionId, datasetId = null, parsedFile, schema, guardrails = [], canonicalRows = [] } = input;

    await this.resetSessionStructure(sessionId);

    const rawImportId = this.makeId('raw-import', sessionId, parsedFile?.fileName, schema?.fingerprint);
    const tableCandidates = this.buildTableCandidates(parsedFile, schema);

    await this.rawImportRepo.save(this.rawImportRepo.create({
      id: rawImportId,
      sessionId,
      datasetId,
      platform: parsedFile?.platform ?? 'unknown',
      fileName: parsedFile?.fileName ?? 'upload',
      kind: parsedFile?.delimiter ?? parsedFile?.kind ?? null,
      sourceSheetName: parsedFile?.sourceSheetName ?? null,
      fingerprint: schema?.fingerprint ?? null,
      rowCount: Array.isArray(parsedFile?.rows) ? parsedFile.rows.length : 0,
      status: guardrails.some((guardrail: any) => guardrail?.triggered) ? 'review' : 'ingested',
      rawPayload: parsedFile,
      structureAnalysis: parsedFile?.structureAnalysis ?? null,
      workbookMeta: Array.isArray(parsedFile?.workbookSheets)
        ? {
            workbookSelectionRequired: Boolean(parsedFile?.workbookSelectionRequired),
            selectedWorkbookSheets: parsedFile?.selectedWorkbookSheets ?? [],
            sheets: parsedFile.workbookSheets.map((sheet: any) => ({
              sheetName: sheet?.sheetName ?? null,
              fileClass: sheet?.fileClass ?? null,
              rowCount: Array.isArray(sheet?.rows) ? sheet.rows.length : 0,
            })),
          }
        : null,
    }));

    const rowToTableMap = new Map<string, string>();
    const rawTables = tableCandidates.map((candidate) => {
      candidate.rows.forEach((row: any) => rowToTableMap.set(row.ref, candidate.id));
      return this.rawTableRepo.create({
        id: candidate.id,
        rawImportId,
        sessionId,
        tableName: candidate.tableName,
        sourceSheetName: candidate.sourceSheetName,
        tableType: candidate.tableType,
        classificationSource: candidate.classificationSource,
        classificationConfidence: candidate.classificationConfidence,
        rowCount: candidate.rows.length,
        columnCount: candidate.headers.length,
        headers: candidate.headers,
        preview: candidate.structureAnalysis ? { structureAnalysis: candidate.structureAnalysis } : null,
      });
    });
    await this.rawTableRepo.save(rawTables);

    const rawColumns = tableCandidates.flatMap((candidate) =>
      candidate.headers.map((header: string, index: number) => {
        const values = candidate.rows.map((row: any) => String(row?.values?.[header] ?? '')).filter((value: string) => value.trim().length > 0);
        const sampleValues = values.slice(0, 5);
        return this.rawColumnRepo.create({
          id: this.makeId('raw-column', candidate.id, header, index),
          rawImportId,
          rawTableId: candidate.id,
          sessionId,
          position: index,
          rawName: header,
          normalizedKey: normalizeKey(header).cleanedKey,
          inferredType: this.inferColumnType(sampleValues),
          nullRatio: candidate.rows.length === 0 ? 1 : Math.max(0, 1 - values.length / candidate.rows.length),
          sampleValues,
          profile: {
            distinctCount: this.dedupe(values).length,
            nonEmptyCount: values.length,
          },
        });
      }),
    );
    if (rawColumns.length > 0) {
      await this.rawColumnRepo.save(rawColumns);
    }

    const headerDiagnosticsByHeader = new Map(
      (schema?.headerDiagnostics ?? []).map((item: any) => [item.rawKey, item]),
    );
    const activeRuleIdsByTarget = new Map<string, string>();
    const mappingRules: ThMappingRule[] = [];

    Object.entries(schema?.fieldMap ?? {}).forEach(([targetField, sourceKey]) => {
      const sourceKeyValue = String(sourceKey || '');
      const isAi = Boolean(schema?.aiSuggestedFieldMap?.[targetField]);
      const ruleId = this.makeId('mapping-rule', sessionId, sourceKeyValue, targetField);
      activeRuleIdsByTarget.set(targetField, ruleId);
      mappingRules.push(this.mappingRuleRepo.create({
        id: ruleId,
        sessionId,
        orgId: null,
        scope: 'session',
        sourcePlatform: parsedFile?.platform ?? null,
        sourceFileClass: schema?.fileClass ?? null,
        ruleType: 'field_mapping',
        sourceKey: sourceKeyValue,
        targetField,
        confidence: Number(schema?.confidence ?? 0),
        origin: isAi ? 'ai_suggested' : 'deterministic',
        approvalStatus: isAi ? 'pending_review' : 'approved',
        active: true,
        version: 1,
        metadata: {
          headerDiagnostic: headerDiagnosticsByHeader.get(sourceKeyValue) ?? null,
          aiReasoning: isAi ? schema?.aiReasoning ?? null : null,
        },
      }));
    });

    (schema?.fieldSuggestions ?? []).forEach((suggestion: any) => {
      if (!suggestion?.suggestedTarget) return;
      mappingRules.push(this.mappingRuleRepo.create({
        id: this.makeId('mapping-rule-candidate', sessionId, suggestion.rawKey, suggestion.suggestedTarget),
        sessionId,
        orgId: null,
        scope: 'session',
        sourcePlatform: parsedFile?.platform ?? null,
        sourceFileClass: schema?.fileClass ?? null,
        ruleType: 'field_mapping_candidate',
        sourceKey: String(suggestion.rawKey),
        targetField: String(suggestion.suggestedTarget),
        confidence: suggestion.confidence === 'high' ? 0.9 : suggestion.confidence === 'medium' ? 0.7 : 0.5,
        origin: suggestion.model ? 'ai_candidate' : 'rule_candidate',
        approvalStatus: suggestion.status === 'approved' ? 'approved' : suggestion.status === 'rejected' ? 'rejected' : 'pending_review',
        active: suggestion.status === 'approved',
        version: 1,
        metadata: {
          reasoning: suggestion.reasoning ?? null,
          evidence: suggestion.evidence ?? [],
          model: suggestion.model ?? null,
        },
      }));
    });
    if (mappingRules.length > 0) {
      await this.mappingRuleRepo.save(mappingRules);
    }

    const sourceRowsByRef = new Map<string, any>(
      (parsedFile?.rows ?? []).map((row: any) => [row.ref, row] as [string, any]),
    );
    const normalizedRows = this.buildNormalizedRecords(parsedFile, schema, canonicalRows).map((row) => {
      const sourceRow = sourceRowsByRef.get(row.sourceRowRef);
      const mappedByRuleIds = this.dedupe(
        Object.entries(schema?.fieldMap ?? {})
          .filter(([, sourceKey]) => Boolean(sourceRow?.values?.[String(sourceKey)]))
          .map(([targetField]) => activeRuleIdsByTarget.get(targetField))
          .filter((ruleId): ruleId is string => Boolean(ruleId)),
      );
      return this.normalizedRowRepo.create({
        id: this.makeId('normalized-row', sessionId, row.sourceRowRef),
        sessionId,
        rawImportId,
        rawTableId: rowToTableMap.get(row.sourceRowRef) ?? null,
        sourceRowRef: row.sourceRowRef,
        sourcePlatform: row.sourcePlatform,
        sourceFileClass: schema?.fileClass ?? null,
        mappedByRuleIds,
        mappingConfidence: row.mappingConfidence,
        status: 'normalized',
        normalizedPayload: row.normalizedPayload,
        canonicalPersonId: row.canonicalPersonId,
        canonicalHouseholdId: row.canonicalHouseholdId,
        canonicalDonationId: row.canonicalDonationId,
      });
    });
    if (normalizedRows.length > 0) {
      await this.normalizedRowRepo.save(normalizedRows);
    }

    const decisionLogs = [
      this.decisionLogRepo.create({
        id: this.makeId('decision', sessionId, 'table-classification'),
        sessionId,
        rawImportId,
        normalizedRowId: null,
        decisionType: 'table_classification',
        decisionLevel: 'system',
        decisionMode: schema?.aiSuggested ? 'needs_review' : 'auto_applied',
        status: schema?.aiSuggested ? 'pending_review' : 'applied',
        actorType: schema?.aiSuggested ? 'ai' : 'system',
        actorId: null,
        targetType: 'raw_import',
        targetId: rawImportId,
        confidence: Number(schema?.confidence ?? 0),
        summary: `Classified import as ${schema?.fileClass ?? 'unknown'}.`,
        rationale: {
          aiReasoning: schema?.aiReasoning ?? null,
          unresolvedFields: schema?.unresolvedFields ?? [],
        },
        payload: {
          reportType: schema?.reportType ?? null,
          canonicalModel: schema?.canonicalModel ?? null,
        },
      }),
      ...mappingRules
        .filter((rule) => rule.active)
        .map((rule) =>
          this.decisionLogRepo.create({
            id: this.makeId('decision', sessionId, 'mapping', rule.id),
            sessionId,
            rawImportId,
            normalizedRowId: null,
            decisionType: 'field_mapping',
            decisionLevel: 'system',
            decisionMode: rule.approvalStatus === 'pending_review' ? 'needs_review' : 'auto_applied',
            status: rule.approvalStatus === 'pending_review' ? 'pending_review' : 'applied',
            actorType: rule.origin.startsWith('ai') ? 'ai' : 'system',
            actorId: null,
            targetType: 'mapping_rule',
            targetId: rule.id,
            confidence: rule.confidence,
            summary: `Mapped ${rule.sourceKey} to ${rule.targetField}.`,
            rationale: rule.metadata,
            payload: {
              scope: rule.scope,
              sourcePlatform: rule.sourcePlatform,
              sourceFileClass: rule.sourceFileClass,
            },
          }),
        ),
      ...guardrails
        .filter((guardrail: any) => guardrail?.triggered)
        .map((guardrail: any) =>
          this.decisionLogRepo.create({
            id: this.makeId('decision', sessionId, 'guardrail', guardrail.code),
            sessionId,
            rawImportId,
            normalizedRowId: null,
            decisionType: 'guardrail',
            decisionLevel: 'system',
            decisionMode: 'needs_review',
            status: 'surfaced',
            actorType: 'system',
            actorId: null,
            targetType: 'raw_import',
            targetId: rawImportId,
            confidence: null,
            summary: guardrail.label ?? guardrail.code,
            rationale: { detail: guardrail.detail ?? null },
            payload: guardrail,
          }),
        ),
    ];
    await this.decisionLogRepo.save(decisionLogs);

    return {
      rawImportId,
      rawTableIds: rawTables.map((table) => table.id),
      normalizedRowIds: normalizedRows.map((row) => row.id),
    };
  }

  async persistCanonicalEvidence(sessionId: string, payload: {
    rows?: Array<{ source_row_ref?: string; raw_fund?: string | null; raw_appeal?: string | null; canonical_person_id?: string | null; canonical_household_id?: string | null }>;
    donations?: Array<{ id: string; rowId?: string | null; fund?: string | null; appeal?: string | null }>;
    households?: Array<{ id: string; memberIds?: string[] }>;
  }) {
    const normalizedRows = await this.normalizedRowRepo.find({ where: { sessionId } });
    const normalizedBySourceRowRef = new Map(normalizedRows.map((row) => [row.sourceRowRef, row]));
    const evidences: ThSourceEvidence[] = [];

    (payload.rows ?? []).forEach((row) => {
      const normalizedRow = normalizedBySourceRowRef.get(String(row.source_row_ref ?? ''));
      if (!normalizedRow) return;

      if (row.canonical_person_id) {
        evidences.push(this.sourceEvidenceRepo.create({
          id: this.makeId('evidence', sessionId, 'person', row.canonical_person_id, normalizedRow.id),
          sessionId,
          canonicalEntityType: 'person',
          canonicalEntityId: row.canonical_person_id,
          evidenceType: 'normalized_row',
          normalizedRowId: normalizedRow.id,
          rawImportId: normalizedRow.rawImportId,
          rawTableId: normalizedRow.rawTableId,
          sourceRowRef: normalizedRow.sourceRowRef,
          fieldName: null,
          rawValue: null,
          normalizedValue: null,
          confidence: normalizedRow.mappingConfidence,
          metadata: {},
        }));
      }

      if (row.canonical_household_id) {
        evidences.push(this.sourceEvidenceRepo.create({
          id: this.makeId('evidence', sessionId, 'household', row.canonical_household_id, normalizedRow.id),
          sessionId,
          canonicalEntityType: 'household',
          canonicalEntityId: row.canonical_household_id,
          evidenceType: 'normalized_row',
          normalizedRowId: normalizedRow.id,
          rawImportId: normalizedRow.rawImportId,
          rawTableId: normalizedRow.rawTableId,
          sourceRowRef: normalizedRow.sourceRowRef,
          fieldName: null,
          rawValue: null,
          normalizedValue: null,
          confidence: normalizedRow.mappingConfidence,
          metadata: {},
        }));
      }
    });

    (payload.donations ?? []).forEach((donation) => {
      const normalizedRow = donation.rowId ? normalizedBySourceRowRef.get(donation.rowId) : null;
      evidences.push(this.sourceEvidenceRepo.create({
        id: this.makeId('evidence', sessionId, 'donation', donation.id, donation.rowId),
        sessionId,
        canonicalEntityType: 'donation',
        canonicalEntityId: donation.id,
        evidenceType: 'materialized_entity',
        normalizedRowId: normalizedRow?.id ?? null,
        rawImportId: normalizedRow?.rawImportId ?? null,
        rawTableId: normalizedRow?.rawTableId ?? null,
        sourceRowRef: donation.rowId ?? null,
        fieldName: 'fund_appeal',
        rawValue: [donation.fund, donation.appeal].filter(Boolean).join(' / ') || null,
        normalizedValue: [donation.fund, donation.appeal].filter(Boolean).join(' / ') || null,
        confidence: normalizedRow?.mappingConfidence ?? 0,
        metadata: {},
      }));
    });

    const uniqueEvidence = new Map<string, ThSourceEvidence>();
    evidences.forEach((evidence) => uniqueEvidence.set(evidence.id, evidence));
    if (uniqueEvidence.size > 0) {
      await this.sourceEvidenceRepo.save([...uniqueEvidence.values()]);
    }
  }

  private toReviewQueueItem(entry: ThDecisionLog) {
    const score = Math.max(0, Math.min(100, Math.round((entry.confidence ?? 0) * 100)));
    return {
      id: entry.id,
      inputKey: entry.summary ?? entry.targetId ?? null,
      candidatePersonId: entry.targetType === 'person' ? entry.targetId ?? null : null,
      score,
      isHighConfidence: score >= 85,
      isDriftAlert: entry.decisionType === 'guardrail',
      displayNameA: entry.summary ?? entry.decisionType,
      displayNameB: entry.targetType ? `${entry.targetType}${entry.targetId ? `:${entry.targetId}` : ''}` : null,
      evidenceFields: Object.keys(entry.rationale ?? {}),
      status: entry.status === 'pending_review' || entry.status === 'surfaced' ? 'pending' : entry.status === 'rejected' ? 'kept_separate' : 'approved',
      resolvedAt: entry.status === 'applied' || entry.status === 'rejected' ? entry.updatedAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      source: 'decision_log',
      decisionType: entry.decisionType,
      decisionMode: entry.decisionMode,
      actorType: entry.actorType,
      targetType: entry.targetType,
      targetId: entry.targetId,
      confidence: entry.confidence,
    };
  }

  async getSessionStructure(sessionId: string) {
    const rawImports = await this.rawImportRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const rawImportIds = rawImports.map((item) => item.id);
    const rawTables = rawImportIds.length > 0
      ? await this.rawTableRepo.find({ where: rawImportIds.map((rawImportId) => ({ rawImportId })), order: { createdAt: 'ASC' } })
      : [];
    const rawTableIds = rawTables.map((item) => item.id);
    const rawColumns = rawTableIds.length > 0
      ? await this.rawColumnRepo.find({ where: rawTableIds.map((rawTableId) => ({ rawTableId })), order: { rawTableId: 'ASC', position: 'ASC' } })
      : [];
    const mappingRules = await this.mappingRuleRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const normalizedRows = await this.normalizedRowRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const sourceEvidence = await this.sourceEvidenceRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const decisionLog = await this.decisionLogRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });

    const reviewBuckets = {
      autoApplied: decisionLog.filter((entry) => entry.decisionMode === 'auto_applied' && entry.status === 'applied').length,
      highConfidence: decisionLog.filter((entry) => (entry.confidence ?? 0) >= 0.85 && entry.status !== 'rejected').length,
      needsReview: decisionLog.filter((entry) => entry.decisionMode === 'needs_review' || entry.status === 'pending_review' || entry.status === 'surfaced').length,
    };

    return {
      rawImports,
      rawTables,
      rawColumns,
      mappingRules,
      normalizedRows,
      sourceEvidence,
      decisionLog,
      reviewBuckets,
    };
  }

  async getDecisionReviewQueue(limit = 20) {
    const entries = await this.decisionLogRepo.find({
      where: [
        { decisionMode: 'needs_review' as any },
        { status: 'pending_review' as any },
        { status: 'surfaced' as any },
      ],
      order: { confidence: 'DESC', createdAt: 'ASC' },
      take: limit,
    });
    return entries.map((entry) => this.toReviewQueueItem(entry));
  }

  async getDecisionReviewSummary() {
    const decisionLog = await this.decisionLogRepo.find({
      where: [
        { decisionMode: 'needs_review' as any },
        { status: 'pending_review' as any },
        { status: 'surfaced' as any },
      ],
    });
    return {
      pendingCount: decisionLog.length,
      highConfidenceCount: decisionLog.filter((entry) => (entry.confidence ?? 0) >= 0.85).length,
      driftAlertCount: decisionLog.filter((entry) => entry.decisionType === 'guardrail').length,
    };
  }

  async resolveDecisionLogItem(
    itemId: string,
    action: 'approved' | 'kept_separate',
    actorId = 'user',
    notes?: string | null,
  ) {
    const entry = await this.decisionLogRepo.findOne({ where: { id: itemId } });
    if (!entry) return null;
    entry.status = action === 'approved' ? 'applied' : 'rejected';
    entry.decisionMode = action === 'approved' && (entry.confidence ?? 0) >= 0.85 ? 'high_confidence' : entry.decisionMode;
    entry.actorType = 'user';
    entry.actorId = actorId;
    entry.rationale = {
      ...(entry.rationale ?? {}),
      reviewAction: action,
      reviewNotes: notes ?? null,
    };
    await this.decisionLogRepo.save(entry);
    return this.toReviewQueueItem(entry);
  }

  async getDecisionLogEntry(itemId: string) {
    return this.decisionLogRepo.findOne({ where: { id: itemId } });
  }

  async getMappingRule(ruleId: string) {
    return this.mappingRuleRepo.findOne({ where: { id: ruleId } });
  }

  async updateMappingRule(ruleId: string, patch: Partial<ThMappingRule>) {
    await this.mappingRuleRepo.update(ruleId, patch);
    return this.getMappingRule(ruleId);
  }

  async appendDecisionLog(input: Partial<ThDecisionLog> & { id?: string; decisionType: string }) {
    const entity = this.decisionLogRepo.create({
      id: input.id ?? this.makeId('decision-manual', input.sessionId, input.decisionType, input.targetId, Date.now()),
      sessionId: input.sessionId ?? null,
      rawImportId: input.rawImportId ?? null,
      normalizedRowId: input.normalizedRowId ?? null,
      decisionType: input.decisionType,
      decisionLevel: input.decisionLevel ?? 'system',
      decisionMode: input.decisionMode ?? 'auto_applied',
      status: input.status ?? 'applied',
      actorType: input.actorType ?? 'system',
      actorId: input.actorId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      confidence: input.confidence ?? null,
      summary: input.summary ?? null,
      rationale: input.rationale ?? {},
      payload: input.payload ?? {},
    });
    return this.decisionLogRepo.save(entity);
  }

  async recordResolutionDecisions(sessionId: string, input: {
    resolutionType: 'person_match' | 'household_resolution';
    matches: Array<Record<string, unknown>>;
  }) {
    const normalizedRows = await this.normalizedRowRepo.find({ where: { sessionId } });
    const normalizedBySourceRowRef = new Map(normalizedRows.map((row) => [row.sourceRowRef, row]));
    const entries = input.matches.map((match) => {
      const sourceRowRef = String(match.inputRef ?? '');
      const normalizedRow = normalizedBySourceRowRef.get(sourceRowRef);
      const matchedId = String(match.matchedPersonId ?? match.householdId ?? '');
      const score = typeof match.score === 'number' ? match.score : null;
      return this.decisionLogRepo.create({
        id: this.makeId('decision', sessionId, input.resolutionType, sourceRowRef, matchedId),
        sessionId,
        rawImportId: normalizedRow?.rawImportId ?? null,
        normalizedRowId: normalizedRow?.id ?? null,
        decisionType: input.resolutionType,
        decisionLevel: 'resolution',
        decisionMode: score !== null && score < 0.85 ? 'needs_review' : 'auto_applied',
        status: matchedId ? 'applied' : 'pending_review',
        actorType: 'system',
        actorId: null,
        targetType: input.resolutionType === 'person_match' ? 'person' : 'household',
        targetId: matchedId || null,
        confidence: score,
        summary: sourceRowRef,
        rationale: { match },
        payload: match,
      });
    });
    if (entries.length > 0) {
      await this.decisionLogRepo.save(entries);
    }
  }
}
