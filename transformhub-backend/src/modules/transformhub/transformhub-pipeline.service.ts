import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { join } from 'path';
import { TRANSFORMHUB_MAX_BASE64_CHARS, TRANSFORMHUB_MAX_TEXT_CHARS, TRANSFORMHUB_MAX_XLSX_BUFFER_BYTES } from './transformhub.constants';
import { ThSchemaTemplate } from '../../database/entities/th-schema-template.entity';
import { TransformHubAiService } from './transformhub-ai.service';

type FileClass = 'ledger' | 'constituent' | 'donor' | 'campaign' | 'coa' | 'unknown';

type ClassExpectation = {
  reportType: string;
  canonicalModel: string;
  expectedFields: string[];
};

export const COA = [
  { id: '14', code: '1000', name: 'Operating Cash' },
  { id: '18', code: '1100', name: 'Accounts Receivable' },
  { id: '27', code: '5000', name: 'Repairs and Maintenance' },
  { id: '81', code: '6100', name: 'Rental Income' },
  { id: '82', code: '7205', name: 'Management Fee' },
  { id: '91', code: '9999', name: 'Suspense Clearing' },
];

export const TAXONOMY_REGISTRY = [
  { code: 'ANNUAL-FUND', label: 'Annual Fund', type: 'fund', requiredFields: ['date', 'amount'], effectiveFrom: '2020-01-01', retiredAt: null },
  { code: 'ENDOWMENT-FUND', label: 'Endowment Fund', type: 'fund', requiredFields: ['date', 'amount'], effectiveFrom: '2020-01-01', retiredAt: null },
  { code: 'GENERAL-OPERATING', label: 'General Operating', type: 'fund', requiredFields: ['date', 'amount'], effectiveFrom: '2020-01-01', retiredAt: null },
  { code: 'RESTRICTED-SCHOLARSHIP', label: 'Restricted Scholarship', type: 'fund', requiredFields: ['date', 'amount'], effectiveFrom: '2022-01-01', retiredAt: null },
  { code: 'CAPITAL-FUND', label: 'Capital Campaign Fund', type: 'fund', requiredFields: ['date', 'amount'], effectiveFrom: '2024-01-01', retiredAt: null },
  { code: 'APPEAL-SPRING-2026', label: 'Spring Appeal 2026', type: 'appeal', requiredFields: ['date'], effectiveFrom: '2026-01-01', retiredAt: '2026-06-30' },
  { code: 'APPEAL-YEAR-END-2025', label: 'Year-End Appeal 2025', type: 'appeal', requiredFields: ['date'], effectiveFrom: '2025-10-01', retiredAt: '2026-01-31' },
  { code: 'APPEAL-MAJOR', label: 'Major Gifts Appeal', type: 'appeal', requiredFields: ['date', 'amount'], effectiveFrom: '2020-01-01', retiredAt: null },
  { code: 'CAPITAL-CAMPAIGN-2026', label: 'Capital Campaign 2026', type: 'campaign', requiredFields: ['date', 'amount'], effectiveFrom: '2025-07-01', retiredAt: null },
  { code: 'EMERGENCY-RELIEF', label: 'Emergency Relief Campaign', type: 'campaign', requiredFields: ['date'], effectiveFrom: '2020-01-01', retiredAt: null },
];

export const LEGACY_MAPPINGS = [
  { legacyValue: 'ann fund', canonicalCode: 'ANNUAL-FUND', type: 'fund' },
  { legacyValue: 'ann fund 24', canonicalCode: 'ANNUAL-FUND', type: 'fund' },
  { legacyValue: 'annual fund', canonicalCode: 'ANNUAL-FUND', type: 'fund' },
  { legacyValue: 'endowment', canonicalCode: 'ENDOWMENT-FUND', type: 'fund' },
  { legacyValue: 'general operating', canonicalCode: 'GENERAL-OPERATING', type: 'fund' },
  { legacyValue: 'capital campaign', canonicalCode: 'CAPITAL-CAMPAIGN-2026', type: 'campaign' },
  { legacyValue: 'spring 26', canonicalCode: 'APPEAL-SPRING-2026', type: 'appeal' },
  { legacyValue: 'spring email 2026', canonicalCode: 'APPEAL-SPRING-2026', type: 'appeal' },
  { legacyValue: 'appeal-annual/2024', canonicalCode: 'ANNUAL-FUND', type: 'appeal' },
  { legacyValue: 'major gifts', canonicalCode: 'APPEAL-MAJOR', type: 'appeal' },
  { legacyValue: 'major gift', canonicalCode: 'APPEAL-MAJOR', type: 'appeal' },
  { legacyValue: 'emergency relief fund', canonicalCode: 'EMERGENCY-RELIEF', type: 'fund' },
];

