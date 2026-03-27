import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class TransformHubAiService {
  private readonly logger = new Logger(TransformHubAiService.name);
  private readonly client: OpenAI | null;
  private readonly taxonomyModel: string;
  private readonly schemaModel: string;
  private readonly suggestedFixModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey');
    this.taxonomyModel = this.configService.get<string>('openai.models.taxonomySuggestion') || 'gpt-5.4-nano';
    this.schemaModel = this.configService.get<string>('openai.models.schemaFallback') || 'gpt-5.4-mini';
    this.suggestedFixModel = this.configService.get<string>('openai.models.suggestedFix') || 'gpt-5.4-nano';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — AI enrichment disabled. Set OPENAI_API_KEY to enable.');
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async suggestTaxonomyCode(
    rawValue: string,
    type: string,
    registry: any[],
    legacyMappings: any[],
  ): Promise<{ code: string | null; reasoning: string } | null> {
    if (!this.client) return null;

    const relevantRegistry = registry.filter((entry) => entry.type === type);
    const relevantLegacy = legacyMappings.filter((entry) => entry.type === type);

    const prompt = `You are suggesting a canonical ${type} code for imported financial data.

Rules:
- This is an AI suggestion only.
- A human reviewer must approve before it is applied.
- Only return a canonical code that already exists in the registry.
- If there is no reasonable match, return null.

Raw ${type} value: "${rawValue}"

Canonical ${type} registry:
${relevantRegistry.map((entry) => `- ${entry.code}: ${entry.label}`).join('\n')}

Legacy mappings:
${relevantLegacy.map((entry) => `- "${entry.legacyValue}" -> ${entry.canonicalCode}`).join('\n')}

Respond ONLY with valid JSON: {"code": "CANONICAL-CODE" | null, "reasoning": "one short sentence"}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.taxonomyModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 120,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const code = typeof parsed.code === 'string' && parsed.code.trim() ? parsed.code.trim() : null;
      const isValidCode = code
        ? relevantRegistry.some((entry) => entry.code === code) || relevantLegacy.some((entry) => entry.canonicalCode === code)
        : true;

      return {
        code: isValidCode ? code : null,
        reasoning: String(parsed.reasoning ?? ''),
      };
    } catch (err) {
      this.logger.warn(`AI taxonomy suggestion failed for "${rawValue}": ${String(err)}`);
      return null;
    }
  }

  async suggestFieldMappings(
    platform: string,
    headers: string[],
    unresolvedFields: string[],
    sampleRows: any[],
  ): Promise<{ fieldMap: Record<string, string>; reasoning: string } | null> {
    if (!this.client || unresolvedFields.length === 0) return null;

    this.logger.log(`AI schema mapping triggered for platform ${platform} with ${headers.length} headers and unresolved fields: ${unresolvedFields.join(', ')}`);

    const sampleValues = sampleRows.slice(0, 3).map((row) => row.values ?? row);
    const prompt = `You are suggesting canonical field mappings for an imported financial data file.

Rules:
- These mappings are AI suggestions only.
- A human reviewer must approve before they are treated as final.
- Use exact header strings from the provided header list.
- Only map fields you are confident about.

Platform: ${platform}
Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleValues)}
Unresolved canonical fields: ${unresolvedFields.join(', ')}

Canonical fields:
- date
- entity_name
- account_code
- account_name
- debit
- credit
- amount
- currency
- memo
- fund
- appeal
- email
- phone

Respond ONLY with valid JSON: {"fieldMap": {"canonical_field": "exact_header_string"}, "reasoning": "one short sentence"}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 250,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const fieldMap: Record<string, string> = {};
      if (parsed.fieldMap && typeof parsed.fieldMap === 'object') {
        for (const [field, header] of Object.entries(parsed.fieldMap)) {
          if (typeof header === 'string' && headers.includes(header)) {
            fieldMap[field] = header;
          }
        }
      }

      return { fieldMap, reasoning: String(parsed.reasoning ?? '') };
    } catch (err) {
      this.logger.warn(`AI schema mapping failed for platform "${platform}": ${String(err)}`);
      return null;
    }
  }


  async suggestSchemaClassAndMappings(
    platform: string,
    headers: string[],
    sampleRows: any[],
    classFieldOptions: Record<string, string[]>,
  ): Promise<{ fileClass: string; fieldMap: Record<string, string>; reasoning: string } | null> {
    if (!this.client) return null;

    this.logger.log(`AI schema class+mappings triggered for platform ${platform} with ${headers.length} headers.`);

    const sampleValues = sampleRows.slice(0, 3).map((row) => row.values ?? row);
    const prompt = `You are classifying an imported TransformHub file and mapping its fields in one pass.

Rules:
- This is an AI suggestion only.
- A human reviewer must approve before it is treated as final.
- Choose exactly one file class from: ledger | constituent | donor | campaign | coa | unknown.
- Use exact header strings from the provided header list.
- Only map fields that belong to the chosen class.
- Only map fields you are reasonably confident about.

Platform: ${platform}
Headers: ${JSON.stringify(headers)}
Sample rows: ${JSON.stringify(sampleValues)}
Allowed canonical fields by class: ${JSON.stringify(classFieldOptions)}

Respond ONLY with valid JSON: {"fileClass":"ledger|constituent|donor|campaign|coa|unknown","fieldMap":{"canonical_field":"exact_header_string"},"reasoning":"one short sentence"}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 350,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const fileClass = typeof parsed.fileClass === 'string' ? parsed.fileClass.trim() : 'unknown';
      const fieldMap: Record<string, string> = {};
      if (parsed.fieldMap && typeof parsed.fieldMap === 'object') {
        for (const [field, header] of Object.entries(parsed.fieldMap)) {
          if (typeof header === 'string' && headers.includes(header)) {
            fieldMap[field] = header;
          }
        }
      }

      return {
        fileClass,
        fieldMap,
        reasoning: String(parsed.reasoning ?? ''),
      };
    } catch (err) {
      this.logger.warn(`AI schema class+mappings failed for platform "${platform}": ${String(err)}`);
      return null;
    }
  }

  async enrichSuggestedFix(row: any): Promise<string | null> {
    if (!this.client) return null;

    const context = {
      source_platform: row.source_platform,
      date: row.date,
      entity_name: row.entity_name,
      account_code: row.account_code,
      account_name: row.account_name,
      debit: row.debit,
      credit: row.credit,
      currency: row.currency,
      memo: row.memo,
      raw_fund: row.raw_fund,
      raw_appeal: row.raw_appeal,
    };

    const prompt = `You are suggesting a reviewer note for a financial ledger row.

Rules:
- This is an AI-suggested reviewer note only.
- A human must approve any resulting change.
- Write one direct actionable instruction in at most 2 sentences.
- Refer to the row values when useful.

Row data: ${JSON.stringify(context)}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.suggestedFixModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.2,
      });
      const suggestion = response.choices[0].message.content?.trim();
      return suggestion ? `[AI suggested - requires human approval] ${suggestion}` : null;
    } catch (err) {
      this.logger.warn(`AI fix enrichment failed for row "${row.id}": ${String(err)}`);
      return null;
    }
  }
}
