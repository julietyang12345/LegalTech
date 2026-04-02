import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ThTransformSession, TransformSessionStatus } from '../../database/entities/th-transform-session.entity';
import { ThCanonicalRow } from '../../database/entities/th-canonical-row.entity';
import { ThAuditRun } from '../../database/entities/th-audit-run.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';
import { TransformHubPipelineService } from './transformhub-pipeline.service';
import { TransformHubIdentityService } from './transformhub-identity.service';
import { TransformHubTaxonomyService } from './transformhub-taxonomy.service';
import { TransformHubEntityModelService } from './transformhub-entity-model.service';
import { TransformHubRoutingService } from './transformhub-routing.service';
import { TransformHubOutputService } from './transformhub-output.service';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';
import { TransformHubAiService } from './transformhub-ai.service';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from './transformhub.constants';

// LOW_REPORT_CONFIDENCE is a schema-quality warning, not a data-correctness blocker.
// It is intentionally excluded so constituent exports, contact lists, and low-confidence
// files can still be ingested — the user sees the warning and decides.
const HARD_STOP_GUARDRAILS = new Set([
  'AMOUNT_COLUMN_AMBIGUITY',
  'MIXED_AMOUNT_SHAPES',
]);

@Injectable()
export class TransformHubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransformHubService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(ThTransformSession)
    private readonly sessionRepo: Repository<ThTransformSession>,
    @InjectRepository(ThCanonicalRow)
    private readonly rowRepo: Repository<ThCanonicalRow>,
    @InjectRepository(ThAuditRun)
    private readonly auditRunRepo: Repository<ThAuditRun>,
    @InjectRepository(ThAuditDecision)
    private readonly auditDecisionRepo: Repository<ThAuditDecision>,
    private readonly pipeline: TransformHubPipelineService,
    private readonly identity: TransformHubIdentityService,
    private readonly taxonomy: TransformHubTaxonomyService,
    private readonly entityModelService: TransformHubEntityModelService,
    private readonly routing: TransformHubRoutingService,
    private readonly output: TransformHubOutputService,
    private readonly auditEngine: TransformHubAuditRuleEngineService,
    private readonly ai: TransformHubAiService,
  ) {}

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.scrubExpiredSessionArtifacts();
    }, 24 * 60 * 60 * 1000);
    void this.scrubExpiredSessionArtifacts();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private buildScrubbedParsedFile(session: ThTransformSession) {
    const current = (session.parsedFile as Record<string, any> | null) ?? {};
    return {
      scrubbed: true,
      scrubbedAt: new Date().toISOString(),
      fileName: session.fileName,
      platform: session.platform,
      kind: current.kind ?? null,
      rowCount: current.rowCount ?? current.rows?.length ?? null,
      headers: Array.isArray(current.headers) ? current.headers : [],
    };
  }

  private buildScrubbedSchema(session: ThTransformSession) {
    const current = (session.schema as Record<string, any> | null) ?? {};
    return {
      fileClass: current.fileClass ?? null,
      fingerprint: session.fingerprint ?? current.fingerprint ?? null,
      fieldMap: current.fieldMap ?? {},
      scrubbed: true,
      scrubbedAt: new Date().toISOString(),
      fieldSuggestions: [],
    };
  }

  private async scrubExpiredSessionArtifacts() {
    const now = Date.now();
    const finishedCutoff = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const staleReviewCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const deletefinishedCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const deleteReviewCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000);

    // Step 1: scrub large fields from sessions past the scrub threshold
    const sessions = await this.sessionRepo.find({
      where: [
        { status: In([TransformSessionStatus.READY, TransformSessionStatus.POSTED, TransformSessionStatus.BLOCKED]), updatedAt: LessThan(finishedCutoff) },
        { status: TransformSessionStatus.REVIEW, updatedAt: LessThan(staleReviewCutoff) },
      ],
      take: 200,
      order: { updatedAt: 'ASC' },
    });
    if (sessions.length > 0) {
      const scrubbed = sessions
        .filter((session) => session.personResult || session.householdResult || session.preflight || !((session.parsedFile as any)?.scrubbed) || !((session.schema as any)?.scrubbed) || ((session.schema as any)?.fieldSuggestions?.length ?? 0) > 0)
        .map((session) => ({
          ...session,
          parsedFile: this.buildScrubbedParsedFile(session),
          schema: this.buildScrubbedSchema(session),
          preflight: null,
          personResult: null,
          householdResult: null,
          taxonomyState: null,
        }));
      if (scrubbed.length > 0) {
        await this.sessionRepo.save(scrubbed);
        await this.rowRepo.update(
          { sessionId: In(scrubbed.map((session) => session.id)) },
          { canonical_person_id: null, canonical_household_id: null },
        );
        this.logger.log(`Scrubbed ${scrubbed.length} stale TransformHub session payload(s).`);
      }
    }

    // Step 2: hard-delete sessions past the delete threshold
    const expiredSessions = await this.sessionRepo.find({
      where: [
        { status: In([TransformSessionStatus.READY, TransformSessionStatus.POSTED, TransformSessionStatus.BLOCKED]), updatedAt: LessThan(deletefinishedCutoff) },
        { status: TransformSessionStatus.REVIEW, updatedAt: LessThan(deleteReviewCutoff) },
      ],
      select: ['id'],
      take: 200,
      order: { updatedAt: 'ASC' },
    });
    if (expiredSessions.length > 0) {
      const expiredIds = expiredSessions.map((s) => s.id);
      await this.rowRepo.delete({ sessionId: In(expiredIds) });
      await this.auditRunRepo.delete({ sessionId: In(expiredIds) });
      await this.auditDecisionRepo.delete({ sessionId: In(expiredIds) });
      await this.sessionRepo.delete(expiredIds);
      this.logger.log(`Deleted ${expiredSessions.length} expired TransformHub session(s).`);
    }
  }

  healthCheck() {
    return { ok: true, service: 'transformhub', timestamp: new Date().toISOString() };
  }

  private buildBlockingIssues(hardStops: any[]) {
    return hardStops.map((guardrail: any) => ({
      code: guardrail.code,
      severity: 'error',
      scope: 'file',
      reason: guardrail.label ?? guardrail.code,
      detail: guardrail.detail,
    }));
  }

  private async findExistingSessionForForceIngest(sessionId?: string) {
    if (!sessionId) return null;
    return this.sessionRepo.findOne({ where: { id: sessionId } });
  }


  getChartOfAccounts() {
    return { chartOfAccounts: this.pipeline.getChartOfAccounts() };
  }

  getSampleFile(platform: string) {
    return this.pipeline.getSampleFile(platform || 'AppFolio');
  }

  async ingest(body: any) {
    const parsedFile = await this.pipeline.parseInboundFile(body);
    if (parsedFile.workbookSelectionRequired) {
      return {
        sessionId: null,
        status: TransformSessionStatus.REVIEW,
        parsedFile,
        schema: null,
        guardrails: [],
        blockingIssues: [],
        rows: [],
      };
    }
    this.assertRowCount(parsedFile.rows, 'ingest');
    const schema = await this.pipeline.resolveSchema(parsedFile);
    await this.pipeline.persistResolvedTemplate(parsedFile.platform, schema);
    const guardrails = this.pipeline.evaluateGuardrails(parsedFile, schema);
    parsedFile.preview = this.pipeline.buildStructuredPreview(parsedFile, schema);
    const hardStops = guardrails.filter((guardrail: any) => guardrail.triggered && HARD_STOP_GUARDRAILS.has(guardrail.code));
    const blockingIssues = this.buildBlockingIssues(hardStops);
    const existingSession = body.forceIngest ? await this.findExistingSessionForForceIngest(body.sessionId) : null;

    if (hardStops.length > 0 && !body.forceIngest) {
      const blockedSession = this.sessionRepo.create({
        status: TransformSessionStatus.BLOCKED,
        fileName: parsedFile.fileName,
        platform: parsedFile.platform,
        parsedFile,
        schema,
        guardrails,
        blockingIssues,
        preflight: null,
        receipts: [],
        personResult: null,
        householdResult: null,
        taxonomyState: null,
        fingerprint: schema.fingerprint,
        forcedFromStatus: null,
        forcedBlockingIssuesSnapshot: null,
        forcedAt: null,
      });
      await this.sessionRepo.save(blockedSession);

      return {
        sessionId: blockedSession.id,
        status: TransformSessionStatus.BLOCKED,
        parsedFile,
        schema,
        guardrails,
        blockingIssues,
        rows: [],
      };
    }

    const session = existingSession
      ? Object.assign(existingSession, {
          status: TransformSessionStatus.REVIEW,
          fileName: parsedFile.fileName,
          platform: parsedFile.platform,
          parsedFile,
          schema,
          guardrails,
          blockingIssues,
          preflight: null,
          receipts: [],
          personResult: null,
          householdResult: null,
          taxonomyState: null,
          fingerprint: schema.fingerprint,
          forcedFromStatus: existingSession.status,
          forcedBlockingIssuesSnapshot: existingSession.blockingIssues ?? blockingIssues,
          forcedAt: new Date(),
        })
      : this.sessionRepo.create({
          status: TransformSessionStatus.REVIEW,
          fileName: parsedFile.fileName,
          platform: parsedFile.platform,
          parsedFile,
          schema,
          guardrails,
          blockingIssues,
          preflight: null,
          receipts: [],
          personResult: null,
          householdResult: null,
          taxonomyState: null,
          fingerprint: schema.fingerprint,
          forcedFromStatus: null,
          forcedBlockingIssuesSnapshot: null,
          forcedAt: null,
        });
    await this.sessionRepo.save(session);

    if (existingSession) {
      await this.rowRepo.delete({ sessionId: session.id });
    }

    if (schema.fileClass !== 'ledger') {
      return {
        sessionId: session.id,
        status: session.status,
        parsedFile,
        schema,
        guardrails,
        blockingIssues,
        rows: [],
      };
    }

    const canonicalRows = this.pipeline.mapToCanonicalRows(parsedFile, schema, guardrails);
    const taxonomyQueue = await this.taxonomy.queueTaxonomyExceptions(canonicalRows);
    const rows = await this.enrichSuggestedFixes(taxonomyQueue.rows);
    const rowEntities = this.rowRepo.create(rows.map((row: any) => ({ ...row, sessionId: session.id })));
    await this.rowRepo.save(rowEntities);
    const audit = await this.auditRules({ rows, sessionId: session.id });

    return {
      sessionId: session.id,
      status: session.status,
      parsedFile,
      schema,
      guardrails,
      blockingIssues,
      rows,
      taxonomy: {
        violations: taxonomyQueue.violations,
        exceptions: taxonomyQueue.exceptions,
        resolvedCount: taxonomyQueue.resolvedCount,
        unmappedCount: taxonomyQueue.unmappedCount,
      },
      audit,
    };
  }

  async runPreflight(body: any) {
    this.assertRowCount(body.rows, 'preflight');
    if (body.sessionId) {
      if (body.rows?.length > 0) await this.updateSessionRows(body.sessionId, body.rows);
      const audit = await this.previewAuditForSession(body.sessionId, body.rows);
      const preflight = await this.buildCombinedPreflight(body.rows, audit);
      await this.sessionRepo.update(body.sessionId, {
        preflight,
        status: preflight.valid ? TransformSessionStatus.READY : TransformSessionStatus.REVIEW,
      });
      return { ...preflight, audit };
    }

    const audit = await this.auditRules({ rows: body.rows, persist: false });
    const preflight = await this.buildCombinedPreflight(body.rows, audit);
    return { ...preflight, audit };
  }

  async csvFallback(body: any) {
    this.assertRowCount(body.rows, 'csv-fallback');
    const result = this.pipeline.buildCsvFallback(body.rows);

    if (body.sessionId) {
      await this.sessionRepo.update(body.sessionId, { preflight: result.preflight });
      const audit = await this.previewAuditForSession(body.sessionId, body.rows);
      return { ...result, audit };
    }

    return result;
  }

  async postSimulate(body: any) {
    this.assertRowCount(body.rows, 'post-simulate');
    const audit = body.sessionId
      ? await this.previewAuditForSession(body.sessionId, body.rows)
      : await this.auditRules({ rows: body.rows, persist: false });
    const preflight = await this.buildCombinedPreflight(body.rows, audit);
    if (!preflight.valid) {
      throw new BadRequestException({
        message: 'Pre-flight failed. Resolve balance, chart-of-accounts, taxonomy, and audit errors before posting.',
        preflight,
        audit,
      });
    }

    const sessionPostingCount = body.sessionId
      ? await this.rowRepo.count({ where: { sessionId: body.sessionId, review_status: 'approved' } })
      : 0;

    const result = this.pipeline.simulatePost(body.rows, sessionPostingCount);

    if (body.sessionId) {
      await this.sessionRepo.update(body.sessionId, {
        status: TransformSessionStatus.POSTED,
        receipts: result.receipts,
        preflight,
      });
      await this.updateSessionRows(body.sessionId, result.rows);
      const nextAudit = await this.previewAuditForSession(body.sessionId, result.rows);
      return { ...result, preflight, audit: nextAudit };
    }

    return { ...result, preflight, audit };
  }

  private normalizeSchemaFieldSuggestions(schema: any) {
    if (!schema) return schema;
    return {
      ...schema,
      fieldSuggestions: Array.isArray(schema.fieldSuggestions) ? schema.fieldSuggestions : [],
    };
  }

  async getSession(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId }, relations: ['rows'] });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');
    const auditDecisions = await this.auditDecisionRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    return { ...session, schema: this.normalizeSchemaFieldSuggestions(session.schema), auditDecisions };
  }

  async updateSession(sessionId: string, body: any) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');

    if (body.status) {
      await this.sessionRepo.update(sessionId, { status: body.status });
    }
    if (body.preflight) {
      await this.sessionRepo.update(sessionId, { preflight: body.preflight });
    }
    if (body.parsedFile !== undefined) {
      await this.sessionRepo.update(sessionId, { parsedFile: body.parsedFile });
    }
    if (body.schema !== undefined) {
      await this.sessionRepo.update(sessionId, { schema: body.schema });
    }
    if (body.personResult !== undefined) {
      await this.sessionRepo.update(sessionId, { personResult: body.personResult });
    }
    if (body.householdResult !== undefined) {
      await this.sessionRepo.update(sessionId, { householdResult: body.householdResult });
    }
    if (body.taxonomyState !== undefined) {
      await this.sessionRepo.update(sessionId, { taxonomyState: body.taxonomyState });
    }
    if (body.rows?.length > 0) {
      await this.updateSessionRows(sessionId, body.rows);
    }
    const refreshedSession = await this.getSession(sessionId);
    const parsedFile = refreshedSession.parsedFile as any;
    const schema = refreshedSession.schema as any;
    const personResult = refreshedSession.personResult as any;
    const householdResult = refreshedSession.householdResult as any;
    if (
      schema?.fileClass &&
      schema.fileClass !== 'ledger' &&
      Array.isArray(parsedFile?.preview?.records) &&
      personResult &&
      householdResult
    ) {
      await this.entityModelService.buildEntityModelFromPreview(
        parsedFile.preview.records,
        personResult.persons || personResult.canonicalPersons || [],
        householdResult.households || [],
        sessionId,
        true,
      );
    }

    return this.getSession(sessionId);
  }

  async getAuditLog() {
    return this.sessionRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getAuditRuns(sessionId: string) {
    return this.auditRunRepo.find({ where: { sessionId }, order: { createdAt: 'DESC' } });
  }

  getAuditRuleCatalog() {
    return {
      engineVersion: this.auditEngine.getVersion(),
      ruleCatalog: this.auditEngine.getCatalog(),
    };
  }

  async personResolve(body: any) {
    this.assertRowCount(body.rows, 'person-resolve');
    const result = await this.identity.resolvePersons(body.rows, body.existingPersons, {
      usePersistentIdentityMemory: body.usePersistentIdentityMemory === true,
      forceReviewOnAutoMatches: body.forceReviewOnAutoMatches === true,
      seedExistingPersonsFromDb: body.seedExistingPersonsFromDb === true,
      baselinePlatform: body.baselinePlatform,
      baselineFileClass: body.baselineFileClass,
      persistIdentityMemory: body.persistIdentityMemory,
      includeAiSuggestions: body.includeAiSuggestions !== false,
    });

    if (!body.sessionId) {
      return result;
    }

    const sessionRows = await this.rowRepo.find({ where: { sessionId: body.sessionId } });
    const matchByRef = new Map<string, string>();
    result.matches.forEach((match: any) => {
      if (match.matchedPersonId) {
        matchByRef.set(match.inputRef, match.matchedPersonId);
      }
    });

    const updatedRows = sessionRows.map((row) => {
      const canonicalPersonId = matchByRef.get(row.source_row_ref) ?? row.canonical_person_id;
      return canonicalPersonId ? { ...row, canonical_person_id: canonicalPersonId } : row;
    });

    await this.rowRepo.save(updatedRows);
    await this.sessionRepo.update(body.sessionId, {
      personResult: {
        ...result,
        updatedRows: undefined,
        audit: undefined,
      },
      householdResult: null,
    });
    const audit = await this.previewAuditForSession(body.sessionId, updatedRows);
    return { ...result, updatedRows, audit };
  }

  async householdResolve(body: any) {
    const result = await this.identity.resolveHouseholds(body.persons, {
      usePersistentHouseholdMemory: body.usePersistentHouseholdMemory === true || Boolean(body.sessionId),
    });

    if (!body.sessionId) {
      return result;
    }

    const householdByMemberId = new Map<string, string>();
    result.households.forEach((household: any) => {
      household.memberIds.forEach((memberId: string) => householdByMemberId.set(memberId, household.id));
    });

    const sessionRows = await this.rowRepo.find({ where: { sessionId: body.sessionId } });
    const updatedRows = sessionRows.map((row) => {
      const canonicalHouseholdId = row.canonical_person_id
        ? householdByMemberId.get(row.canonical_person_id) ?? row.canonical_household_id
        : row.canonical_household_id;
      return canonicalHouseholdId ? { ...row, canonical_household_id: canonicalHouseholdId } : row;
    });

    await this.rowRepo.save(updatedRows);
    await this.sessionRepo.update(body.sessionId, {
      householdResult: {
        ...result,
        updatedRows: undefined,
        audit: undefined,
      },
    });
    const audit = await this.previewAuditForSession(body.sessionId, updatedRows);
    return { ...result, updatedRows, audit };
  }

  async persistMergeDecision(body: any) {
    if (!body.sessionId) throw new BadRequestException('sessionId is required to persist merge decisions.');
    if (!body.inputRef) throw new BadRequestException('inputRef is required to persist merge decisions.');
    if (!['confirmed', 'separated'].includes(body.action)) throw new BadRequestException('action must be confirmed or separated.');
    if (body.action === 'confirmed' && !body.matchedPersonId) {
      throw new BadRequestException('matchedPersonId is required when confirming a merge.');
    }

    const matchingRows = await this.rowRepo.find({ where: { sessionId: body.sessionId, source_row_ref: body.inputRef } });
    if (matchingRows.length === 0) {
      throw new NotFoundException(`No session rows found for source reference ${body.inputRef}.`);
    }

    const inputKey = this.buildIdentityDecisionKey(matchingRows[0]?.entity_name);
    const updatedRows = matchingRows.map((row) => ({
      ...row,
      canonical_person_id: body.action === 'confirmed' ? body.matchedPersonId : null,
    }));
    await this.rowRepo.save(updatedRows as any);

    await this.auditDecisionRepo.save(
      updatedRows.map((row) =>
        this.auditDecisionRepo.create({
          id: `AUD-${body.sessionId}-${row.id}-merge`,
          sessionId: body.sessionId,
          rowId: row.id,
          inputKey,
          matchedPersonId: body.matchedPersonId ?? null,
          merge: body.action === 'confirmed',
          split: body.action === 'separated',
          taxonomy_map: null,
          made_by: 'user',
          permanent: false,
        }),
      ),
    );

    if (inputKey) {
      if (body.action === 'confirmed') {
        await this.auditDecisionRepo.delete({ permanent: true, inputKey } as any);
      } else {
        await this.auditDecisionRepo.delete({ permanent: true, inputKey, merge: true } as any);
      }

      await this.auditDecisionRepo.save(
        this.auditDecisionRepo.create({
          id: `AUD-GLOBAL-${inputKey}-${body.matchedPersonId ?? 'new'}`,
          sessionId: null,
          rowId: null,
          inputKey,
          matchedPersonId: body.matchedPersonId ?? null,
          merge: body.action === 'confirmed',
          split: body.action === 'separated',
          taxonomy_map: null,
          made_by: 'user',
          permanent: true,
        }),
      );
    }

    const sessionRows = await this.rowRepo.find({ where: { sessionId: body.sessionId } });
    const audit = await this.previewAuditForSession(body.sessionId, sessionRows);
    const auditDecisions = await this.auditDecisionRepo.find({ where: { sessionId: body.sessionId }, order: { createdAt: 'ASC' } });
    return { updatedRows: sessionRows, audit, auditDecisions };
  }

  async entityModel(body: any) {
    this.assertRowCount(body.rows, 'entity-model');
    if (Array.isArray(body.previewRecords) && body.previewRecords.length > 0) {
      return this.entityModelService.buildEntityModelFromPreview(
        body.previewRecords,
        body.existingPersons || [],
        body.households || [],
        body.sessionId,
        body.persist !== false,
      );
    }
    return this.entityModelService.buildEntityModel(body.rows, body.existingPersons || [], body.sessionId, body.persist !== false);
  }

  async taxonomyEvaluate(body: any) {
    this.assertRowCount(body.rows, 'taxonomy-evaluate');
    return this.taxonomy.evaluateTaxonomy(body.rows);
  }

  async resolveTaxonomyException(exceptionId: string, body: any) {
    const result = await this.taxonomy.resolveException(exceptionId, body);
    const rows = await this.rowRepo.find({ where: { taxonomy_exception_id: exceptionId } });

    if (rows.length > 0) {
      const updatedRows = rows.map((row) => {
        const next = { ...row, taxonomy_exception_id: null };
        if (result.exception.type === 'fund') {
          return { ...next, normalized_fund: result.exception.resolvedCode };
        }
        if (result.exception.type === 'appeal') {
          return { ...next, normalized_appeal: result.exception.resolvedCode };
        }
        return next;
      });
      await this.rowRepo.save(updatedRows);
      const audit = result.exception.sessionId
        ? await this.previewAuditForSession(result.exception.sessionId, updatedRows)
        : null;
      return { ...result, updatedRows, audit };
    }

    return { ...result, updatedRows: [] };
  }

  async reviewFieldSuggestion(sessionId: string, suggestionId: string, body: any) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');

    const schema = this.normalizeSchemaFieldSuggestions(session.schema as any);
    const fieldSuggestions = Array.isArray(schema.fieldSuggestions) ? [...schema.fieldSuggestions] : [];
    const index = fieldSuggestions.findIndex((item: any) => item.id === suggestionId);
    if (index < 0) throw new NotFoundException('Field suggestion ' + suggestionId + ' not found.');

    const target = fieldSuggestions[index];
    if (body.action === 'approve' && !target.suggestedTarget) {
      throw new BadRequestException('suggestedTarget is required to approve a field suggestion.');
    }

    const updatedSuggestion = {
      ...target,
      status: body.action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date().toISOString(),
      reviewedBy: body.reviewedBy ?? 'user',
      notes: body.notes ?? target.notes ?? null,
    };
    fieldSuggestions[index] = updatedSuggestion;

    let nextSchema = schema;
    let updatedRows: any[] = [];
    let taxonomy: any = null;
    let audit: any = null;

    if (body.action === 'approve') {
      const overrides = { [updatedSuggestion.suggestedTarget]: updatedSuggestion.rawKey };
      await this.pipeline.recordApprovedFieldSuggestion({
        platform: session.platform,
        fileClass: schema.fileClass,
        suggestedTarget: updatedSuggestion.suggestedTarget,
        rawKey: updatedSuggestion.rawKey,
        cleanedKey: updatedSuggestion.cleanedKey,
        strippedKey: updatedSuggestion.strippedKey,
        reviewedBy: updatedSuggestion.reviewedBy,
        confidence: updatedSuggestion.confidence,
      });
      nextSchema = await this.pipeline.refreshSchema(session.parsedFile, schema, overrides, fieldSuggestions);

      if (nextSchema.fileClass === 'ledger') {
        await this.rowRepo.delete({ sessionId });
        const canonicalRows = this.pipeline.mapToCanonicalRows(session.parsedFile, nextSchema, session.guardrails || []);
        const rowsWithSession = canonicalRows.map((row: any) => ({ ...row, sessionId }));
        const taxonomyQueue = await this.taxonomy.queueTaxonomyExceptions(rowsWithSession);
        updatedRows = await this.enrichSuggestedFixes(taxonomyQueue.rows);
        await this.rowRepo.save(this.rowRepo.create(updatedRows.map((row: any) => ({ ...row, sessionId }))));
        audit = await this.previewAuditForSession(sessionId, updatedRows);
        taxonomy = {
          violations: taxonomyQueue.violations,
          exceptions: taxonomyQueue.exceptions,
          resolvedCount: taxonomyQueue.resolvedCount,
          unmappedCount: taxonomyQueue.unmappedCount,
        };
      }
    } else {
      nextSchema = await this.pipeline.refreshSchema(session.parsedFile, schema, {}, fieldSuggestions);
    }

    await this.sessionRepo.update(sessionId, { schema: nextSchema });
    const refreshedSession = await this.getSession(sessionId);
    return { session: refreshedSession, schema: nextSchema, updatedRows, taxonomy, audit };
  }

  async reviewTaxonomySuggestion(exceptionId: string, body: any) {
    const result = await this.taxonomy.reviewSuggestion(exceptionId, body);

    if (body.action !== 'approve') {
      return { ...result, updatedRows: [], audit: null };
    }

    const rows = await this.rowRepo.find({ where: { taxonomy_exception_id: exceptionId } });
    if (rows.length === 0) {
      return { ...result, updatedRows: [], audit: null };
    }

    const updatedRows = rows.map((row) => {
      const next = { ...row, taxonomy_exception_id: null };
      if (result.exception.type === 'fund') {
        return { ...next, normalized_fund: result.exception.resolvedCode };
      }
      if (result.exception.type === 'appeal') {
        return { ...next, normalized_appeal: result.exception.resolvedCode };
      }
      return next;
    });
    await this.rowRepo.save(updatedRows);
    const audit = result.exception.sessionId
      ? await this.previewAuditForSession(result.exception.sessionId, updatedRows)
      : null;
    return { ...result, updatedRows, audit };
  }

  sourceOfTruth(body: any) {
    return this.routing.resolveAxes(body.axes, body.rows || []);
  }

  async auditRules(body: any) {
    this.assertRowCount(body.rows, 'audit-rules');
    return this.buildAuditResult(body.rows, body.sessionId, body.persist !== false);
  }

  donorReport(body: any) {
    return this.output.buildDonorReport(body.rows, body.persons || [], body.households || [], body.previewRecords || []);
  }

  async auditDashboard(body: any) {
    const latestRun = body.sessionId
      ? await this.auditRunRepo.findOne({ where: { sessionId: body.sessionId }, order: { createdAt: 'DESC' } })
      : null;
    return this.output.buildAuditDashboard(body.rows, latestRun);
  }

  campaignPerformanceReport(body: any) {
    return this.output.buildCampaignPerformanceReport(this.taxonomy.applyNormalizedTaxonomy(body.rows));
  }

  crmSyncExport(body: any) {
    return this.output.buildCrmSyncExport(body.rows, body.persons || [], body.households || [], body.previewRecords || []);
  }

  private assertRowCount(rows: any[] | undefined, routeName: string) {
    if (!rows) return;
    if (rows.length > TRANSFORMHUB_MAX_ROWS_PER_REQUEST) {
      throw new BadRequestException(`${routeName} accepts at most ${TRANSFORMHUB_MAX_ROWS_PER_REQUEST} rows per request.`);
    }
  }

  async getTaxonomy() {
    return this.taxonomy.getTaxonomy();
  }

  private async updateSessionRows(sessionId: string, rows: any[]) {
    if (!rows.length) return;
    await this.rowRepo.save(rows.map((row) => ({ ...row, sessionId })));
  }

  private async previewAuditForSession(sessionId: string, rows?: any[]) {
    const sessionRows = rows ?? (await this.rowRepo.find({ where: { sessionId } }));
    return this.buildAuditResult(sessionRows, sessionId, false);
  }

  private async buildAuditResult(rows: any[], sessionId?: string, persist = true) {
    const result = this.auditEngine.runAuditRules(rows);

    if (!sessionId) {
      return { ...result, delta: { trend: 'baseline', newFindings: [], resolvedFindings: [] } };
    }

    const previousRun = await this.auditRunRepo.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    const findingKey = (finding: any) => `${finding.ruleCode}:${finding.count}`;
    const previousCodes = new Set(((previousRun?.findings as any[]) || []).map(findingKey));
    const currentCodes = new Set((result.findings || []).map(findingKey));

    const newFindings = (result.findings || [])
      .filter((finding: any) => !previousCodes.has(findingKey(finding)))
      .map((finding: any) => finding.ruleCode);
    const resolvedFindings = ((previousRun?.findings as any[]) || [])
      .filter((finding: any) => !currentCodes.has(findingKey(finding)))
      .map((finding: any) => finding.ruleCode);

    const delta = {
      trend: !previousRun ? 'baseline' : result.totalIssues > (previousRun?.totalIssues ?? 0) ? 'worse' : result.totalIssues < (previousRun?.totalIssues ?? 0) ? 'improved' : 'flat',
      issueCountChange: result.totalIssues - (previousRun?.totalIssues ?? 0),
      errorCountChange: result.errorCount - (previousRun?.errorCount ?? 0),
      warningCountChange: result.warningCount - (previousRun?.warningCount ?? 0),
      newFindings,
      resolvedFindings,
    };

    if (persist) {
      await this.auditRunRepo.save(
        this.auditRunRepo.create({
          sessionId,
          findings: result.findings,
          errorCount: result.errorCount,
          warningCount: result.warningCount,
          infoCount: result.infoCount,
          totalIssues: result.totalIssues,
          delta,
          engineVersion: result.engineVersion,
          ruleCatalog: result.ruleCatalog,
        }),
      );
    }

    return { ...result, delta };
  }

  private async buildCombinedPreflight(rows: any[], audit?: any) {
    const basePreflight = this.pipeline.runPreflight(rows);
    const taxonomyIssues = await this.taxonomy.buildPreflightIssues(rows);
    const auditIssues = (audit?.findings || [])
      .filter((finding: any) => finding.severity === 'error')
      .map((finding: any) => ({
        rowId: finding.rowIds?.[0],
        severity: 'error',
        message: `${finding.ruleCode}: ${finding.message}`,
      }));
    const issues = [...basePreflight.issues, ...taxonomyIssues, ...auditIssues];
    return { valid: issues.every((issue) => issue.severity !== 'error'), issues };
  }

  private async enrichSuggestedFixes(rows: any[]) {
    if (!this.ai.isEnabled) return rows;
    return Promise.all(
      rows.map(async (row) => {
        if (!row.needs_review) return row;
        const aiSuggestedFix = await this.ai.enrichSuggestedFix(row);
        return aiSuggestedFix ? { ...row, suggested_fix: aiSuggestedFix } : row;
      }),
    );
  }

  private buildIdentityDecisionKey(entityName?: string | null) {
    return String(entityName || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  }
}
