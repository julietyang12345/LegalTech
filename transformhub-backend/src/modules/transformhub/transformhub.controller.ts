import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { TransformHubService } from './transformhub.service';
import { IngestDto } from './dto/ingest.dto';
import { PreflightDto } from './dto/preflight.dto';
import { PostSimulateDto } from './dto/post-simulate.dto';
import { CsvFallbackDto } from './dto/csv-fallback.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { PersonResolveDto } from './dto/person-resolve.dto';
import { HouseholdResolveDto } from './dto/household-resolve.dto';
import { TaxonomyEvaluateDto } from './dto/taxonomy-evaluate.dto';
import { AuditRulesDto } from './dto/audit-rules.dto';
import { EntityModelDto } from './dto/entity-model.dto';
import { SourceOfTruthDto } from './dto/source-of-truth.dto';
import { DonorReportDto } from './dto/donor-report.dto';
import { AuditDashboardDto } from './dto/audit-dashboard.dto';
import { CampaignPerformanceReportDto } from './dto/campaign-performance-report.dto';
import { CrmSyncExportDto } from './dto/crm-sync-export.dto';
import { ReviewAnalyticsDto } from './dto/review-analytics.dto';
import { ResolveTaxonomyExceptionDto } from './dto/resolve-taxonomy-exception.dto';
import { ReviewTaxonomySuggestionDto } from './dto/review-taxonomy-suggestion.dto';
import { ReviewFieldSuggestionDto } from './dto/review-field-suggestion.dto';
import { MergeDecisionDto } from './dto/merge-decision.dto';
import { TransformHubApiKeyGuard } from './guards/transformhub-api-key.guard';
import { PublicTransformHub } from './decorators/public-transformhub.decorator';

@UseGuards(TransformHubApiKeyGuard)
@Controller('transformhub')
export class TransformHubController {
  constructor(private readonly service: TransformHubService) {}

  @PublicTransformHub()
  @Get('health')
  healthCheck() {
    return this.service.healthCheck();
  }

  @Get('chart-of-accounts')
  getChartOfAccounts() {
    return this.service.getChartOfAccounts();
  }

  @Get('sample')
  getSampleFile(@Query('platform') platform: string) {
    return this.service.getSampleFile(platform);
  }

  @Get('taxonomy')
  getTaxonomy() {
    return this.service.getTaxonomy();
  }

  @Get('audit-log')
  getAuditLog() {
    return this.service.getAuditLog();
  }

  @Get('audit-runs/:sessionId')
  getAuditRuns(@Param('sessionId') sessionId: string) {
    return this.service.getAuditRuns(sessionId);
  }

  @Get('audit-rules/catalog')
  getAuditRuleCatalog() {
    return this.service.getAuditRuleCatalog();
  }

  @Get('session/:id')
  getSession(@Param('id') id: string) {
    return this.service.getSession(id);
  }

  @Put('session/:id')
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.service.updateSession(id, dto);
  }

  @Post('ingest')
  ingest(@Body() dto: IngestDto) {
    return this.service.ingest(dto);
  }

  @Post('preflight')
  preflight(@Body() dto: PreflightDto) {
    return this.service.runPreflight(dto);
  }

  @Post('post-simulate')
  postSimulate(@Body() dto: PostSimulateDto) {
    return this.service.postSimulate(dto);
  }

  @Post('csv-fallback')
  csvFallback(@Body() dto: CsvFallbackDto) {
    return this.service.csvFallback(dto);
  }

  @Post('person-resolve')
  personResolve(@Body() dto: PersonResolveDto) {
    return this.service.personResolve(dto);
  }

  @Post('household-resolve')
  householdResolve(@Body() dto: HouseholdResolveDto) {
    return this.service.householdResolve(dto);
  }

  @Post('merge-decision')
  persistMergeDecision(@Body() dto: MergeDecisionDto) {
    return this.service.persistMergeDecision(dto);
  }

  @Post('entity-model')
  entityModel(@Body() dto: EntityModelDto) {
    return this.service.entityModel(dto);
  }

  @Post('taxonomy-evaluate')
  taxonomyEvaluate(@Body() dto: TaxonomyEvaluateDto) {
    return this.service.taxonomyEvaluate(dto);
  }

  @Post('taxonomy-group-suggest')
  taxonomyGroupSuggest(@Body() body: { values: Array<{ id: string; rawValue: string; objectType: string }> }) {
    return this.service.taxonomyGroupSuggest(body);
  }

  @Post('taxonomy-exceptions/:id/resolve')
  resolveTaxonomyException(@Param('id') id: string, @Body() dto: ResolveTaxonomyExceptionDto) {
    return this.service.resolveTaxonomyException(id, dto);
  }

  @Post('taxonomy-exceptions/:id/review')
  reviewTaxonomySuggestion(@Param('id') id: string, @Body() dto: ReviewTaxonomySuggestionDto) {
    return this.service.reviewTaxonomySuggestion(id, dto);
  }

  @Post('session/:id/field-suggestions/:suggestionId/review')
  reviewFieldSuggestion(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ReviewFieldSuggestionDto,
  ) {
    return this.service.reviewFieldSuggestion(id, suggestionId, dto);
  }

  @Post('source-of-truth')
  sourceOfTruth(@Body() dto: SourceOfTruthDto) {
    return this.service.sourceOfTruth(dto);
  }

  @Post('audit-rules')
  auditRules(@Body() dto: AuditRulesDto) {
    return this.service.auditRules(dto);
  }

  @Post('donor-report')
  donorReport(@Body() dto: DonorReportDto) {
    return this.service.donorReport(dto);
  }

  @Post('audit-dashboard')
  auditDashboard(@Body() dto: AuditDashboardDto) {
    return this.service.auditDashboard(dto);
  }

  @Post('campaign-performance-report')
  campaignPerformanceReport(@Body() dto: CampaignPerformanceReportDto) {
    return this.service.campaignPerformanceReport(dto);
  }

  @Post('crm-sync-export')
  crmSyncExport(@Body() dto: CrmSyncExportDto) {
    return this.service.crmSyncExport(dto);
  }

  @Post('review-analytics')
  reviewAnalytics(@Body() dto: ReviewAnalyticsDto) {
    return this.service.reviewAnalytics(dto);
  }

  // ─── Applied automatically ──────────────────────────────────────────────────

  @Get('applied-decisions')
  listAppliedDecisions(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.service.listAppliedDecisions({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Put('applied-decisions/:id/toggle')
  toggleAppliedDecision(@Param('id') id: string) {
    return this.service.toggleAppliedDecision(id);
  }

  // ─── Identity Hub ───────────────────────────────────────────────────────────

  @Get('identity-hub/persons')
  listIdentityHubPersons(
    @Query('q') q: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.service.listIdentityHubPersons({
      q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('identity-hub/persons/:id')
  getIdentityHubProfile(@Param('id') id: string) {
    return this.service.getIdentityHubProfile(id);
  }

  // ─── Review Queue ───────────────────────────────────────────────────────────

  @Get('review-queue/summary')
  getReviewQueueSummary() {
    return this.service.getReviewQueueSummary();
  }

  @Get('review-queue')
  getReviewQueue() {
    return this.service.getReviewQueue();
  }

  @Post('review-queue/:id/resolve')
  resolveReviewQueueItem(
    @Param('id') id: string,
    @Body() body: { action: 'approved' | 'kept_separate' },
  ) {
    if (!['approved', 'kept_separate'].includes(body?.action)) {
      throw new BadRequestException('action must be "approved" or "kept_separate"');
    }
    return this.service.resolveQueueItem(id, body.action);
  }
}
