import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThTaxonomyException } from '../../database/entities/th-taxonomy-exception.entity';
import { TAXONOMY_REGISTRY, LEGACY_MAPPINGS } from './transformhub-pipeline.service';

@Injectable()
export class TransformHubTaxonomyService {
  constructor(
    @InjectRepository(ThTaxonomyException)
    private readonly exceptionRepo: Repository<ThTaxonomyException>,
  ) {}

  private normalizeRawValue(rawValue: string): string {
    return String(rawValue || '').toLowerCase().trim();
  }

  private resolveCanonicalCode(rawValue: string, type: string): string | null {
    const normalized = this.normalizeRawValue(rawValue);
    if (!normalized) return null;

    const inRegistry = TAXONOMY_REGISTRY.find(
      (code) => code.type === type && (code.code.toLowerCase() === normalized || code.label.toLowerCase() === normalized),
    );
    if (inRegistry) return inRegistry.code;

    const legacy = LEGACY_MAPPINGS.find(
      (mapping) => mapping.type === type && mapping.legacyValue.toLowerCase() === normalized,
    );
    return legacy?.canonicalCode ?? null;
  }

  applyNormalizedTaxonomy(rows: any[]): any[] {
    return rows.map((row) => ({
      ...row,
      normalized_fund: row.normalized_fund ?? (row.raw_fund ? this.resolveCanonicalCode(row.raw_fund, 'fund') : null),
      normalized_appeal: row.normalized_appeal ?? (row.raw_appeal ? this.resolveCanonicalCode(row.raw_appeal, 'appeal') : null),
    }));
  }

  private async hydrateResolvedExceptions(rows: any[]): Promise<any[]> {
    const exceptionIds = Array.from(
      new Set(rows.map((row) => row.taxonomy_exception_id).filter(Boolean)),
    );

    if (exceptionIds.length === 0) {
      return this.applyNormalizedTaxonomy(rows);
    }

    const exceptions = await this.exceptionRepo.findBy(
      exceptionIds.map((id) => ({ id })),
    );
    const exceptionById = new Map(exceptions.map((exception) => [exception.id, exception]));

    return this.applyNormalizedTaxonomy(rows).map((row) => {
      if (!row.taxonomy_exception_id) {
        return row;
      }

      const exception = exceptionById.get(row.taxonomy_exception_id);
      if (!exception || exception.status !== 'resolved' || !exception.resolvedCode) {
        return row;
      }

      if (exception.type === 'fund') {
        return {
          ...row,
          taxonomy_exception_id: null,
          normalized_fund: row.normalized_fund ?? exception.resolvedCode,
        };
      }

      if (exception.type === 'appeal') {
        return {
          ...row,
          taxonomy_exception_id: null,
          normalized_appeal: row.normalized_appeal ?? exception.resolvedCode,
        };
      }

      return row;
    });
  }

  async queueTaxonomyExceptions(rows: any[]): Promise<any> {
    const normalizedRows = this.applyNormalizedTaxonomy(rows);
    const violations: any[] = [];
    const exceptions: any[] = [];
    let resolvedCount = 0;
    let unmappedCount = 0;
    let exCount = await this.exceptionRepo.count();

    const queuedRows = [];
    for (const row of normalizedRows) {
      let taxonomyExceptionId = row.taxonomy_exception_id ?? null;

      const checks: Array<{ rawValue: string | null; type: string; normalizedCode: string | null }> = [
        { rawValue: row.raw_fund, type: 'fund', normalizedCode: row.normalized_fund ?? null },
        { rawValue: row.raw_appeal, type: 'appeal', normalizedCode: row.normalized_appeal ?? null },
      ];

      for (const check of checks) {
        if (!check.rawValue?.trim()) continue;
        if (check.normalizedCode) {
          resolvedCount++;
          continue;
        }

        const suggestedCode = LEGACY_MAPPINGS.find(
          (mapping) => mapping.type === check.type && this.normalizeRawValue(check.rawValue).includes(mapping.legacyValue.toLowerCase().split(' ')[0]),
        )?.canonicalCode ?? null;

        violations.push({
          rowRef: row.source_row_ref,
          field: check.type,
          rawValue: check.rawValue,
          suggestedCode,
        });

        const exceptionId = 'EX-' + String(1000 + exCount++).padStart(4, '0');
        const exception = this.exceptionRepo.create({
          id: exceptionId,
          rawValue: check.rawValue,
          type: check.type,
          sourceRowRef: row.source_row_ref,
          sessionId: row.sessionId ?? null,
          status: 'open',
          resolvedCode: suggestedCode,
          notes: null,
          assignedTo: null,
          resolvedAt: null,
        });
        await this.exceptionRepo.save(exception);
        exceptions.push(exception);
        taxonomyExceptionId = taxonomyExceptionId ?? exceptionId;
        unmappedCount++;
      }

      queuedRows.push({ ...row, taxonomy_exception_id: taxonomyExceptionId });
    }

    return { rows: queuedRows, violations, exceptions, resolvedCount, unmappedCount };
  }

  async evaluateTaxonomy(rows: any[]): Promise<any> {
    const normalizedRows = await this.hydrateResolvedExceptions(rows);
    const violations: any[] = [];
    let resolvedCount = 0;
    let unmappedCount = 0;

    for (const row of normalizedRows) {
      const checks: Array<{ rawValue: string | null; type: string; normalizedCode: string | null }> = [
        { rawValue: row.raw_fund, type: 'fund', normalizedCode: row.normalized_fund ?? null },
        { rawValue: row.raw_appeal, type: 'appeal', normalizedCode: row.normalized_appeal ?? null },
      ];

      for (const check of checks) {
        if (!check.rawValue?.trim()) continue;
        if (check.normalizedCode) {
          resolvedCount++;
          continue;
        }

        unmappedCount++;
        violations.push({ rowRef: row.source_row_ref, field: check.type, rawValue: check.rawValue, suggestedCode: null });
      }
    }

    return { violations, exceptions: [], resolvedCount, unmappedCount };
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
    return { registry: TAXONOMY_REGISTRY, legacyMappings: LEGACY_MAPPINGS, exceptions: dbExceptions };
  }

  async resolveException(exceptionId: string, payload: { resolvedCode: string; notes?: string; assignedTo?: string }): Promise<any> {
    const exception = await this.exceptionRepo.findOne({ where: { id: exceptionId } });
    if (!exception) {
      throw new Error('Taxonomy exception ' + exceptionId + ' not found.');
    }

    const updated = this.exceptionRepo.create({
      ...exception,
      status: 'resolved',
      resolvedCode: payload.resolvedCode,
      notes: payload.notes ?? exception.notes ?? null,
      assignedTo: payload.assignedTo ?? exception.assignedTo ?? null,
      resolvedAt: new Date(),
    });

    await this.exceptionRepo.save(updated);
    return { exception: updated };
  }

}