const FIELD_ALIASES: Record<string, Record<string, string[]>> = {
  AppFolio: {
    date: ['transaction date', 'date'],
    entity_name: ['property', 'entity', 'property name'],
    gl_account: ['gl account', 'account', 'account name'],
    amount: ['amount', 'net amount'],
    memo: ['description', 'memo'],
    currency: ['currency'],
    debit: ['debit'],
    credit: ['credit'],
  },
  Buildium: {
    date: ['posting date', 'date'],
    entity_name: ['fund', 'property', 'entity'],
    account_code: ['account number', 'account code'],
    account_name: ['account name'],
    debit: ['debit'],
    credit: ['credit'],
    memo: ['memo', 'description'],
    currency: ['currency'],
  },
  Shopify: {
    date: ['created at', 'date'],
    entity_name: ['store', 'shop'],
    amount: ['total price', 'subtotal price', 'net sales'],
    memo: ['financial status', 'description'],
    currency: ['currency'],
  },
  Stripe: {
    date: ['created', 'date'],
    entity_name: ['description', 'customer'],
    amount: ['amount', 'net'],
    memo: ['description'],
    currency: ['currency'],
  },
  TikTok: {
    date: ['transaction time', 'date'],
    entity_name: ['campaign', 'ad group', 'entity'],
    amount: ['spend', 'amount'],
    memo: ['reference id', 'description'],
    currency: ['currency'],
  },
  Bloomerang: {
    date: ['date', 'gift date', 'transaction date', 'posted date'],
    entity_name: ['constituent name', 'donor name', 'full name', 'name'],
    amount: ['amount', 'credit amount', 'gift amount'],
    fund: ['fund', 'fund name'],
    appeal: ['appeal', 'appeal name', 'source'],
    memo: ['note', 'notes', 'memo', 'description'],
    currency: ['currency'],
    email: ['email address', 'email'],
    phone: ['mobile phone', 'home phone', 'phone'],
    address: ['mailing address', 'address'],
  },
  Salesforce: {
    date: ['closedate', 'close date', 'date', 'created date'],
    entity_name: ['account name', 'contact name', 'full name', 'name'],
    amount: ['amount'],
    fund: ['campaign', 'fund', 'record type'],
    appeal: ['appeal', 'appeal code', 'source'],
    memo: ['description', 'notes', 'note'],
    currency: ['currencyisocode', 'currency'],
    email: ['email'],
    phone: ['phone'],
  },
  NeonOne: {
    date: ['payment date', 'transaction date', 'date'],
    entity_name: ['account name', 'full name', 'name'],
    amount: ['total amount paid', 'amount', 'gift amount'],
    fund: ['fund name', 'fund', 'designation'],
    appeal: ['source', 'appeal', 'campaign'],
    memo: ['note', 'notes', 'memo'],
    currency: ['currency'],
    email: ['email 1', 'email'],
    phone: ['mobile phone', 'phone'],
  },
  GiveButter: {
    date: ['date', 'created at', 'transaction date'],
    entity_name: ['name', 'donor name', 'full name'],
    amount: ['amount', 'gross amount', 'total'],
    fund: ['campaign name', 'fund', 'campaign'],
    appeal: ['appeal', 'source'],
    memo: ['message', 'note', 'description'],
    currency: ['currency'],
    email: ['email'],
  },
  Xero: {
    date: ['date', 'invoice date', 'transaction date'],
    entity_name: ['name', 'contact', 'contact name'],
    account_code: ['account code', 'code'],
    account_name: ['account name', 'account'],
    debit: ['debit'],
    credit: ['credit'],
    memo: ['description', 'reference', 'memo'],
    currency: ['currency code', 'currency'],
  },
};

const CLASS_FIELD_ALIASES: Record<FileClass, Record<string, string[]>> = {
  ledger: {},
  constituent: {
    constituent_type: ['constituent type', 'record type', 'type'],
    first_name: ['first name'],
    last_name: ['last name', 'last'],
    organization_name: ['organization name', 'organization', 'account name'],
    household_name: ['household name'],
    email: ['email address', 'email', 'email 1'],
    phone: ['phone number', 'phone', 'mobile phone', 'home phone'],
    address: ['address', 'mailing address'],
    city: ['city'],
    state: ['state'],
    postal_code: ['zip code', 'zip', 'postal code'],
    country: ['country'],
    created_at: ['created date', 'created at', 'created'],
    updated_at: ['last updated date', 'updated at', 'last modified date'],
    tags: ['tags', 'categories'],
    assigned_staff: ['assigned staff', 'owner'],
  },
  donor: {
    date: ['date', 'gift date', 'payment date', 'transaction date', 'close date', 'closedate'],
    donor_name: ['constituent name', 'donor name', 'full name', 'name', 'account name', 'contact name'],
    amount: ['amount', 'gift amount', 'total amount paid', 'gross amount', 'total'],
    fund: ['fund', 'fund name', 'designation', 'campaign', 'campaign name'],
    appeal: ['appeal', 'appeal name', 'source'],
    email: ['email', 'email address', 'email 1'],
    memo: ['note', 'notes', 'memo', 'description', 'message'],
    currency: ['currency', 'currencyisocode'],
  },
  campaign: {
    code: ['code', 'campaign code', 'appeal code', 'fund code'],
    campaign_name: ['campaign', 'campaign name', 'appeal', 'appeal name', 'fund', 'fund name'],
    start_date: ['start date', 'effective from', 'created date'],
    end_date: ['end date', 'retired at', 'last updated date'],
    status: ['status', 'state', 'active'],
    goal_amount: ['goal', 'goal amount', 'target amount'],
  },
  coa: {
    account_code: ['account code', 'account number', 'code', 'gl account'],
    account_name: ['account name', 'name', 'gl account'],
    account_type: ['account type', 'type', 'category'],
    balance: ['balance', 'amount', 'net amount'],
  },
  unknown: {},
};

const CLASS_ALIAS_CONFIDENCE_THRESHOLD = 0.6;

const CLASS_EXPECTATIONS: Record<FileClass, ClassExpectation> = {
  ledger: { reportType: 'general-ledger', canonicalModel: 'canonical-ledger-row', expectedFields: ['date', 'entity_name', 'memo', 'account_or_amount_shape'] },
  constituent: { reportType: 'constituent-export', canonicalModel: 'canonical-constituent', expectedFields: ['first_name_or_org', 'email_or_phone', 'created_at'] },
  donor: { reportType: 'donor-export', canonicalModel: 'canonical-donor', expectedFields: ['date', 'donor_name', 'amount'] },
  campaign: { reportType: 'campaign-export', canonicalModel: 'canonical-campaign', expectedFields: ['campaign_name_or_code'] },
  coa: { reportType: 'chart-of-accounts', canonicalModel: 'canonical-account', expectedFields: ['account_code', 'account_name'] },
  unknown: { reportType: 'unknown', canonicalModel: 'raw-record', expectedFields: [] },
};

@Injectable()
export class TransformHubPipelineService implements OnModuleInit {
  private readonly logger = new Logger(TransformHubPipelineService.name);
  private readonly templateCache = new Map<string, any>();

  constructor(
    @InjectRepository(ThSchemaTemplate)
    private readonly schemaTemplateRepo: Repository<ThSchemaTemplate>,
    private readonly ai: TransformHubAiService,
  ) {}

  async onModuleInit() {
    const templates = await this.schemaTemplateRepo.find();
    templates.forEach((template) => {
      this.templateCache.set(template.fingerprint, {
        reportType: template.reportType,
        fileClass: 'ledger',
        canonicalModel: 'canonical-ledger-row',
        expectedFields: CLASS_EXPECTATIONS.ledger.expectedFields,
        fieldMap: template.fieldMap,
        unresolvedFields: template.unresolvedFields,
        confidence: 1,
        fingerprint: template.fingerprint,
        fromTemplateCache: true,
      });
    });
  }

  getChartOfAccounts() { return COA; }
  getTaxonomyRegistry() { return TAXONOMY_REGISTRY; }
  getLegacyMappings() { return LEGACY_MAPPINGS; }

