import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { ThTransformSession, TransformSessionStatus } from '../../database/entities/th-transform-session.entity';
import { ThCanonicalRow } from '../../database/entities/th-canonical-row.entity';
import { ThAuditRun } from '../../database/entities/th-audit-run.entity';
import { ThAuditDecision } from '../../database/entities/th-audit-decision.entity';
import { ThReviewAction } from '../../database/entities/th-review-action.entity';
import { ThReviewDataset } from '../../database/entities/th-review-dataset.entity';
import { ThReviewQueueItem } from '../../database/entities/th-review-queue-item.entity';
import { ThIdentityMemory } from '../../database/entities/th-identity-memory.entity';
import { ThDonation } from '../../database/entities/th-donation.entity';
import { ThHousehold } from '../../database/entities/th-household.entity';
import { ThSourceCrosswalk } from '../../database/entities/th-source-crosswalk.entity';
import { TransformHubPipelineService } from './transformhub-pipeline.service';
import { TransformHubIdentityService } from './transformhub-identity.service';
import { TransformHubTaxonomyService } from './transformhub-taxonomy.service';
import { TransformHubEntityModelService } from './transformhub-entity-model.service';
import { TransformHubRoutingService } from './transformhub-routing.service';
import { TransformHubOutputService } from './transformhub-output.service';
import { TransformHubAuditRuleEngineService } from './transformhub-audit-rule-engine.service';
import { TransformHubAiService } from './transformhub-ai.service';
import { TRANSFORMHUB_MAX_ROWS_PER_REQUEST } from './transformhub.constants';
import { TransformHubStructureService } from './transformhub-structure.service';

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
    @InjectRepository(ThReviewAction)
    private readonly reviewActionRepo: Repository<ThReviewAction>,
    @InjectRepository(ThReviewDataset)
    private readonly reviewDatasetRepo: Repository<ThReviewDataset>,
    @InjectRepository(ThReviewQueueItem)
    private readonly reviewQueueRepo: Repository<ThReviewQueueItem>,
    @InjectRepository(ThIdentityMemory)
    private readonly identityMemoryRepo: Repository<ThIdentityMemory>,
    @InjectRepository(ThDonation)
    private readonly donationRepo: Repository<ThDonation>,
    @InjectRepository(ThHousehold)
    private readonly householdRepo: Repository<ThHousehold>,
    @InjectRepository(ThSourceCrosswalk)
    private readonly sourceCrosswalkRepo: Repository<ThSourceCrosswalk>,
    private readonly pipeline: TransformHubPipelineService,
    private readonly identity: TransformHubIdentityService,
    private readonly taxonomy: TransformHubTaxonomyService,
    private readonly entityModelService: TransformHubEntityModelService,
    private readonly routing: TransformHubRoutingService,
    private readonly output: TransformHubOutputService,
    private readonly auditEngine: TransformHubAuditRuleEngineService,
    private readonly ai: TransformHubAiService,
    private readonly structure: TransformHubStructureService,
  ) {}

  private async logReviewAction(sessionId: string | null, action: {
    actionType: string;
    entityType: string;
    entityId?: string | null;
    payload?: Record<string, unknown>;
    reason?: string | null;
    confidence?: number | null;
    userId?: string;
  }) {
    const session = sessionId ? await this.sessionRepo.findOne({ where: { id: sessionId }, select: ['id', 'datasetId'] }) : null;
    const reviewAction = this.reviewActionRepo.create({
      id: `REV-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      sessionId,
      datasetId: session?.datasetId ?? null,
      actionType: action.actionType,
      entityType: action.entityType,
      entityId: action.entityId ?? null,
      payload: action.payload ?? {},
      reason: action.reason ?? null,
      confidence: action.confidence ?? null,
      userId: action.userId ?? 'user',
    });
    await this.reviewActionRepo.save(reviewAction);
  }

  private async getSafeReviewActionCount(where: { datasetId?: string; sessionId?: string }) {
    try {
      return await this.reviewActionRepo.count({ where });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const message = error instanceof Error ? error.message : String(error);
      if (code === '42P01' || /relation ["']?th_review_actions["']? does not exist/i.test(message)) {
        this.logger.warn('th_review_actions table is missing; review analytics provenance will omit persisted action counts.');
        return 0;
      }
      throw error;
    }
  }

  private buildReviewDatasetFingerprint(parsedFile: any, schema: any) {
    const payload = {
      platform: parsedFile?.platform ?? null,
      fileClass: schema?.fileClass ?? parsedFile?.preview?.fileClass ?? null,
      headers: parsedFile?.headers ?? [],
      refs: (parsedFile?.preview?.records ?? []).map((record: any) => ({
        sourceRowRef: record?.sourceRowRef ?? null,
        rawValues: record?.rawValues ?? record?.values ?? {},
      })),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private async syncDatasetCleanedLayer(datasetId: string | null | undefined, parsedFile: any, sessionId: string) {
    if (!datasetId || !parsedFile) return;
    await this.reviewDatasetRepo.update(datasetId, {
      cleanedParsedFile: parsedFile,
      latestSessionId: sessionId,
    });
  }

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
      for (const expiredId of expiredIds) {
        await this.structure.resetSessionStructure(expiredId);
      }
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
    let dataset: ThReviewDataset | null = null;
    let effectiveParsedFile = parsedFile;
    if (schema.fileClass !== 'ledger') {
      const datasetFingerprint = this.buildReviewDatasetFingerprint(parsedFile, schema);
      const existingDataset = await this.reviewDatasetRepo.findOne({ where: { fingerprint: datasetFingerprint } });
      if (existingDataset) {
        dataset = existingDataset;
        effectiveParsedFile = { ...parsedFile, datasetId: existingDataset.id };
        await this.reviewDatasetRepo.update(existingDataset.id, {
          rawParsedFile: parsedFile,
          cleanedParsedFile: effectiveParsedFile,
          latestSessionId: null,
        });
      } else {
        dataset = await this.reviewDatasetRepo.save(this.reviewDatasetRepo.create({
          fingerprint: datasetFingerprint,
          platform: parsedFile.platform,
          fileClass: schema.fileClass,
          fileName: parsedFile.fileName,
          rawParsedFile: parsedFile,
          cleanedParsedFile: { ...parsedFile, datasetId: null },
          latestSessionId: null,
        }));
        effectiveParsedFile = { ...parsedFile, datasetId: dataset.id };
        await this.reviewDatasetRepo.update(dataset.id, { cleanedParsedFile: effectiveParsedFile });
      }
    }
    const hardStops = guardrails.filter((guardrail: any) => guardrail.triggered && HARD_STOP_GUARDRAILS.has(guardrail.code));
    const blockingIssues = this.buildBlockingIssues(hardStops);
    const existingSession = body.forceIngest ? await this.findExistingSessionForForceIngest(body.sessionId) : null;

    if (hardStops.length > 0 && !body.forceIngest) {
      const blockedSession = this.sessionRepo.create({
        status: TransformSessionStatus.BLOCKED,
        fileName: effectiveParsedFile.fileName,
        platform: effectiveParsedFile.platform,
        datasetId: dataset?.id ?? null,
        parsedFile: effectiveParsedFile,
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
          fileName: effectiveParsedFile.fileName,
          platform: effectiveParsedFile.platform,
          datasetId: dataset?.id ?? existingSession.datasetId ?? null,
          parsedFile: effectiveParsedFile,
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
          fileName: effectiveParsedFile.fileName,
          platform: effectiveParsedFile.platform,
          datasetId: dataset?.id ?? null,
          parsedFile: effectiveParsedFile,
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
    await this.syncDatasetCleanedLayer(session.datasetId, effectiveParsedFile, session.id);

    if (existingSession) {
      await this.rowRepo.delete({ sessionId: session.id });
    }

    if (schema.fileClass !== 'ledger') {
      await this.structure.persistSessionStructure({
        sessionId: session.id,
        datasetId: session.datasetId,
        parsedFile: effectiveParsedFile,
        schema,
        guardrails,
        canonicalRows: [],
      });
      return {
        sessionId: session.id,
        status: session.status,
        parsedFile: effectiveParsedFile,
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
    await this.structure.persistSessionStructure({
      sessionId: session.id,
      datasetId: session.datasetId,
      parsedFile: effectiveParsedFile,
      schema,
      guardrails,
      canonicalRows: rows,
    });
    await this.appendPendingTaxonomyDecisionLogs(session.id, taxonomyQueue);
    const audit = await this.auditRules({ rows, sessionId: session.id });

    return {
      sessionId: session.id,
      status: session.status,
        parsedFile: effectiveParsedFile,
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

  private mapTaxonomyConfidence(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (value === 'high') return 0.9;
    if (value === 'medium') return 0.7;
    if (value === 'low') return 0.5;
    return null;
  }

  private async appendPendingTaxonomyDecisionLogs(sessionId: string, taxonomyQueue: any) {
    const exceptions = Array.isArray(taxonomyQueue?.exceptions) ? taxonomyQueue.exceptions : [];
    for (const exception of exceptions) {
      if (!exception?.id) continue;
      await this.structure.appendDecisionLog({
        id: `taxonomy-review-${exception.id}`,
        sessionId,
        decisionType: 'taxonomy_review',
        decisionLevel: 'review',
        decisionMode: 'needs_review',
        status: 'pending_review',
        actorType: exception.aiSuggested ? 'ai' : 'system',
        actorId: null,
        targetType: exception.type ?? 'taxonomy',
        targetId: exception.id,
        confidence: this.mapTaxonomyConfidence(exception.aiSuggestion?.confidence ?? null),
        summary: exception.rawValue ?? exception.id,
        rationale: {
          aiReasoning: exception.aiReasoning ?? exception.aiSuggestion?.reasoning ?? null,
          aiReviewStatus: exception.aiReviewStatus ?? null,
          sourceRowRef: exception.sourceRowRef ?? null,
        },
        payload: exception,
      });
    }
  }

  async getSession(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId }, relations: ['rows'] });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');
    const auditDecisions = await this.auditDecisionRepo.find({ where: { sessionId }, order: { createdAt: 'ASC' } });
    const structure = await this.structure.getSessionStructure(sessionId);
    return { ...session, schema: this.normalizeSchemaFieldSuggestions(session.schema), auditDecisions, structure };
  }

  async updateSession(sessionId: string, body: any) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');
    let nextDatasetId = session.datasetId;

    if (body.status) {
      await this.sessionRepo.update(sessionId, { status: body.status });
    }
    if (body.preflight) {
      await this.sessionRepo.update(sessionId, { preflight: body.preflight });
    }
    if (body.parsedFile !== undefined) {
      const effectiveSchema = body.schema ?? session.schema;
      if (!nextDatasetId && effectiveSchema?.fileClass && effectiveSchema.fileClass !== 'ledger') {
        const datasetFingerprint = this.buildReviewDatasetFingerprint(body.parsedFile, effectiveSchema);
        let dataset = await this.reviewDatasetRepo.findOne({ where: { fingerprint: datasetFingerprint } });
        if (!dataset) {
          dataset = await this.reviewDatasetRepo.save(this.reviewDatasetRepo.create({
            fingerprint: datasetFingerprint,
            platform: body.parsedFile.platform,
            fileClass: effectiveSchema.fileClass,
            fileName: body.parsedFile.fileName,
            rawParsedFile: body.parsedFile,
            cleanedParsedFile: body.parsedFile,
            latestSessionId: sessionId,
          }));
        }
        nextDatasetId = dataset.id;
      }
      await this.sessionRepo.update(sessionId, { parsedFile: body.parsedFile, datasetId: nextDatasetId ?? null });
      await this.syncDatasetCleanedLayer(nextDatasetId, body.parsedFile, sessionId);
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
    if (body.reviewAction) {
      await this.logReviewAction(sessionId, body.reviewAction);
    }
    if (body.rows?.length > 0) {
      await this.updateSessionRows(sessionId, body.rows);
    }
    const refreshedSession = await this.getSession(sessionId);
    const parsedFile = refreshedSession.parsedFile as any;
    const schema = refreshedSession.schema as any;
    const personResult = refreshedSession.personResult as any;
    const householdResult = refreshedSession.householdResult as any;
    await this.structure.persistSessionStructure({
      sessionId,
      datasetId: refreshedSession.datasetId,
      parsedFile,
      schema,
      guardrails: refreshedSession.guardrails as any[],
      canonicalRows: refreshedSession.rows ?? [],
    });
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
    await this.enqueueReviewMatches(result.matches);
    await this.syncSourceCrosswalkForSession(body.sessionId, body.baselinePlatform ?? null, body.baselineFileClass ?? null);
    await this.structure.recordResolutionDecisions(body.sessionId, {
      resolutionType: 'person_match',
      matches: result.matches,
    });

    // Evaluate suspicious patterns on persons touched by this session
    const touchedPersonIds = [...new Set(
      updatedRows.map((r) => r.canonical_person_id).filter((id): id is string => Boolean(id)),
    )];
    if (touchedPersonIds.length > 0) {
      await this.evaluateSuspiciousProfiles(touchedPersonIds).catch((err) => {
        this.logger.warn('evaluateSuspiciousProfiles failed (non-fatal): ' + err?.message);
      });
    }

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
    await this.structure.recordResolutionDecisions(body.sessionId, {
      resolutionType: 'household_resolution',
      matches: result.households.map((household: any) => ({
        inputRef: household.id,
        householdId: household.id,
        memberIds: household.memberIds,
        score: 1,
      })),
    });
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

    // Resolve inputKey — priority: DB row > session personResult > frontend-supplied inputKey > entityName fallback.
    let inputKey: string;
    if (matchingRows.length > 0) {
      inputKey = this.buildIdentityDecisionKey(matchingRows[0]?.entity_name);
    } else if (body.inputKey) {
      inputKey = String(body.inputKey);
    } else {
      // Look up inputKey from the session's stored personResult — most reliable for non-ledger sessions.
      const session = await this.sessionRepo.findOne({ where: { id: body.sessionId }, select: ['id', 'personResult'] });
      const storedMatch = (session?.personResult as any)?.matches?.find((m: any) => m.inputRef === body.inputRef);
      if (storedMatch?.inputKey) {
        inputKey = String(storedMatch.inputKey);
      } else if (storedMatch?.reviewPayload?.input?.name) {
        inputKey = this.buildIdentityDecisionKey(storedMatch.reviewPayload.input.name);
      } else {
        inputKey = this.buildIdentityDecisionKey(body.entityName ?? null);
      }
    }

    // Update session rows with the canonical person assignment (ledger sessions only — donor rows are client-side).
    if (matchingRows.length > 0) {
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
    }

    // Write the permanent cross-session decision directly — core business fact,
    // must not be gated on queue infrastructure.
    if (inputKey) {
      // Read existing permanent record (any direction) to carry over both counts.
      const existingPermanent = await this.auditDecisionRepo.findOne({ where: { permanent: true, inputKey } as any });
      const prevMergeCount = existingPermanent?.confirmationCount ?? 0;
      const prevSplitCount = existingPermanent?.splitConfirmationCount ?? 0;
      const confirmationCount = body.action === 'confirmed' ? prevMergeCount + 1 : prevMergeCount;
      const splitConfirmationCount = body.action === 'separated' ? prevSplitCount + 1 : prevSplitCount;

      await this.auditDecisionRepo.delete({ permanent: true, inputKey } as any);
      await this.auditDecisionRepo.save(
        this.auditDecisionRepo.create({
          id: `AUD-GLOBAL-${inputKey}-${body.matchedPersonId ?? 'new'}`,
          sessionId: null,
          rowId: null,
          inputKey,
          matchedPersonId: body.action === 'confirmed' ? (body.matchedPersonId ?? null) : null,
          merge: body.action === 'confirmed',
          split: body.action === 'separated',
          taxonomy_map: null,
          made_by: 'user',
          permanent: true,
          confirmationCount,
          splitConfirmationCount,
        }),
      );
      await this.structure.appendDecisionLog({
        sessionId: body.sessionId ?? null,
        decisionType: 'merge_resolution',
        decisionLevel: 'review',
        decisionMode: 'needs_review',
        status: 'applied',
        actorType: 'user',
        actorId: 'user',
        targetType: 'person',
        targetId: body.action === 'confirmed' ? (body.matchedPersonId ?? null) : null,
        confidence: typeof body.confidence === 'number' ? body.confidence : null,
        summary: inputKey,
        rationale: {
          action: body.action,
          reason: body.reason ?? null,
        },
        payload: {
          inputRef: body.inputRef,
          inputKey,
          matchedPersonId: body.matchedPersonId ?? null,
        },
      });
    }

    // Update queue state as a side effect — non-blocking, queue failure must not affect the decision above.
    const queueAction = body.action === 'confirmed' ? 'approved' : 'kept_separate';
    this.findOrCreateQueueItem(inputKey, body.matchedPersonId ?? null)
      .then((queueItem) => this.resolveQueueItemState(queueItem.id, queueAction, body.sessionId, {
        entityId: body.matchedPersonId ?? body.inputRef,
        confidence: typeof body.confidence === 'number' ? body.confidence : null,
        reason: body.reason ?? 'Human duplicate review decision.',
      }))
      .catch((err) => this.logger.warn(`[submitIdentityDecision] queue sync failed (non-fatal): ${err?.message}`));

    if (matchingRows.length === 0) {
      // Non-ledger session — rows are client-side only. Return empty so the frontend ignores the response.
      return { updatedRows: [], audit: null, auditDecisions: [] };
    }

    const sessionRows = await this.rowRepo.find({ where: { sessionId: body.sessionId } });
    const audit = await this.previewAuditForSession(body.sessionId, sessionRows);
    const auditDecisions = await this.auditDecisionRepo.find({ where: { sessionId: body.sessionId }, order: { createdAt: 'ASC' } });
    return { updatedRows: sessionRows, audit, auditDecisions };
  }

  // ─── Review Queue ────────────────────────────────────────────────────────────

  async getReviewQueue() {
    const DISPLAY_CAP = 20;

    const [allPending] = await this.reviewQueueRepo.findAndCount({
      where: { status: 'pending' },
      order: { isHighConfidence: 'DESC', score: 'DESC' },
      take: DISPLAY_CAP,
    });
    const decisionItems = await this.structure.getDecisionReviewQueue(DISPLAY_CAP);
    const merged = [...decisionItems, ...allPending]
      .sort((a: any, b: any) => Number(b.isHighConfidence) - Number(a.isHighConfidence) || (b.score ?? 0) - (a.score ?? 0))
      .slice(0, DISPLAY_CAP);

    const pendingLegacy = await this.reviewQueueRepo.count({
      where: { status: 'pending' },
    });
    const pendingDecision = (await this.structure.getDecisionReviewSummary()).pendingCount;
    const totalPending = pendingLegacy + pendingDecision;
    const batchedCount = Math.max(0, totalPending - merged.length);

    return { items: merged, totalPending, batchedCount };
  }

  async getReviewQueueSummary() {
    const [pendingCountLegacy, highConfidenceCountLegacy, driftAlertCountLegacy, decisionSummary] = await Promise.all([
      this.reviewQueueRepo.count({ where: { status: 'pending' } }),
      this.reviewQueueRepo.count({ where: { status: 'pending', isHighConfidence: true } }),
      this.reviewQueueRepo.count({ where: { status: 'pending', isDriftAlert: true } }),
      this.structure.getDecisionReviewSummary(),
    ]);
    return {
      pendingCount: pendingCountLegacy + decisionSummary.pendingCount,
      highConfidenceCount: highConfidenceCountLegacy + decisionSummary.highConfidenceCount,
      driftAlertCount: driftAlertCountLegacy + decisionSummary.driftAlertCount,
    };
  }

  private async rebuildSessionFromSchema(sessionId: string, nextSchema: any) {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session ' + sessionId + ' not found.');

    let updatedRows: any[] = [];
    let taxonomy: any = null;
    let audit: any = null;

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

    await this.sessionRepo.update(sessionId, { schema: nextSchema });
    await this.structure.persistSessionStructure({
      sessionId,
      datasetId: session.datasetId,
      parsedFile: session.parsedFile,
      schema: nextSchema,
      guardrails: session.guardrails as any[],
      canonicalRows: updatedRows,
    });
    if (taxonomy) {
      await this.appendPendingTaxonomyDecisionLogs(sessionId, taxonomy);
    }

    return { updatedRows, taxonomy, audit };
  }

  private async resolveFieldMappingDecisionLogItem(
    itemId: string,
    action: 'approved' | 'kept_separate',
    actorId = 'user',
    reason?: string | null,
  ) {
    const entry = await this.structure.getDecisionLogEntry(itemId);
    if (!entry?.sessionId || entry.targetType !== 'mapping_rule' || !entry.targetId) {
      return null;
    }

    const mappingRule = await this.structure.getMappingRule(entry.targetId);
    if (!mappingRule) return null;

    const session = await this.sessionRepo.findOne({ where: { id: entry.sessionId } });
    if (!session) return null;

    const schema = this.normalizeSchemaFieldSuggestions(session.schema as any);
    const nextFieldMap = { ...(schema.fieldMap ?? {}) } as Record<string, string>;
    const nextFieldSuggestions = Array.isArray(schema.fieldSuggestions) ? [...schema.fieldSuggestions] : [];

    if (action === 'approved') {
      nextFieldMap[mappingRule.targetField] = mappingRule.sourceKey;
    } else if (nextFieldMap[mappingRule.targetField] === mappingRule.sourceKey) {
      delete nextFieldMap[mappingRule.targetField];
    }

    const suggestionIndex = nextFieldSuggestions.findIndex((item: any) =>
      item?.rawKey === mappingRule.sourceKey && item?.suggestedTarget === mappingRule.targetField,
    );
    if (suggestionIndex >= 0) {
      nextFieldSuggestions[suggestionIndex] = {
        ...nextFieldSuggestions[suggestionIndex],
        status: action === 'approved' ? 'approved' : 'rejected',
        reviewedAt: new Date().toISOString(),
        reviewedBy: actorId,
        notes: reason ?? nextFieldSuggestions[suggestionIndex]?.notes ?? null,
      };
    }

    if (action === 'approved') {
      await this.pipeline.recordApprovedFieldSuggestion({
        platform: session.platform,
        fileClass: schema.fileClass,
        suggestedTarget: mappingRule.targetField as any,
        rawKey: mappingRule.sourceKey,
        reviewedBy: actorId,
      });
    }

    const nextSchema = await this.pipeline.refreshSchema(
      session.parsedFile,
      schema,
      nextFieldMap,
      nextFieldSuggestions,
    );

    await this.structure.updateMappingRule(mappingRule.id, {
      approvalStatus: action === 'approved' ? 'approved' : 'rejected',
      active: action === 'approved',
      origin: action === 'approved' ? mappingRule.origin : 'rejected_review',
      metadata: {
        ...(mappingRule.metadata ?? {}),
        reviewedAt: new Date().toISOString(),
        reviewedBy: actorId,
        reviewAction: action,
        reviewReason: reason ?? null,
      },
    });

    await this.rebuildSessionFromSchema(entry.sessionId, nextSchema);
    return this.structure.resolveDecisionLogItem(itemId, action, actorId, reason ?? null);
  }

  private async resolveTaxonomyDecisionLogItem(
    itemId: string,
    action: 'approved' | 'kept_separate',
    actorId = 'user',
    reason?: string | null,
  ) {
    const entry = await this.structure.getDecisionLogEntry(itemId);
    const payload = (entry?.payload ?? {}) as Record<string, any>;
    const exceptionId = String(entry?.targetId ?? payload.id ?? '');
    if (!entry?.sessionId || !exceptionId) return null;

    if (action === 'approved') {
      const resolvedCode = payload.resolvedCode ?? payload.aiSuggestion?.code ?? payload.suggestedCode ?? null;
      const result = await this.taxonomy.reviewSuggestion(exceptionId, {
        action: 'approve',
        resolvedCode: resolvedCode ?? undefined,
        notes: reason ?? undefined,
        reviewedBy: actorId,
      });
      const rows = await this.rowRepo.find({ where: { taxonomy_exception_id: exceptionId } });
      if (rows.length > 0) {
        const updatedRows = rows.map((row) => {
          const next = { ...row, taxonomy_exception_id: null };
          if (result.exception.type === 'fund') return { ...next, normalized_fund: result.exception.resolvedCode };
          if (result.exception.type === 'appeal') return { ...next, normalized_appeal: result.exception.resolvedCode };
          return next;
        });
        await this.rowRepo.save(updatedRows);
      }
    } else {
      await this.taxonomy.reviewSuggestion(exceptionId, {
        action: 'reject',
        notes: reason ?? undefined,
        reviewedBy: actorId,
      });
    }

    return this.structure.resolveDecisionLogItem(itemId, action, actorId, reason ?? null);
  }

  // Called from the HTTP endpoint (POST /review-queue/:id/resolve) — writes permanent decision + updates queue state.
  async resolveQueueItem(
    itemId: string,
    action: 'approved' | 'kept_separate',
    sessionId?: string | null,
    meta?: { entityId?: string; confidence?: number | null; reason?: string },
  ) {
    const item = await this.reviewQueueRepo.findOne({ where: { id: itemId } });
    if (!item) {
      const decisionEntry = await this.structure.getDecisionLogEntry(itemId);
      let resolvedDecisionItem = null;
      if (decisionEntry?.decisionType === 'field_mapping') {
        resolvedDecisionItem = await this.resolveFieldMappingDecisionLogItem(itemId, action, 'user', meta?.reason ?? null);
      } else if (decisionEntry?.decisionType === 'taxonomy_review') {
        resolvedDecisionItem = await this.resolveTaxonomyDecisionLogItem(itemId, action, 'user', meta?.reason ?? null);
      } else {
        resolvedDecisionItem = await this.structure.resolveDecisionLogItem(itemId, action, 'user', meta?.reason ?? null);
      }
      if (!resolvedDecisionItem) throw new NotFoundException(`Review queue item ${itemId} not found.`);
      return resolvedDecisionItem;
    }

    // Write the permanent decision first — this is the core fact.
    const inputKey = item.inputKey;
    const matchedPersonId = action === 'approved' ? item.candidatePersonId : null;

    if (inputKey) {
      // Read existing permanent record (any direction) to carry over both counts.
      const existingPermanent = await this.auditDecisionRepo.findOne({ where: { permanent: true, inputKey } as any });
      const prevMergeCount = existingPermanent?.confirmationCount ?? 0;
      const prevSplitCount = existingPermanent?.splitConfirmationCount ?? 0;
      const confirmationCount = action === 'approved' ? prevMergeCount + 1 : prevMergeCount;
      const splitConfirmationCount = action === 'kept_separate' ? prevSplitCount + 1 : prevSplitCount;

      await this.auditDecisionRepo.delete({ permanent: true, inputKey } as any);
      await this.auditDecisionRepo.save(
        this.auditDecisionRepo.create({
          id: `AUD-GLOBAL-${inputKey}-${matchedPersonId ?? 'new'}`,
          sessionId: null,
          rowId: null,
          inputKey,
          matchedPersonId: matchedPersonId ?? null,
          merge: action === 'approved',
          split: action === 'kept_separate',
          taxonomy_map: null,
          made_by: 'user',
          permanent: true,
          confirmationCount,
          splitConfirmationCount,
        }),
      );
    }

    // Then update queue state.
    await this.resolveQueueItemState(itemId, action, sessionId, meta);

    return item;
  }

  // Updates queue item status + writes audit log. Does NOT write permanent decisions.
  private async resolveQueueItemState(
    itemId: string,
    action: 'approved' | 'kept_separate',
    sessionId?: string | null,
    meta?: { entityId?: string; confidence?: number | null; reason?: string },
  ) {
    const item = await this.reviewQueueRepo.findOne({ where: { id: itemId } });
    if (!item) return;
    if (item.status !== 'pending') return;

    item.status = action;
    item.resolvedAt = new Date();
    await this.reviewQueueRepo.save(item);

    await this.logReviewAction(sessionId ?? null, {
      actionType: action === 'approved' ? 'merge_duplicate' : 'separate_duplicate',
      entityType: 'person',
      entityId: meta?.entityId ?? item.candidatePersonId ?? itemId,
      payload: { queueItemId: itemId, matchedPersonId: action === 'approved' ? item.candidatePersonId : null },
      reason: meta?.reason ?? 'Human duplicate review decision.',
      confidence: meta?.confidence ?? item.score ?? null,
      userId: 'user',
    });
  }

  private async findOrCreateQueueItem(inputKey: string | null, candidatePersonId: string | null): Promise<ThReviewQueueItem> {
    if (inputKey) {
      const existing = await this.reviewQueueRepo.findOne({
        where: { inputKey, candidatePersonId: candidatePersonId ?? undefined } as any,
        order: { createdAt: 'DESC' },
      });
      if (existing) return existing;
    }

    const item = this.reviewQueueRepo.create({
      inputKey: inputKey ?? null,
      candidatePersonId: candidatePersonId ?? null,
      score: 0,
      isHighConfidence: false,
      status: 'pending',
    });
    return this.reviewQueueRepo.save(item);
  }

  private async enqueueReviewMatches(matches: any[]) {
    const QUEUE_CAP = 20;
    const BATCH_THRESHOLD = 65;

    const reviewMatches = matches.filter(
      (m: any) => (m.decision === 'review' || m.decision === 'auto') && m.matchedPersonId,
    );
    if (reviewMatches.length === 0) return;

    // Check current pending count for anti-flood logic.
    const currentPendingCount = await this.reviewQueueRepo.count({ where: { status: 'pending' } });

    // Batch lookup existing pending items for these candidates to avoid duplicates.
    const candidateIds = [...new Set(reviewMatches.map((m: any) => m.matchedPersonId as string))];
    const existing = await this.reviewQueueRepo.find({
      where: { candidatePersonId: In(candidateIds), status: 'pending' } as any,
    });
    const existingKeys = new Set(
      existing.map((item) => `${item.inputKey ?? ''}::${item.candidatePersonId ?? ''}`),
    );

    // Drift detection: load permanent split decisions for all input keys so we
    // can flag when a previously-separated pair re-appears as high confidence.
    const inputKeys = reviewMatches.map((m: any) => m.inputKey).filter(Boolean) as string[];
    const permanentSplits = inputKeys.length > 0
      ? await this.auditDecisionRepo.find({
          where: { permanent: true, split: true, inputKey: In(inputKeys) } as any,
        })
      : [];
    const splitInputKeys = new Set(permanentSplits.map((d) => d.inputKey ?? '').filter(Boolean));

    const toInsert: Partial<ThReviewQueueItem>[] = [];
    let projectedCount = currentPendingCount;

    for (const match of reviewMatches) {
      const key = `${match.inputKey ?? ''}::${match.matchedPersonId ?? ''}`;
      if (existingKeys.has(key)) continue;

      // Anti-flood: skip low-confidence items when the queue is full, unless
      // it's a drift alert (those always get through).
      const isDrift = match.decision === 'auto' && splitInputKeys.has(match.inputKey ?? '');
      if (!isDrift && projectedCount >= QUEUE_CAP && match.score < BATCH_THRESHOLD) continue;

      const displayNameA = match.reviewPayload?.input?.name ?? null;
      const candidatePerson = match.reviewPayload?.candidate;
      const displayNameB = candidatePerson
        ? [candidatePerson.firstName, candidatePerson.lastName].filter(Boolean).join(' ') || null
        : null;

      toInsert.push({
        inputKey: match.inputKey ?? null,
        candidatePersonId: match.matchedPersonId,
        score: match.score ?? 0,
        isHighConfidence: match.decision === 'auto',
        isDriftAlert: isDrift,
        displayNameA,
        displayNameB,
        evidenceFields: match.matchedFields ?? [],
        status: 'pending',
      });
      existingKeys.add(key);
      projectedCount++;
    }

    if (toInsert.length > 0) {
      await this.reviewQueueRepo.save(toInsert.map((item) => this.reviewQueueRepo.create(item)));
    }
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
      if (result.exception.sessionId) {
        await this.structure.resolveDecisionLogItem(`taxonomy-review-${exceptionId}`, 'approved', body.reviewedBy ?? 'user', body.notes ?? null).catch(() => null);
      }
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
    await this.structure.appendDecisionLog({
      sessionId,
      decisionType: 'field_suggestion_review',
      decisionLevel: 'review',
      decisionMode: body.action === 'approve' ? 'high_confidence' : 'needs_review',
      status: body.action === 'approve' ? 'applied' : 'rejected',
      actorType: 'user',
      actorId: body.reviewedBy ?? 'user',
      targetType: 'mapping_rule',
      targetId: updatedSuggestion.suggestedTarget ?? updatedSuggestion.id,
      confidence: updatedSuggestion.confidence === 'high' ? 0.9 : updatedSuggestion.confidence === 'medium' ? 0.7 : 0.5,
      summary: `${updatedSuggestion.rawKey} -> ${updatedSuggestion.suggestedTarget ?? 'rejected'}`,
      rationale: {
        notes: body.notes ?? null,
        reasoning: updatedSuggestion.reasoning ?? null,
      },
      payload: updatedSuggestion,
    });
    const refreshedSession = await this.getSession(sessionId);
    return { session: refreshedSession, schema: nextSchema, updatedRows, taxonomy, audit };
  }

  async reviewTaxonomySuggestion(exceptionId: string, body: any) {
    const result = await this.taxonomy.reviewSuggestion(exceptionId, body);

    if (result.exception.sessionId) {
      await this.structure.resolveDecisionLogItem(
        `taxonomy-review-${exceptionId}`,
        body.action === 'approve' ? 'approved' : 'kept_separate',
        body.reviewedBy ?? 'user',
        body.notes ?? null,
      ).catch(() => null);
    }

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
    if (result.exception.sessionId) {
      await this.logReviewAction(result.exception.sessionId, {
        actionType: 'map_taxonomy',
        entityType: result.exception.type || 'taxonomy',
        entityId: result.exception.id,
        payload: {
          sourceValue: result.exception.rawValue,
          canonicalValue: result.exception.resolvedCode,
        },
        reason: body.notes ?? result.exception.aiSuggestion?.reasoning ?? 'Approved taxonomy mapping.',
        userId: body.reviewedBy ?? 'user',
      });
      await this.structure.appendDecisionLog({
        sessionId: result.exception.sessionId,
        decisionType: 'taxonomy_review',
        decisionLevel: 'review',
        decisionMode: body.action === 'approve' ? 'high_confidence' : 'needs_review',
        status: body.action === 'approve' ? 'applied' : 'rejected',
        actorType: 'user',
        actorId: body.reviewedBy ?? 'user',
        targetType: result.exception.type || 'taxonomy',
        targetId: result.exception.id,
        confidence: null,
        summary: result.exception.rawValue ?? result.exception.id,
        rationale: {
          notes: body.notes ?? null,
          resolvedCode: result.exception.resolvedCode ?? null,
        },
        payload: result.exception,
      });
    }
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

  async reviewAnalytics(body: any) {
    let rows = body.rows || [];
    let persons = body.persons || [];
    let households = body.households || [];
    let previewRecords = body.previewRecords || [];
    let taxonomyState = body.taxonomyState || null;
    let fileClass = body.fileClass || 'donor';
    const postReviewReady = body.postReviewReady === true;
    let actionCount = 0;
    let reproducible = false;
    if (body.sessionId) {
      const session = await this.sessionRepo.findOne({ where: { id: body.sessionId } });
      if (session?.datasetId) {
        const dataset = await this.reviewDatasetRepo.findOne({ where: { id: session.datasetId } });
        if (!Array.isArray(previewRecords) || previewRecords.length === 0) {
          previewRecords = ((dataset?.cleanedParsedFile as any)?.preview?.records ?? previewRecords);
        }
        fileClass = ((session.schema as any)?.fileClass ?? fileClass);
        taxonomyState = session.taxonomyState ?? taxonomyState;
        actionCount = await this.getSafeReviewActionCount({ datasetId: session.datasetId });
        reproducible = true;
      } else {
        actionCount = await this.getSafeReviewActionCount({ sessionId: body.sessionId });
      }
    }
    if (!postReviewReady) {
      return {
        generatedAt: new Date().toISOString(),
        cards: [],
        items: [],
        suggestedViews: [],
        provenance: {
          layer: 'cleaned',
          source: reproducible ? 'persistent raw dataset awaiting completed review state' : 'session review state awaiting completion',
          actionCount,
          reproducible,
          postReviewReady: false,
        },
      };
    }
    const analytics = this.output.buildReviewAnalytics(
      rows,
      persons,
      households,
      previewRecords,
      taxonomyState,
      body.finalAttributionDrafts || {},
      fileClass,
    );
    return {
      ...analytics,
      provenance: {
        layer: 'cleaned',
        source: reproducible ? 'persistent raw dataset + review actions + cleaned snapshot' : 'session review state',
        actionCount,
        reproducible,
        postReviewReady: true,
      },
    };
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
    await this.rowRepo.delete({ sessionId });
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

  // ─── Applied automatically (permanent merge decisions) ───────────────────────

  async listAppliedDecisions(query: { page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const [decisions, total] = await this.auditDecisionRepo.findAndCount({
      where: { permanent: true, merge: true },
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { decisions, total, page, pageSize };
  }

  async toggleAppliedDecision(decisionId: string) {
    const decision = await this.auditDecisionRepo.findOne({ where: { id: decisionId } });
    if (!decision) throw new NotFoundException(`Decision ${decisionId} not found.`);
    if (!decision.permanent || !decision.merge) {
      throw new BadRequestException('Only permanent merge decisions can be toggled.');
    }
    decision.disabled = !decision.disabled;
    await this.auditDecisionRepo.save(decision);
    return decision;
  }

  // ─── Source Crosswalk ────────────────────────────────────────────────────────

  private async upsertSourceCrosswalk(
    personId: string,
    platform: string,
    fileClass: string | null,
    rawKey: string | null,
    donationAmount: number,
    seenAt: Date,
  ): Promise<void> {
    const id = `${personId}::${platform}::${fileClass ?? 'unknown'}`;
    const existing = await this.sourceCrosswalkRepo.findOne({ where: { id } });
    if (existing) {
      existing.totalGiving = Number(existing.totalGiving) + donationAmount;
      existing.donationCount += donationAmount > 0 ? 1 : 0;
      existing.lastSeenAt = seenAt;
      if (!existing.rawKey && rawKey) existing.rawKey = rawKey;
      await this.sourceCrosswalkRepo.save(existing);
    } else {
      await this.sourceCrosswalkRepo.save(
        this.sourceCrosswalkRepo.create({
          id,
          personId,
          platform,
          fileClass,
          rawKey,
          totalGiving: donationAmount,
          donationCount: donationAmount > 0 ? 1 : 0,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
        }),
      );
    }
  }

  async syncSourceCrosswalkForSession(
    sessionId: string,
    platform: string | null,
    fileClass: string | null,
  ): Promise<void> {
    if (!platform) return;
    const rows = await this.rowRepo.find({ where: { sessionId } });
    const seenAt = new Date();
    const batchMap = new Map<string, { personId: string; rawKey: string | null; amount: number }>();

    for (const row of rows) {
      if (!row.canonical_person_id) continue;
      const key = `${row.canonical_person_id}::${platform}::${fileClass ?? 'unknown'}`;
      const existing = batchMap.get(key);
      const amount = parseFloat(row.debit ?? '0') || 0;
      const rawKey = row.entity_name ?? null;
      if (existing) {
        existing.amount += amount;
      } else {
        batchMap.set(key, { personId: row.canonical_person_id, rawKey, amount });
      }
    }

    for (const [, { personId, rawKey, amount }] of batchMap) {
      await this.upsertSourceCrosswalk(personId, platform, fileClass, rawKey, amount, seenAt);
    }
  }

  // ─── Suspicious Profile ───────────────────────────────────────────────────────

  /**
   * Evaluates a set of persons for suspicious patterns and persists flags.
   * Also enqueues a `suspicious_profile` queue item so it surfaces in the review queue.
   *
   * Suspicious heuristics:
   *  - Multiple email domains (≥2 distinct domains on fingerprints containing "@")
   *  - Excessive source platforms (≥3 distinct platforms across crosswalk entries)
   *  - Contradictory split+merge decisions (both merge=true and split=true decisions exist)
   */
  async evaluateSuspiciousProfiles(personIds: string[]): Promise<void> {
    if (personIds.length === 0) return;

    for (const personId of personIds) {
      const [person, decisions, crosswalk] = await Promise.all([
        this.identityMemoryRepo.findOne({ where: { id: personId } }),
        this.auditDecisionRepo.find({ where: { matchedPersonId: personId, permanent: true } }),
        this.sourceCrosswalkRepo.find({ where: { personId } }),
      ]);
      if (!person) continue;

      const reasons: string[] = [];

      // Heuristic 1: multiple email domains
      const emailFingerprints = person.fingerprints.filter((fp) => fp.includes('@'));
      const domains = new Set(emailFingerprints.map((fp) => fp.split('@')[1]?.toLowerCase()).filter(Boolean));
      if (domains.size >= 2) {
        reasons.push(`Multiple email domains: ${[...domains].join(', ')}`);
      }

      // Heuristic 2: excessive source platforms
      const platformSet = new Set(crosswalk.map((cw) => cw.platform));
      if (platformSet.size >= 3) {
        reasons.push(`Seen across ${platformSet.size} source platforms`);
      }

      // Heuristic 3: contradictory decisions
      const hasMerge = decisions.some((d) => d.merge);
      const hasSplit = decisions.some((d) => d.split);
      if (hasMerge && hasSplit) {
        reasons.push('Both merge and split decisions exist for this identity');
      }

      const isSuspicious = reasons.length > 0;
      const wasAlreadySuspicious = person.isSuspicious;

      person.isSuspicious = isSuspicious;
      person.suspiciousReasons = isSuspicious ? reasons : null;
      person.suspiciousLastEvaluatedAt = new Date();
      await this.identityMemoryRepo.save(person);

      // Enqueue a suspicious_profile item if newly flagged
      if (isSuspicious && !wasAlreadySuspicious) {
        const existingItem = await this.reviewQueueRepo.findOne({
          where: {
            candidatePersonId: personId,
            inputKey: `suspicious:${personId}`,
            status: 'pending',
          } as any,
        });
        if (!existingItem) {
          const displayName = [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email || personId;
          await this.reviewQueueRepo.save(
            this.reviewQueueRepo.create({
              id: `SUS-${personId}-${Date.now()}`,
              inputKey: `suspicious:${personId}`,
              candidatePersonId: personId,
              score: 0,
              isHighConfidence: false,
              isDriftAlert: false,
              displayNameA: displayName,
              displayNameB: 'Suspicious profile',
              evidenceFields: reasons,
              status: 'pending',
            }),
          );
        }
      }
    }
  }

  // ─── Identity Hub ────────────────────────────────────────────────────────────

  async listIdentityHubPersons(query: { q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const qb = this.identityMemoryRepo.createQueryBuilder('p')
      .orderBy('p.updatedAt', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (query.q) {
      const term = `%${query.q.toLowerCase()}%`;
      qb.where(
        `LOWER(p."firstName") LIKE :term OR LOWER(p."lastName") LIKE :term OR LOWER(p.email) LIKE :term`,
        { term },
      );
    }

    const [persons, total] = await qb.getManyAndCount();
    return { persons, total, page, pageSize };
  }

  async getIdentityHubProfile(personId: string) {
    const person = await this.identityMemoryRepo.findOne({ where: { id: personId } });
    if (!person) throw new NotFoundException(`Person ${personId} not found.`);

    const [decisions, donations, openQueueItems, crosswalk] = await Promise.all([
      this.auditDecisionRepo.find({
        where: { matchedPersonId: personId, permanent: true },
        order: { updatedAt: 'DESC' },
        take: 50,
      }),
      this.donationRepo.find({
        where: { canonical_person_id: personId },
        order: { date: 'DESC' },
        take: 100,
      }),
      this.reviewQueueRepo.find({
        where: { candidatePersonId: personId, status: 'pending' } as any,
        order: { score: 'DESC' },
      }),
      this.sourceCrosswalkRepo.find({
        where: { personId },
        order: { totalGiving: 'DESC' },
      }),
    ]);

    // Find household membership.
    const allHouseholds = await this.householdRepo
      .createQueryBuilder('h')
      .where(`h."memberIds" @> :ids`, { ids: JSON.stringify([personId]) })
      .getMany();

    const totalGiving = donations.reduce((sum, d) => sum + (d.amount ?? 0), 0);

    // Extract source platforms from fingerprints for a lightweight crosswalk view.
    const sourcePlatforms = [
      ...(person.sourcePlatform ? [person.sourcePlatform] : []),
      ...decisions.map((d) => d.sessionId).filter(Boolean),
    ];
    const uniquePlatforms = [...new Set(sourcePlatforms)];

    return {
      person,
      decisions,
      donations,
      households: allHouseholds,
      openQueueItems,
      crosswalk,
      totalGiving,
      sourcePlatforms: uniquePlatforms,
      donationCount: donations.length,
      isSuspicious: person.isSuspicious,
      suspiciousReasons: person.suspiciousReasons ?? [],
    };
  }
}
