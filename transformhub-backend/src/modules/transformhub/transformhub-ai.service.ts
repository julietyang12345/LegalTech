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
    this.client = apiKey ? new OpenAI({ apiKey, timeout: 20000 }) : null;
    if (!this.client) {
      this.logger.warn('OPENAI_API_KEY not set — AI enrichment disabled. Set OPENAI_API_KEY to enable.');
    }
  }

  get isEnabled(): boolean {
    return this.client !== null;
  }

  async suggestTaxonomyCode(input: {
    rawValue: string;
    type: string;
    registry: any[];
    legacyMappings: any[];
    ruleEvidence?: Array<Record<string, any>>;
    sampleValues?: string[];
  }): Promise<{ code: string | null; reasoning: string; confidence: 'high' | 'medium' | 'low'; evidence: string[]; model: string } | null> {
    if (!this.client) return null;

    const { rawValue, type, registry, legacyMappings, ruleEvidence = [], sampleValues = [] } = input;
    const relevantRegistry = registry.filter((entry) => entry.type === type);
    const relevantLegacy = legacyMappings.filter((entry) => entry.type === type);

    const prompt = `You are suggesting a canonical ${type} code for imported financial data.

Rules:
- This is an AI suggestion only.
- A human reviewer must approve before it is applied.
- You are receiving rule-layer evidence from the previous stage. Use that evidence instead of re-deriving it.
- Only return a canonical code that already exists in the registry.
- If there is no reasonable match, return null.
- Confidence must be one of: high, medium, low.
- Evidence must be a short list of the most important facts you used.

Raw ${type} value: "${rawValue}"
Rule-layer evidence: ${JSON.stringify(ruleEvidence)}
Sample values: ${JSON.stringify(sampleValues)}

Canonical ${type} registry:
${relevantRegistry.map((entry) => `- ${entry.code}: ${entry.label}`).join('\n')}

Legacy mappings:
${relevantLegacy.map((entry) => `- "${entry.legacyValue}" -> ${entry.canonicalCode}`).join('\n')}

    Respond ONLY with valid JSON: {"code": "CANONICAL-CODE" | null, "reasoning": "one short sentence", "confidence": "high|medium|low", "evidence": ["short fact"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.taxonomyModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 220,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const code = typeof parsed.code === 'string' && parsed.code.trim() ? parsed.code.trim() : null;
      const isValidCode = code
        ? relevantRegistry.some((entry) => entry.code === code) || relevantLegacy.some((entry) => entry.canonicalCode === code)
        : true;
      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low';
      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((value: unknown) => typeof value === 'string').slice(0, 5)
        : [];

      return {
        code: isValidCode ? code : null,
        reasoning: String(parsed.reasoning ?? ''),
        confidence,
        evidence,
        model: this.taxonomyModel,
      };
    } catch (err) {
      this.logger.warn(`AI taxonomy suggestion failed for "${rawValue}": ${String(err)}`);
      return null;
    }
  }

  async suggestFieldTarget(input: {
    rawKey: string;
    cleanedKey: string;
    strippedKey: string;
    canonicalHint?: string | null;
    fileClass: string;
    platform: string;
    allowedCanonicalFields: string[];
    sampleValues?: string[];
    ruleEvidence?: Array<Record<string, any>>;
  }): Promise<{ suggestedTarget: string | null; reasoning: string; confidence: 'high' | 'medium' | 'low'; evidence: string[]; model: string } | null> {
    if (!this.client) return null;

    const { rawKey, cleanedKey, strippedKey, canonicalHint = null, fileClass, platform, allowedCanonicalFields, sampleValues = [], ruleEvidence = [] } = input;

    const prompt = `You are suggesting a canonical field target for an imported TransformHub file.

Rules:
- This is an AI suggestion only.
- A human reviewer must approve before it is applied.
- Use the rule-layer evidence instead of re-deriving it.
- Only choose a target from the allowed canonical fields list.
- If there is no reasonable match, return null.
- Confidence must be one of: high, medium, low.
- Evidence must be a short list of the most important facts you used.

Platform: ${platform}
File class: ${fileClass}
Raw header: "${rawKey}"
Cleaned key: "${cleanedKey}"
Stripped key: "${strippedKey}"
Canonical hint from rules: ${canonicalHint ? '"' + canonicalHint + '"' : 'null'}
Rule-layer evidence: ${JSON.stringify(ruleEvidence)}
Sample values: ${JSON.stringify(sampleValues)}
Allowed canonical fields: ${JSON.stringify(allowedCanonicalFields)}

Respond ONLY with valid JSON: {"suggestedTarget":"canonical_field"|null,"reasoning":"one short sentence","confidence":"high|medium|low","evidence":["short fact"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 220,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const suggestedTarget = typeof parsed.suggestedTarget === 'string' && parsed.suggestedTarget.trim() ? parsed.suggestedTarget.trim() : null;
      const isValidTarget = suggestedTarget ? allowedCanonicalFields.includes(suggestedTarget) : true;
      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low';
      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((value: unknown) => typeof value === 'string').slice(0, 5)
        : [];

      return {
        suggestedTarget: isValidTarget ? suggestedTarget : null,
        reasoning: String(parsed.reasoning ?? ''),
        confidence,
        evidence,
        model: this.schemaModel,
      };
    } catch (err) {
      this.logger.warn(`AI field suggestion failed for "${rawKey}": ${String(err)}`);
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
        max_completion_tokens: 250,
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
        max_completion_tokens: 350,
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


  async suggestPersonMatch(input: {
    rowRef: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    zip: string;
    householdName: string;
    city: string;
    state: string;
    candidate: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      addressLine1: string;
      city: string;
      state: string;
      zip: string;
    };
    matchedEvidence: string[];
    score: number;
  }): Promise<{ suggestedAction: 'confirm_merge' | 'keep_separate'; confidence: 'high' | 'medium' | 'low'; reason: string; evidence: string[]; model: string } | null> {
    if (!this.client) return null;

    const prompt = `You are suggesting whether a human reviewer should merge two person records in TransformHub.

Rules:
- This is an AI suggestion only.
- The human reviewer makes the final decision.
- Use the provided rule-layer evidence instead of re-deriving it.
- Be conservative. If the evidence is ambiguous, prefer keep_separate.
- suggestedAction must be one of: confirm_merge, keep_separate.
- confidence must be one of: high, medium, low.
- evidence must be a short list of the most important facts you used.

Input row ref: ${input.rowRef}
Candidate id: ${input.candidate.id}
Rule-layer matched evidence: ${JSON.stringify(input.matchedEvidence)}
Rule-layer score: ${input.score}

Incoming record:
${JSON.stringify({
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      zip: input.zip,
      householdName: input.householdName,
      city: input.city,
      state: input.state,
    })}

Candidate record:
${JSON.stringify(input.candidate)}

Respond ONLY with valid JSON: {"suggestedAction":"confirm_merge|keep_separate","confidence":"high|medium|low","reason":"one short sentence","evidence":["short fact"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 220,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const suggestedAction = parsed.suggestedAction === 'confirm_merge' || parsed.suggestedAction === 'keep_separate'
        ? parsed.suggestedAction
        : 'keep_separate';
      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low';
      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((value: unknown) => typeof value === 'string').slice(0, 5)
        : [];

      return {
        suggestedAction,
        confidence,
        reason: String(parsed.reason ?? ''),
        evidence,
        model: this.schemaModel,
      };
    } catch (err) {
      this.logger.warn(`AI person-match suggestion failed for row "${input.rowRef}": ${String(err)}`);
      return null;
    }
  }

  async suggestDonorSignalFallback(input: {
    rowRef: string;
    platform: string;
    rawValues: Record<string, string>;
    missingFields: Array<'amount' | 'date' | 'transactionRef'>;
  }): Promise<{
    amountHeader: string | null;
    dateHeader: string | null;
    transactionRefHeader: string | null;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    model: string;
  } | null> {
    if (!this.client || input.missingFields.length === 0) return null;

    const headers = Object.keys(input.rawValues || {});
    const sampleEntries = headers.slice(0, 40).map((header) => ({
      header,
      value: input.rawValues[header],
    }));

    const prompt = `You are identifying donor duplicate-signal fields in a TransformHub imported row.

Rules:
- This is an AI fallback only. Rule-based matching already ran first.
- Only choose exact header strings from the provided row.
- Only fill the fields listed in missingFields.
- If a field cannot be identified confidently, return null for that field.
- transactionRef means a stable transaction/payment/gateway/processor/reference identifier, not donor name or campaign name.
- confidence must be one of: high, medium, low.
- evidence must be a short list of the most important facts you used.

Row ref: ${input.rowRef}
Platform: ${input.platform}
Missing fields: ${JSON.stringify(input.missingFields)}
Available headers and sample values: ${JSON.stringify(sampleEntries)}

Respond ONLY with valid JSON: {"amountHeader":"exact header"|null,"dateHeader":"exact header"|null,"transactionRefHeader":"exact header"|null,"reason":"one short sentence","confidence":"high|medium|low","evidence":["short fact"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 220,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const pickHeader = (value: unknown) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed && headers.includes(trimmed) ? trimmed : null;
      };
      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low';
      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((value: unknown) => typeof value === 'string').slice(0, 5)
        : [];

      return {
        amountHeader: input.missingFields.includes('amount') ? pickHeader(parsed.amountHeader) : null,
        dateHeader: input.missingFields.includes('date') ? pickHeader(parsed.dateHeader) : null,
        transactionRefHeader: input.missingFields.includes('transactionRef') ? pickHeader(parsed.transactionRefHeader) : null,
        reason: String(parsed.reason ?? ''),
        confidence,
        evidence,
        model: this.schemaModel,
      };
    } catch (err) {
      this.logger.warn(`AI donor-signal fallback failed for row "${input.rowRef}": ${String(err)}`);
      return null;
    }
  }

  async suggestHouseholdMatch(input: {
    addressKey: string;
    evidence: string[];
    members: Array<{
      id: string;
      firstName: string;
      lastName: string;
      addressLine1: string;
      city: string;
      state: string;
      zip: string;
    }>;
  }): Promise<{ suggestedAction: 'confirm_merge' | 'keep_separate'; confidence: 'high' | 'medium' | 'low'; reason: string; evidence: string[]; model: string } | null> {
    if (!this.client) return null;

    const prompt = `You are suggesting whether a human reviewer should group people into the same household in TransformHub.

Rules:
- This is an AI suggestion only.
- The human reviewer makes the final decision.
- Use the provided rule-layer evidence instead of re-deriving it.
- Be conservative. If the evidence is ambiguous, prefer keep_separate.
- suggestedAction must be one of: confirm_merge, keep_separate.
- confidence must be one of: high, medium, low.
- evidence must be a short list of the most important facts you used.

Address key: ${input.addressKey}
Rule-layer evidence: ${JSON.stringify(input.evidence)}
Members:
${JSON.stringify(input.members)}

Respond ONLY with valid JSON: {"suggestedAction":"confirm_merge|keep_separate","confidence":"high|medium|low","reason":"one short sentence","evidence":["short fact"]}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.schemaModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 220,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      const suggestedAction = parsed.suggestedAction === 'confirm_merge' || parsed.suggestedAction === 'keep_separate'
        ? parsed.suggestedAction
        : 'keep_separate';
      const confidence = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
        ? parsed.confidence
        : 'low';
      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((value: unknown) => typeof value === 'string').slice(0, 5)
        : [];

      return {
        suggestedAction,
        confidence,
        reason: String(parsed.reason ?? ''),
        evidence,
        model: this.schemaModel,
      };
    } catch (err) {
      this.logger.warn(`AI household suggestion failed for address key "${input.addressKey}": ${String(err)}`);
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
        max_completion_tokens: 100,
        temperature: 0.2,
      });
      const suggestion = response.choices[0].message.content?.trim();
      return suggestion ? `[AI suggested - requires human approval] ${suggestion}` : null;
    } catch (err) {
      this.logger.warn(`AI fix enrichment failed for row "${row.id}": ${String(err)}`);
      return null;
    }
  }

  // Receives only near-miss pairs pre-filtered by the frontend (rule score 0.3–0.49).
  // Returns only group indices + confidence — no canonicalLabel/reasoning to save output tokens.
  async suggestTaxonomyGroups(input: {
    values: Array<{ id: string; rawValue: string; objectType: string }>;
  }): Promise<Array<{ memberIds: string[]; confidence: 'high' | 'medium' | 'low' }> | null> {
    if (!this.client || input.values.length < 2) return null;

    const valueList = input.values
      .map((value, index) => `${index}:"${value.rawValue}"`)
      .join('\n');

    const prompt = `Group these fundraising label variants by semantic equivalence (same campaign/year/purpose). Only group if clearly the same thing. Same-year variants like abbreviations, acronyms, or alternate phrasing qualify.

${valueList}

JSON only: {"groups":[{"i":[0,2],"c":"high|medium|low"}]}
- i: member indices (>=2 per group)
- c: confidence
- Omit groups you are not confident about`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.taxonomyModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_completion_tokens: 200,
        temperature: 0,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      if (!Array.isArray(parsed.groups)) return null;

      return parsed.groups
        .filter((group: any) => Array.isArray(group.i) && group.i.length >= 2)
        .map((group: any) => {
          const memberIds = (group.i as number[])
            .filter((index) => index >= 0 && index < input.values.length)
            .map((index) => input.values[index].id);
          const confidence: 'high' | 'medium' | 'low' =
            group.c === 'high' || group.c === 'medium' || group.c === 'low' ? group.c : 'low';
          return { memberIds, confidence };
        })
        .filter((group: any) => group.memberIds.length >= 2);
    } catch (err) {
      this.logger.warn(`AI taxonomy grouping failed: ${String(err)}`);
      return null;
    }
  }
}