  createFingerprint(...parts: any[]): string {
    return createHash('sha256').update(parts.flat().join('|')).digest('hex');
  }

  private sanitizeHeader(value: string): string {
    return String(value).trim().toLowerCase().replace(/[_-]+/g, ' ');
  }

  private inferDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
    const candidates = [',', '\t', ';', '|'];
    return candidates.reduce(
      (best, c) => { const score = firstLine.split(c).length; return score > best.score ? { delimiter: c, score } : best; },
      { delimiter: ',', score: 0 },
    ).delimiter;
  }

  private splitLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
        continue;
      }
      if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += char;
    }
    result.push(current.trim());
    return result;
  }

  private classifyStructuralRow(cells: string[]): string {
    const nonEmptyCount = cells.filter((c) => String(c || '').trim()).length;
    if (nonEmptyCount === 0) return 'blank';
    const joined = cells.join(' | ').trim().toLowerCase();
    if (/subtotal|grand total|total for|net total|summary total/.test(joined)) return 'subtotal';
    if (/generated on|report generated|prepared by|printed on|page \d+ of \d+|end of report/.test(joined)) return 'footer';
    if (nonEmptyCount === 1 && /report|statement|ledger|export|generated|prepared|page \d+/.test(joined)) return 'footer';
    return 'data';
  }

  private scoreHeaderRow(platform: string, cells: string[]): number {
    const aliases = Object.values(FIELD_ALIASES[platform] || {}).flat();
    const normalized = cells.map((c) => this.sanitizeHeader(c)).filter(Boolean);
    const distinct = new Set(normalized);
    let score = 0;
    normalized.forEach((cell) => {
      if (aliases.includes(cell)) score += 4;
      if (/date|account|amount|credit|debit|description|memo|currency|property|campaign|store|fund/.test(cell)) score += 2;
      if (cell.length > 2 && !/^[\d.$-]+$/.test(cell)) score += 1;
    });
    if (distinct.size === normalized.length) score += 1;
    if (normalized.length >= 3) score += 1;
    return score;
  }

  private analyzeStructure(platform: string, matrix: string[][]): any {
    const copy = [...matrix];
    while (copy.length > 0 && copy[copy.length - 1].every((c) => !String(c || '').trim())) copy.pop();
    const rows = copy.map((row) => row.map((c) => String(c || '').trim()));
    if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');

    const scanLimit = Math.min(rows.length, 8);
    let headerRowIndex = 0, bestScore = -1;
    for (let i = 0; i < scanLimit; i++) {
      const score = this.scoreHeaderRow(platform, rows[i]);
      if (score > bestScore) { bestScore = score; headerRowIndex = i; }
    }

    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const headers = Array.from({ length: width }, (_, i) => String(rows[headerRowIndex][i] || '').trim() || `Column ${i + 1}`);
    const rowRoleSummary: Record<string, number> = { data: 0, blank: 0, subtotal: 0, footer: 0 };
    const parsedRows: any[] = [];

    for (let ri = headerRowIndex + 1; ri < rows.length; ri++) {
      const cells = Array.from({ length: width }, (_, i) => String(rows[ri][i] || '').trim());
      const role = this.classifyStructuralRow(cells);
      rowRoleSummary[role]++;
      if (role !== 'data') continue;
      const values = headers.reduce((acc, h, hi) => { acc[h] = cells[hi] ?? ''; return acc; }, {} as Record<string, string>);
      if (Object.values(values).some((v) => String(v).trim())) parsedRows.push({ ref: `row-${ri + 1}`, values });
    }

    const warnings: string[] = [];
    if (headerRowIndex > 0) warnings.push(`Detected header on row ${headerRowIndex + 1}; skipped ${headerRowIndex} top row(s).`);
    if (rowRoleSummary.subtotal > 0) warnings.push(`Removed ${rowRoleSummary.subtotal} subtotal row(s).`);
    if (rowRoleSummary.footer > 0) warnings.push(`Removed ${rowRoleSummary.footer} footer row(s).`);
    if (rowRoleSummary.blank > 0) warnings.push(`Ignored ${rowRoleSummary.blank} blank row(s).`);

    return {
      headers, rows: parsedRows,
      structureAnalysis: { headerRowIndex: headerRowIndex + 1, skippedTopRows: headerRowIndex, removedRows: rowRoleSummary.blank + rowRoleSummary.subtotal + rowRoleSummary.footer, rawRowCount: rows.length, dataRowCount: parsedRows.length, rowRoleSummary, warnings },
    };
  }

  parseDelimitedFile(fileName: string, text: string, platform: string): any {
    const delimiter = this.inferDelimiter(text);
    const matrix = text.split(/\r?\n/).map((line) => this.splitLine(line, delimiter));
    const s = this.analyzeStructure(platform, matrix);
    return { fileName, delimiter, headers: s.headers, rows: s.rows, platform, structureAnalysis: s.structureAnalysis };
  }

  async parseXlsxFile(fileName: string, contentsBase64: string, platform: string): Promise<any> {
    if (contentsBase64.length > TRANSFORMHUB_MAX_BASE64_CHARS) {
      throw new Error(`XLSX upload exceeds ${TRANSFORMHUB_MAX_BASE64_CHARS} base64 characters.`);
    }

    const scriptPath = join(process.cwd(), 'scripts', 'parse_xlsx.py');

    return new Promise((resolve, reject) => {
      const child = spawn('python3', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;

      const finishWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(error);
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.on('error', (error) => finishWithError(error));

      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout, 'utf8') > TRANSFORMHUB_MAX_XLSX_BUFFER_BYTES) {
          finishWithError(new Error('Parsed XLSX output exceeds the maximum allowed size.'));
        }
      });

      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;

        if (code !== 0) {
          reject(new Error(stderr.trim() || 'Failed to parse XLSX file.'));
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const s = this.analyzeStructure(platform, parsed.raw_rows || []);
          resolve({ fileName, delimiter: 'xlsx', headers: s.headers, rows: s.rows, platform, structureAnalysis: s.structureAnalysis });
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Failed to parse XLSX file.'));
        }
      });

      child.stdin.end(JSON.stringify({ contents_base64: contentsBase64 }));
    });
  }

  async parseInboundFile(body: any): Promise<any> {
    const platform = body.platform || 'AppFolio';
    const fileName = body.fileName || 'upload.csv';
    if (body.kind === 'xlsx') return this.parseXlsxFile(fileName, body.contentsBase64 || '', platform);

    const contents = body.contents || '';
    if (contents.length > TRANSFORMHUB_MAX_TEXT_CHARS) {
      throw new Error(`Delimited upload exceeds ${TRANSFORMHUB_MAX_TEXT_CHARS} characters.`);
    }

    return this.parseDelimitedFile(fileName, contents, platform);
  }

  private findHeader(headers: string[], aliases: string[]): string | undefined {
    return headers.map((h) => ({ original: h, normalized: this.sanitizeHeader(h) })).find((h) => aliases.includes(h.normalized))?.original;
  }

  private hasAny(normalized: string[], needles: string[]): boolean {
    return needles.some((needle) => normalized.includes(needle));
  }

  private detectFileClass(platform: string, headers: string[]): FileClass {
    const normalized = headers.map((h) => this.sanitizeHeader(h));
    const hasDate = this.hasAny(normalized, ['date', 'transaction date', 'posting date', 'gift date', 'payment date', 'closedate', 'close date', 'created at']);
    const hasDebitCredit = normalized.includes('debit') || normalized.includes('credit');
    const hasAccount = this.hasAny(normalized, ['gl account', 'account code', 'account number', 'account name']);
    const hasAmount = normalized.some((h) => /amount|total amount paid|gift amount|gross amount|net amount|spend/.test(h));
    const hasConstituentSignals = normalized.includes('constituent type') || normalized.includes('household name') || normalized.includes('first name') || normalized.includes('organization name');
    const hasDonorSignals = this.hasAny(normalized, ['fund', 'fund name', 'appeal', 'appeal name', 'campaign', 'campaign name']);
    const hasCoaSignals = hasAccount && !hasDate && !hasDebitCredit && !this.hasAny(normalized, ['description', 'memo', 'entity', 'property', 'contact']);
    const hasCampaignSignals = this.hasAny(normalized, ['campaign', 'campaign name', 'appeal', 'appeal name', 'fund code', 'campaign code']) && this.hasAny(normalized, ['status', 'start date', 'end date', 'goal']);

    if (hasConstituentSignals && !hasAmount) return 'constituent';
    if (hasDebitCredit || (hasDate && hasAccount) || ((platform === 'AppFolio' || platform === 'Xero' || platform === 'Buildium') && hasAccount)) return 'ledger';
    if (hasCoaSignals) return 'coa';
    if (hasCampaignSignals) return 'campaign';
    if (hasAmount && (hasDate || hasDonorSignals || platform === 'GiveButter')) return 'donor';
    if (platform === 'Bloomerang' || platform === 'Salesforce' || platform === 'NeonOne') return hasAmount ? 'donor' : 'constituent';
    return 'unknown';
  }

  private resolveClassFieldMap(headers: string[], aliases: Record<string, string[]>): Record<string, string> {
    const fieldMap: Record<string, string> = {};
    Object.entries(aliases).forEach(([target, names]) => {
      const header = this.findHeader(headers, names);
      if (header) fieldMap[target] = header;
    });
    return fieldMap;
  }

  private normalizeFieldMap(fieldMap: Record<string, string>): Record<string, string> {
    const normalized = { ...fieldMap };
    if (normalized.gl_account && !normalized.account_code) {
      normalized.account_code = normalized.gl_account;
      normalized.account_name = normalized.gl_account;
    }
    return normalized;
  }

  private isExpectedFieldResolved(fieldMap: Record<string, string>, field: string): boolean {
    if (field === 'account_or_amount_shape') {
      return Boolean(fieldMap.account_code || fieldMap.amount || (fieldMap.debit && fieldMap.credit));
    }
    if (field === 'first_name_or_org') {
      return Boolean(fieldMap.first_name || fieldMap.organization_name || fieldMap.household_name);
    }
    if (field === 'email_or_phone') {
      return Boolean(fieldMap.email || fieldMap.phone);
    }
    if (field === 'campaign_name_or_code') {
      return Boolean(fieldMap.campaign_name || fieldMap.code);
    }
    return Boolean(fieldMap[field]);
  }

  private buildSchemaCandidate(file: any, fileClass: FileClass, fieldMapOverrides: Record<string, string> = {}) {
    const expectation = CLASS_EXPECTATIONS[fileClass];
    const aliases = fileClass === 'ledger' ? (FIELD_ALIASES[file.platform] || {}) : CLASS_FIELD_ALIASES[fileClass];
    const fieldMap = this.normalizeFieldMap({
      ...this.resolveClassFieldMap(file.headers, aliases),
      ...fieldMapOverrides,
    });
    const unresolvedFields = expectation.expectedFields.filter((field) => !this.isExpectedFieldResolved(fieldMap, field));
    const denominator = Math.max(1, expectation.expectedFields.length);
    const matchedCriticalFields = denominator - unresolvedFields.length;
    const aliasCoverage = matchedCriticalFields / denominator;
    const confidenceFloor = fileClass === 'unknown' ? 0.2 : 0.45;
    const confidence = Math.max(confidenceFloor, Math.min(0.95, aliasCoverage));

    return {
      fileClass,
      expectation,
      fieldMap,
      unresolvedFields,
      matchedCriticalFields,
      aliasCoverage,
      confidence,
    };
  }

  private getAiClassFieldOptions(platform: string): Record<string, string[]> {
    return {
      ledger: Object.keys(FIELD_ALIASES[platform] || {}),
      constituent: Object.keys(CLASS_FIELD_ALIASES.constituent),
      donor: Object.keys(CLASS_FIELD_ALIASES.donor),
      campaign: Object.keys(CLASS_FIELD_ALIASES.campaign),
      coa: Object.keys(CLASS_FIELD_ALIASES.coa),
      unknown: [],
    };
  }

  private detectReportType(platform: string, headers: string[], fileClass: FileClass): string {
    const normalized = headers.map((h) => this.sanitizeHeader(h));
    if (fileClass === 'ledger') {
      if ((platform === 'AppFolio' || platform === 'Xero') && normalized.includes('gl account')) return 'general-ledger';
      if (platform === 'Xero' || platform === 'Buildium') return 'general-ledger';
      if (platform === 'Stripe') return 'payout-export';
      if (platform === 'Shopify') return 'sales-export';
      if (platform === 'TikTok') return 'ad-spend';
      return 'general-ledger';
    }
    return CLASS_EXPECTATIONS[fileClass].reportType;
  }

  resolveTaxonomyValue(rawValue: string): boolean {
    const normalized = String(rawValue).toLowerCase().trim();
    const inRegistry = TAXONOMY_REGISTRY.some((c) => c.code.toLowerCase() === normalized || c.label.toLowerCase() === normalized);
    if (inRegistry) return true;
    return LEGACY_MAPPINGS.some((m) => m.legacyValue.toLowerCase() === normalized);
  }

  async resolveSchema(file: any): Promise<any> {
    const structuralClass = this.detectFileClass(file.platform, file.headers);
    const classCandidates = (['ledger', 'constituent', 'donor', 'campaign', 'coa'] as FileClass[])
      .map((fileClass) => {
        const candidate = this.buildSchemaCandidate(file, fileClass);
        const structuralBonus = fileClass === structuralClass ? 0.08 : 0;
        return {
          ...candidate,
          score: candidate.aliasCoverage + structuralBonus,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.matchedCriticalFields !== a.matchedCriticalFields) return b.matchedCriticalFields - a.matchedCriticalFields;
        return a.fileClass.localeCompare(b.fileClass);
      });

    let selected = classCandidates[0] ?? this.buildSchemaCandidate(file, structuralClass === 'unknown' ? 'ledger' : structuralClass);
    let aiSuggested = false;
    let aiSuggestedFieldMap: Record<string, string> = {};
    let aiReasoning: string | null = null;

    const shouldUseAiForClassification = selected.fileClass !== 'ledger' && selected.aliasCoverage < CLASS_ALIAS_CONFIDENCE_THRESHOLD;
    if (shouldUseAiForClassification) {
      this.logger.log(`Triggering AI schema class+mappings fallback for platform ${file.platform} with candidate ${selected.fileClass} at alias coverage ${selected.aliasCoverage.toFixed(2)}.`);
      const aiResult = await this.ai.suggestSchemaClassAndMappings(
        file.platform,
        file.headers,
        file.rows,
        this.getAiClassFieldOptions(file.platform),
      );

      const aiFileClass = ['ledger', 'constituent', 'donor', 'campaign', 'coa', 'unknown'].includes(aiResult?.fileClass || '')
        ? (aiResult?.fileClass as FileClass)
        : 'unknown';

      if (aiResult && aiFileClass !== 'unknown') {
        selected = this.buildSchemaCandidate(file, aiFileClass, aiResult.fieldMap);
        aiSuggested = true;
        aiSuggestedFieldMap = { ...aiResult.fieldMap };
        aiReasoning = aiResult.reasoning;
        selected.confidence = Math.max(selected.confidence, Math.min(0.88, Math.max(0.62, selected.aliasCoverage)));
      }
    }

    const fingerprint = this.createFingerprint(file.platform, selected.fileClass, file.headers);
    const cached = this.templateCache.get(fingerprint);
    if (cached) {
      return {
        ...cached,
        fileClass: selected.fileClass,
        canonicalModel: cached.canonicalModel || selected.expectation.canonicalModel,
        expectedFields: cached.expectedFields || selected.expectation.expectedFields,
        reportType: cached.reportType || this.detectReportType(file.platform, file.headers, selected.fileClass),
        confidence: 1,
        fingerprint,
        fromTemplateCache: true,
      };
    }

    if (selected.fileClass === 'ledger' && selected.confidence < 0.9 && selected.unresolvedFields.length > 0) {
      this.logger.log(`Triggering AI ledger field-mapping fallback for platform ${file.platform} with confidence ${selected.confidence.toFixed(2)} and unresolved fields: ${selected.unresolvedFields.join(', ')}`);
      const aiResult = await this.ai.suggestFieldMappings(file.platform, file.headers, selected.unresolvedFields, file.rows);
      if (aiResult && Object.keys(aiResult.fieldMap).length > 0) {
        selected = this.buildSchemaCandidate(file, 'ledger', aiResult.fieldMap);
        aiSuggested = true;
        aiReasoning = aiResult.reasoning;
        aiSuggestedFieldMap = { ...aiSuggestedFieldMap, ...aiResult.fieldMap };
        selected.confidence = Math.max(selected.confidence, Math.min(0.91, Math.max(0.45, selected.aliasCoverage)));
      }
    }

    return {
      reportType: this.detectReportType(file.platform, file.headers, selected.fileClass),
      fileClass: selected.fileClass,
      canonicalModel: selected.expectation.canonicalModel,
      expectedFields: selected.expectation.expectedFields,
      confidence: selected.confidence,
      fieldMap: selected.fieldMap,
      unresolvedFields: selected.unresolvedFields,
      fingerprint,
      fromTemplateCache: false,
      aiSuggested,
      aiSuggestedFieldMap,
      aiReasoning,
      requiresHumanApproval: aiSuggested,
    };
  }

  async persistResolvedTemplate(platform: string, schema: any) {
    if (schema.fileClass !== 'ledger') return;
    if (schema.confidence < 0.98 || !schema.fingerprint || schema.aiSuggested) return;

    await this.schemaTemplateRepo.save(
      this.schemaTemplateRepo.create({
        fingerprint: schema.fingerprint,
        platform,
        reportType: schema.reportType,
        fieldMap: schema.fieldMap,
        unresolvedFields: schema.unresolvedFields,
      }),
    );
  }

  private detectCurrencyDateConflict(rows: any[]): boolean {
    const currencies = new Set<string>();
    const dateKinds = new Set<string>();
    rows.forEach((row) => {
      Object.values(row.values as Record<string, string>).forEach((value) => {
        const t = value.trim();
        if (/^[A-Z]{3}$/.test(t)) currencies.add(t);
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) dateKinds.add('iso');
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) dateKinds.add('slash');
      });
    });
    return currencies.size > 1 || dateKinds.size > 1;
  }

  evaluateGuardrails(file: any, schema: any): any[] {
    const normalized = file.headers.map((h) => this.sanitizeHeader(h));
    const amountLike = normalized.filter((h) => /amount|net|total|spend/.test(h));
    const hasTaxonomyFields = Boolean(schema.fieldMap.fund || schema.fieldMap.appeal || schema.fieldMap.campaign_name);
    const isLedger = schema.fileClass === 'ledger';
    const isDonor = schema.fileClass === 'donor';
    let taxonomyViolationTriggered = false;

    if (hasTaxonomyFields && (isLedger || isDonor || schema.fileClass === 'campaign')) {
      for (const row of file.rows) {
        const rawFund = schema.fieldMap.fund ? row.values[schema.fieldMap.fund] : '';
        const rawAppeal = schema.fieldMap.appeal ? row.values[schema.fieldMap.appeal] : '';
        if (rawFund && !this.resolveTaxonomyValue(rawFund)) { taxonomyViolationTriggered = true; break; }
        if (rawAppeal && !this.resolveTaxonomyValue(rawAppeal)) { taxonomyViolationTriggered = true; break; }
      }
    }

    return [
      { code: 'LOW_REPORT_CONFIDENCE', label: 'Report confidence', triggered: schema.confidence < 0.9, detail: 'Schema confidence is below 0.9.' },
      { code: 'AMOUNT_COLUMN_AMBIGUITY', label: 'Amount ambiguity', triggered: isLedger && amountLike.length > 1 && !(schema.fieldMap.debit && schema.fieldMap.credit), detail: 'Multiple plausible amount columns without debit/credit shape.' },
      { code: 'MIXED_AMOUNT_SHAPES', label: 'Mixed amount shapes', triggered: isLedger && Boolean(schema.fieldMap.amount && (schema.fieldMap.debit || schema.fieldMap.credit)), detail: 'Single-amount and debit-credit columns appear together.' },
      { code: 'UNRESOLVED_KEY_FIELDS', label: 'Unresolved keys', triggered: schema.unresolvedFields.length >= (schema.fileClass === 'unknown' ? 1 : 2), detail: 'Two or more critical fields remain unresolved.' },
      { code: 'UNSTABLE_SUBTOTALS', label: 'Subtotal instability', triggered: file.structureAnalysis.rowRoleSummary.subtotal > 0 || file.structureAnalysis.rowRoleSummary.footer > 0, detail: 'Subtotal or footer rows detected and removed.' },
      { code: 'CURRENCY_DATE_CONFLICT', label: 'Currency/date conflict', triggered: (isLedger || isDonor) && this.detectCurrencyDateConflict(file.rows), detail: 'Mixed currency codes or date formats.' },
      { code: 'TAXONOMY_VIOLATION', label: 'Taxonomy violation', triggered: taxonomyViolationTriggered, detail: hasTaxonomyFields ? 'Unknown appeal/campaign/fund codes detected.' : 'No taxonomy fields in this file.' },
    ];
  }

  private parseAccount(rawValue: string): { code: string; name: string } {
    const trimmed = String(rawValue || '').trim();
    const match = trimmed.match(/^(\d{3,})\s*[-:]?\s*(.+)$/);
    if (match) return { code: match[1], name: match[2].trim() };
    return { code: '', name: trimmed };
  }

  private money(value: string): string {
    const cleaned = String(value || '').replace(/[^0-9.-]/g, '').trim();
    if (!cleaned) return '';
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return '';
    return Math.abs(parsed).toFixed(2);
  }

  private valueFromRow(row: any, fieldMap: Record<string, string>, key: string): string {
    return String(row.values[fieldMap[key] ?? ''] ?? '').trim();
  }

  private buildDisplayName(values: string[]): string {
    return values.map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim();
  }

  private splitTags(raw: string): string[] {
    return String(raw || '').split(/[;,]/).map((tag) => tag.trim()).filter(Boolean);
  }

  buildStructuredPreview(file: any, schema: any): any {
    const fileClass = schema.fileClass as FileClass;
    const canonicalModel = schema.canonicalModel;
    const records = file.rows.map((row: any, index: number) => {
      if (fileClass === 'constituent') {
        const firstName = this.valueFromRow(row, schema.fieldMap, 'first_name');
        const lastName = this.valueFromRow(row, schema.fieldMap, 'last_name');
        const organizationName = this.valueFromRow(row, schema.fieldMap, 'organization_name');
        const householdName = this.valueFromRow(row, schema.fieldMap, 'household_name');
        return {
          id: `${fileClass}-${index + 1}`,
          sourceRowRef: row.ref,
          displayName: organizationName || this.buildDisplayName([firstName, lastName]) || householdName || row.ref,
          constituentType: this.valueFromRow(row, schema.fieldMap, 'constituent_type'),
          firstName,
          lastName,
          organizationName,
          householdName,
          email: this.valueFromRow(row, schema.fieldMap, 'email'),
          phone: this.valueFromRow(row, schema.fieldMap, 'phone'),
          address: this.valueFromRow(row, schema.fieldMap, 'address'),
          city: this.valueFromRow(row, schema.fieldMap, 'city'),
          state: this.valueFromRow(row, schema.fieldMap, 'state'),
          postalCode: this.valueFromRow(row, schema.fieldMap, 'postal_code'),
          country: this.valueFromRow(row, schema.fieldMap, 'country'),
          tags: this.splitTags(this.valueFromRow(row, schema.fieldMap, 'tags')),
          assignedStaff: this.valueFromRow(row, schema.fieldMap, 'assigned_staff'),
          createdAt: this.valueFromRow(row, schema.fieldMap, 'created_at'),
          updatedAt: this.valueFromRow(row, schema.fieldMap, 'updated_at'),
        };
      }

      if (fileClass === 'donor') {
        return {
          id: `${fileClass}-${index + 1}`,
          sourceRowRef: row.ref,
          donorName: this.valueFromRow(row, schema.fieldMap, 'donor_name') || this.valueFromRow(row, schema.fieldMap, 'entity_name') || row.ref,
          date: this.valueFromRow(row, schema.fieldMap, 'date'),
          amount: this.money(this.valueFromRow(row, schema.fieldMap, 'amount')),
          fund: this.valueFromRow(row, schema.fieldMap, 'fund'),
          appeal: this.valueFromRow(row, schema.fieldMap, 'appeal'),
          email: this.valueFromRow(row, schema.fieldMap, 'email'),
          memo: this.valueFromRow(row, schema.fieldMap, 'memo'),
          currency: this.valueFromRow(row, schema.fieldMap, 'currency') || 'USD',
        };
      }

      if (fileClass === 'campaign') {
        return {
          id: `${fileClass}-${index + 1}`,
          sourceRowRef: row.ref,
          code: this.valueFromRow(row, schema.fieldMap, 'code'),
          campaignName: this.valueFromRow(row, schema.fieldMap, 'campaign_name') || row.ref,
          startDate: this.valueFromRow(row, schema.fieldMap, 'start_date'),
          endDate: this.valueFromRow(row, schema.fieldMap, 'end_date'),
          status: this.valueFromRow(row, schema.fieldMap, 'status'),
          goalAmount: this.money(this.valueFromRow(row, schema.fieldMap, 'goal_amount')),
        };
      }

      if (fileClass === 'coa') {
        return {
          id: `${fileClass}-${index + 1}`,
          sourceRowRef: row.ref,
          accountCode: this.valueFromRow(row, schema.fieldMap, 'account_code'),
          accountName: this.valueFromRow(row, schema.fieldMap, 'account_name'),
          accountType: this.valueFromRow(row, schema.fieldMap, 'account_type'),
          balance: this.money(this.valueFromRow(row, schema.fieldMap, 'balance')),
        };
      }

      const values = row.values as Record<string, string>;
      const preview = Object.entries(values).filter(([, value]) => String(value || '').trim()).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(' · ');
      return {
        id: `${fileClass}-${index + 1}`,
        sourceRowRef: row.ref,
        preview: preview || row.ref,
        values,
      };
    });

    return {
      fileClass,
      canonicalModel,
      summary: {
        rowCount: records.length,
        populatedFields: Object.keys(schema.fieldMap || {}).length,
        primaryLabel: fileClass === 'ledger' ? 'Ledger rows' : fileClass === 'constituent' ? 'Constituent records' : fileClass === 'donor' ? 'Donation records' : fileClass === 'campaign' ? 'Campaign rows' : fileClass === 'coa' ? 'Accounts' : 'Raw rows',
      },
      records,
    };
  }

  mapToCanonicalRows(file: any, schema: any, guardrails: any[]): any[] {
    const forceReview = guardrails.some((g) => g.triggered) || Boolean(schema.aiSuggested);
    return file.rows.map((row: any, index: number) => {
      const accountSource = row.values[schema.fieldMap.gl_account ?? schema.fieldMap.account_name ?? schema.fieldMap.account_code ?? ''] ?? '';
      const account = this.parseAccount(accountSource);
      const rawAmount = row.values[schema.fieldMap.amount ?? ''] ?? '';
      const rawDebit = row.values[schema.fieldMap.debit ?? ''] ?? '';
      const rawCredit = row.values[schema.fieldMap.credit ?? ''] ?? '';
      const numericAmount = Number(String(rawAmount).replace(/[^0-9.-]/g, '').trim() || '0');
      let debit = this.money(rawDebit), credit = this.money(rawCredit);
      let suggestedFix: string | null = null, needsReview = forceReview;

      if (!debit && !credit && String(rawAmount).trim()) {
        if (numericAmount >= 0) { debit = this.money(rawAmount); } else { credit = this.money(rawAmount); }
        needsReview = true;
        suggestedFix = 'Single amount detected. Add or confirm the opposing entry before posting.';
      }
      if (!account.code || !account.name) {
        needsReview = true;
        suggestedFix = suggestedFix ?? 'Resolve the account mapping before posting.';
      }
      if (schema.aiSuggested) {
        needsReview = true;
        suggestedFix = suggestedFix ?? '[AI suggested - requires human approval] Review the AI-suggested schema mapping before approving this row.';
      }

      const rawFund = schema.fieldMap.fund ? (row.values[schema.fieldMap.fund] ?? null) : null;
      const rawAppeal = schema.fieldMap.appeal ? (row.values[schema.fieldMap.appeal] ?? null) : null;

      return {
        id: `${String(file.platform).toLowerCase()}-${index + 1}`,
        date: row.values[schema.fieldMap.date ?? ''] ?? '',
        entity_name: row.values[schema.fieldMap.entity_name ?? ''] ?? '',
        account_code: row.values[schema.fieldMap.account_code ?? ''] ?? account.code,
        account_name: row.values[schema.fieldMap.account_name ?? ''] ?? account.name,
        debit, credit,
        currency: (schema.fieldMap.currency ? row.values[schema.fieldMap.currency] : '') || 'USD',
        memo: row.values[schema.fieldMap.memo ?? ''] ?? '',
        source_platform: file.platform,
        source_row_ref: row.ref,
        journal_id: `${String(file.platform).toLowerCase()}-${String(row.values[schema.fieldMap.date ?? ''] ?? 'journal').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${String(row.values[schema.fieldMap.entity_name ?? ''] ?? 'batch').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
        mapping_confidence: schema.confidence,
        review_status: needsReview ? 'pending' : 'approved',
        needs_review: needsReview,
        suggested_fix: suggestedFix,
        qbo_account_id: null, qbo_txn_id: null, canonical_person_id: null, canonical_household_id: null,
        raw_fund: rawFund || null, raw_appeal: rawAppeal || null, taxonomy_exception_id: null,
      };
    });
  }

  runPreflight(rows: any[]): any {
    const issues: any[] = [];
    const grouped = new Map<string, any[]>();
    const activeRows = rows.filter((r) => r.review_status !== 'rejected');

    rows.filter((r) => r.review_status === 'rejected').forEach((r) => {
      issues.push({ rowId: r.id, severity: 'warning', message: 'Row was rejected and will be excluded.' });
    });
    if (activeRows.length === 0) issues.push({ severity: 'error', message: 'No approved rows remain in the posting batch.' });

    activeRows.forEach((row) => {
      if (!row.date || !row.account_code || !row.account_name) issues.push({ rowId: row.id, severity: 'error', message: 'Missing required canonical fields.' });
      if (row.review_status === 'pending' || row.needs_review) issues.push({ rowId: row.id, severity: 'error', message: 'Row still requires human review.' });
      const coaMatch = COA.find((item) => item.code === row.account_code || item.name.toLowerCase() === String(row.account_name).toLowerCase());
      if (!coaMatch) issues.push({ rowId: row.id, severity: 'error', message: `Account not found in chart of accounts: ${row.account_code || row.account_name}` });
      const existing = grouped.get(row.journal_id) ?? [];
      existing.push({ ...row, qbo_account_id: coaMatch?.id ?? null });
      grouped.set(row.journal_id, existing);
    });

    grouped.forEach((journalRows, journalId) => {
      const debit = journalRows.reduce((sum, r) => sum + Number(r.debit || '0'), 0);
      const credit = journalRows.reduce((sum, r) => sum + Number(r.credit || '0'), 0);
      if (Math.abs(debit - credit) > 0.005) issues.push({ journalId, severity: 'error', message: `Journal ${journalId} is unbalanced: debit ${debit.toFixed(2)} vs credit ${credit.toFixed(2)}.` });
    });

    return { valid: issues.every((i) => i.severity !== 'error'), issues };
  }

  simulatePost(rows: any[], postingOffset = 0): { rows: any[]; receipts: any[]; preflight: any } {
    const preflight = this.runPreflight(rows);
    if (!preflight.valid) throw new Error('Pre-flight failed. Resolve all review and balance errors before posting.');

    const activeRows = rows.filter((r) => r.review_status !== 'rejected');
    const journalIds = Array.from(new Set(activeRows.map((r) => r.journal_id)));
    const receipts = journalIds.map((journalId, index) => ({
      journalId,
      qboTxnId: `QB-JE-${String(13001 + postingOffset + index)}`,
      idempotencyKey: this.createFingerprint(journalId, activeRows.filter((r) => r.journal_id === journalId).map((r) => r.id)),
    }));

    const postedRows = rows.map((row) => {
      if (row.review_status === 'rejected') return row;
      const coaMatch = COA.find((item) => item.code === row.account_code || item.name.toLowerCase() === String(row.account_name).toLowerCase());
      const receipt = receipts.find((r) => r.journalId === row.journal_id);
      return { ...row, qbo_account_id: coaMatch?.id ?? null, qbo_txn_id: receipt?.qboTxnId ?? null, review_status: 'approved', needs_review: false, suggested_fix: null };
    });

    return { rows: postedRows, receipts, preflight };
  }

  buildCsvFallback(rows: any[]): { fileName: string; csv: string; rowCount: number; preflight: any } {
    const preflight = this.runPreflight(rows);
    if (!preflight.valid) throw new Error('Pre-flight failed. Resolve all review and balance errors before exporting.');

    const activeRows = rows.filter((r) => r.review_status !== 'rejected');
    const lines = [
      ['TxnDate', 'JournalId', 'AccountCode', 'AccountName', 'Debit', 'Credit', 'Currency', 'Memo', 'SourcePlatform', 'SourceRowRef'].join(','),
      ...activeRows.map((row) =>
        [row.date, row.journal_id, row.account_code, row.account_name, row.debit || '', row.credit || '', row.currency, row.memo, row.source_platform, row.source_row_ref]
          .map((v) => { const cell = String(v ?? ''); return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell; }).join(','),
      ),
    ];

    return { fileName: `transformhub-fallback-${new Date().toISOString().slice(0, 10)}.csv`, csv: lines.join('\n'), rowCount: activeRows.length, preflight };
  }

  getSampleFile(platform: string): { name: string; contents: string } {
    const samples: Record<string, { name: string; contents: string }> = {
      AppFolio: { name: 'appfolio-gl.csv', contents: 'AppFolio General Ledger Export\nGenerated on,2026-03-23\nTransaction Date,Property,GL Account,Amount,Description\n2026-03-12,Sunset Villas,6100 Rental Income,-1245.50,March rent received\n2026-03-12,Sunset Villas,1000 Operating Cash,1245.50,March rent deposit\nGrand Total,,,,0.00' },
      Buildium: { name: 'buildium-export.csv', contents: 'Posting Date,Fund,Account Number,Account Name,Debit,Credit,Memo\n2026-03-12,Reserve,1000,Operating Cash,640.00,,Reserve contribution\n2026-03-12,Reserve,6100,Rental Income,,640.00,Reserve contribution' },
      Shopify: { name: 'shopify-orders.csv', contents: 'Created at,Store,Total price,Financial status,Currency\n2026-03-10,Main Store,210.55,paid,USD\n2026-03-11,Main Store,410.30,paid,USD' },
      Stripe: { name: 'stripe-payout.csv', contents: 'created,description,amount,fee,net,currency\n2026-03-12,Weekly payout,500.00,14.55,485.45,USD\n2026-03-13,Weekly payout,625.00,16.85,608.15,USD' },
      TikTok: { name: 'tiktok-spend.csv', contents: 'Transaction time,Campaign,Spend,Currency,Reference id\n2026-03-12,Spring Leasing Push,145.90,USD,TT-440\n2026-03-13,Resident Referral,92.45,USD,TT-441' },
      Bloomerang: { name: 'bloomerang-export.csv', contents: 'Date,Constituent Name,Email Address,Amount,Fund,Appeal,Note\n2026-03-10,Sarah Johnson,sarah.j@email.com,250.00,ANNUAL-FUND,APPEAL-SPRING-2026,Spring appeal gift\n2026-03-11,Robert Chen,r.chen@mail.com,1000.00,ENDOWMENT-FUND,APPEAL-MAJOR,Major gift pledge' },
      Salesforce: { name: 'salesforce-opportunities.csv', contents: 'CloseDate,Account Name,Email,Amount,Campaign,Description\n2026-03-10,Johnson Family Foundation,info@jff.org,5000.00,CAPITAL-CAMPAIGN-2026,Capital campaign gift\n2026-03-11,Robert Chen,r.chen@mail.com,1000.00,ANNUAL-FUND,Annual fund gift' },
      NeonOne: { name: 'neonone-export.csv', contents: 'Payment Date,Account Name,Email 1,Total Amount Paid,Fund Name,Source\n2026-03-10,Sarah Johnson,sarah.j@email.com,250.00,GENERAL-OPERATING,APPEAL-SPRING-2026\n2026-03-11,Johnson Family,info@jf.org,1000.00,ENDOWMENT-FUND,APPEAL-MAJOR' },
      GiveButter: { name: 'givebutter-export.csv', contents: 'Date,Name,Email,Amount,Campaign Name,Message\n2026-03-10,Sarah Johnson,sarah.j@email.com,50.00,ANNUAL-FUND,Keep up the great work!\n2026-03-11,Anonymous,,100.00,EMERGENCY-RELIEF,' },
      Xero: { name: 'xero-export.csv', contents: 'Date,Contact,Account Code,Account Name,Debit,Credit,Description\n2026-03-12,Donations Clearing,1100,Accounts Receivable,5000.00,,Batch deposit\n2026-03-12,Donations Clearing,6100,Rental Income,,5000.00,Batch deposit contra' },
    };
    return samples[platform] || samples['AppFolio'];
  }
}
