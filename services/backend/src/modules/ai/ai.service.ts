import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  buildTranscriptResolverPromptFromEnums,
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  transcriptResolverOutputSchema,
  WORKFLOW_ENUM_VERSION,
  type AiHealthResponse,
  type TranscriptResolverTestInput,
  type TranscriptResolverTestResponse,
} from '@factory-engine-pro/contracts';
import { CryptoService } from '../../shared/crypto.service.js';
import { AppLogger } from '../../shared/logger.service.js';
import { PrismaService } from '../../shared/prisma.service.js';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async health(): Promise<AiHealthResponse> {
    const startedAt = Date.now();
    const credentials = await this.resolveAnthropicKey();
    if (!credentials.key) {
      return {
        provider: 'anthropic',
        credentialRequired: true,
        configured: false,
        reachable: false,
        status: 'missing_credentials',
        source: 'none',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
        modelCount: null,
        error: 'Anthropic API key is not configured for this tenant.',
        resolverReachable: false,
        resolverStatus: 'not_checked',
        resolverError: 'Anthropic API key is not configured for this tenant.',
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: {
          'x-api-key': credentials.key,
          'anthropic-version': '2023-06-01',
        },
        signal: this.anthropicTimeoutSignal(),
      });
      const latencyMs = Date.now() - startedAt;
      const text = await response.text();
      const body = parseJson(text);
      if (response.ok) {
        const modelIds = Array.isArray(body?.data)
          ? body.data.map((item) => typeof item === 'object' && item && 'id' in item ? String((item as { id?: unknown }).id ?? '') : '').filter(Boolean)
          : [];
        const model = await this.resolveModel(credentials.key, modelIds);
        const resolver = await this.checkResolverAccess(credentials.key, model, credentials.source);
        return {
          provider: 'anthropic',
          credentialRequired: false,
          configured: true,
          reachable: true,
          status: resolver.ok ? 'ok' : resolver.status,
          source: credentials.source,
          latencyMs,
          checkedAt: new Date().toISOString(),
          modelCount: Array.isArray(body?.data) ? body.data.length : null,
          error: resolver.ok ? null : resolver.error,
          resolverReachable: resolver.ok,
          resolverStatus: resolver.ok ? 'ok' : resolver.status,
          resolverError: resolver.ok ? null : resolver.error,
        };
      }

      const status = response.status === 401 || response.status === 403 ? 'invalid_credentials' : 'provider_error';
      const message = providerMessage(body, text) ?? `Anthropic health check failed with HTTP ${response.status}.`;
      this.logger.warn('ai', 'health_failed', 'Anthropic health check failed', {
        status_code: response.status,
        source: credentials.source,
        provider_status: status,
      });
      return {
        provider: 'anthropic',
        credentialRequired: false,
        configured: true,
        reachable: true,
        status,
        source: credentials.source,
        latencyMs,
        checkedAt: new Date().toISOString(),
        modelCount: null,
        error: message,
        resolverReachable: false,
        resolverStatus: 'not_checked',
        resolverError: 'Resolver was not checked because Anthropic model listing failed.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('ai', 'health_network_failed', 'Anthropic health check could not reach provider', { error: message });
      return {
        provider: 'anthropic',
        credentialRequired: false,
        configured: true,
        reachable: false,
        status: 'network_error',
        source: credentials.source,
        latencyMs: Date.now() - startedAt,
        checkedAt: new Date().toISOString(),
        modelCount: null,
        error: message,
        resolverReachable: false,
        resolverStatus: 'network_error',
        resolverError: message,
      };
    }
  }

  resolverPromptPreview() {
    const prompt = buildTranscriptResolverPromptFromEnums();
    return {
      promptKey: 'ai.transcript-resolver',
      promptVersion: WORKFLOW_ENUM_VERSION,
      prompt,
    };
  }

  async resolveTranscriptTest(input: TranscriptResolverTestInput): Promise<TranscriptResolverTestResponse> {
    return this.resolveTranscript(input);
  }

  async resolveTranscript(input: TranscriptResolverTestInput): Promise<TranscriptResolverTestResponse> {
    const startedAt = Date.now();
    await this.ensureResolverBudgetAvailable();
    const credentials = await this.resolveAnthropicKey();
    if (!credentials.key) {
      throw new BadRequestException('Anthropic API key is not configured for this tenant.');
    }

    const model = await this.resolveModel(credentials.key);
    const inputHash = createHash('sha256').update(input.transcript, 'utf8').digest('hex');
    const response = await this.callAnthropicResolver(credentials.key, model, input, credentials.source);
    const firstUsage = anthropicUsage(response);
    const text = extractAnthropicText(response);
    const firstParse = parseResolverOutput(text);
    let parsed = firstParse.output;
    let repaired = false;
    let usage = firstUsage;

    if (!parsed) {
      const repairResponse = await this.callAnthropicRepair(
        credentials.key,
        model,
        text,
        firstParse.error,
        credentials.source,
      );
      usage = addAnthropicUsage(usage, anthropicUsage(repairResponse));
      const repairedParse = parseResolverOutput(extractAnthropicText(repairResponse));
      if (!repairedParse.output) {
        throw new BadRequestException({
          message: 'Anthropic resolver returned invalid structured output after one repair attempt.',
          code: 'anthropic_resolver_invalid_output',
          validationError: repairedParse.error,
        });
      }
      parsed = repairedParse.output;
      repaired = true;
    }
    const output = { ...parsed, resolved_with_version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION };
    return {
      provider: 'anthropic',
      model,
      source: credentials.source === 'none' ? 'env' : credentials.source,
      promptKey: 'ai.transcript-resolver',
      promptVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
      inputHash,
      attemptCount: repaired ? 2 : 1,
      repaired,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
      },
      costMicros: this.resolverCostMicros(usage),
      output,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    };
  }

  private async resolveAnthropicKey(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const config = await this.prisma.db.tenantConfig.findFirst({ select: { anthropicApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(config?.anthropicApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
  }

  private async resolveModel(key: string, knownModelIds: string[] = []) {
    const configured = this.config.get<string>('ANTHROPIC_RESOLVER_MODEL')?.trim()
      || this.config.get<string>('ANTHROPIC_MODEL')?.trim();
    if (configured) return configured;
    const fallback = 'claude-haiku-4-5-20251001';
    if (knownModelIds.length) {
      return knownModelIds.find((id) => id === fallback)
        ?? knownModelIds.find((id) => id.includes('haiku-4-5'))
        ?? knownModelIds.find((id) => id.includes('haiku'))
        ?? knownModelIds[0]
        ?? fallback;
    }
    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=20', {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: this.anthropicTimeoutSignal(),
      });
      const body = parseJson(await response.text()) as { data?: Array<{ id?: string }> } | null;
      const ids = Array.isArray(body?.data) ? body.data.map((item) => item.id).filter((id): id is string => Boolean(id)) : [];
      return ids.find((id) => id === fallback)
        ?? ids.find((id) => id.includes('haiku-4-5'))
        ?? ids.find((id) => id.includes('haiku'))
        ?? ids[0]
        ?? fallback;
    } catch {
      return fallback;
    }
  }

  private async ensureResolverBudgetAvailable() {
    if (this.config.get<string>('ANTHROPIC_RESOLVER_ENABLED')?.trim().toLowerCase() === 'false') {
      throw new BadRequestException({
        message: 'Anthropic transcript resolver is disabled by budget control.',
        code: 'anthropic_resolver_disabled',
      });
    }

    const dailyLimit = positiveInt(this.config.get<string>('ANTHROPIC_RESOLVER_DAILY_LIMIT'), 0);
    if (dailyLimit <= 0) return;

    const since = startOfUtcDay(new Date());
    const used = await this.prisma.db.aircallCallEvent.count({
      where: {
        resolvedAt: { gte: since },
      },
    });
    if (used >= dailyLimit) {
      this.logger.warn('ai', 'resolver_budget_exceeded', 'Anthropic transcript resolver daily cap reached; analysis will remain unavailable until explicitly retried', {
        daily_limit: dailyLimit,
        used_today: used,
        since: since.toISOString(),
      });
      throw new BadRequestException({
        message: `Anthropic transcript resolver daily cap reached (${used}/${dailyLimit}).`,
        code: 'anthropic_resolver_daily_cap_reached',
        dailyLimit,
        usedToday: used,
      });
    }
  }

  private async checkResolverAccess(
    key: string,
    model: string,
    source: 'tenant_config' | 'env' | 'none',
  ): Promise<{ ok: true } | { ok: false; status: 'provider_error' | 'network_error'; error: string }> {
    const startedAt = Date.now();
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: this.anthropicTimeoutSignal(),
        body: JSON.stringify({
          model,
          max_tokens: 16,
          temperature: 0,
          messages: [{ role: 'user', content: 'Return only JSON: {"ok":true}' }],
        }),
      });
      const text = await response.text();
      const body = parseJson(text) as { error?: { message?: unknown } } | null;
      if (response.ok) return { ok: true };
      const message = providerMessage(body, text) ?? `Anthropic resolver health failed with HTTP ${response.status}.`;
      this.logger.warn('ai', 'health_resolver_failed', 'Anthropic resolver health check failed', {
        key_source: source,
        model,
        status_code: response.status,
        latency_ms: Date.now() - startedAt,
      });
      return { ok: false, status: 'provider_error', error: message };
    } catch (error) {
      const timeoutMs = this.anthropicTimeoutMs();
      const timeout = isTimeoutError(error);
      const message = timeout
        ? `Anthropic resolver health timed out after ${timeoutMs}ms.`
        : `Anthropic resolver health could not reach provider: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.warn('ai', timeout ? 'health_resolver_timeout' : 'health_resolver_network_failed', message, {
        key_source: source,
        model,
        latency_ms: Date.now() - startedAt,
      });
      return { ok: false, status: 'network_error', error: message };
    }
  }

  private async callAnthropicResolver(
    key: string,
    model: string,
    input: TranscriptResolverTestInput,
    source: 'tenant_config' | 'env' | 'none',
  ) {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: this.anthropicTimeoutSignal(),
        body: JSON.stringify({
          model,
          max_tokens: this.anthropicResolverMaxTokens(),
          temperature: 0,
          system: resolverSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: JSON.stringify({
                transcript: input.transcript,
                metadata: input.metadata ?? {},
              }),
            },
          ],
        }),
      });
    } catch (error) {
      const timeoutMs = this.anthropicTimeoutMs();
      const timeout = isTimeoutError(error);
      const message = timeout
        ? `Anthropic resolver timed out after ${timeoutMs}ms.`
        : `Anthropic resolver could not reach provider: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error('ai', timeout ? 'resolver_timeout' : 'resolver_network_failed', message, {
        key_source: source,
        model,
        latency_ms: Date.now() - startedAt,
      });
      throw new BadRequestException({
        message,
        code: timeout ? 'anthropic_resolver_timeout' : 'anthropic_resolver_network_error',
      });
    }
    const text = await response.text();
    const body = parseJson(text) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = providerMessage(body as { error?: { message?: unknown } } | null, text)
        ?? `Anthropic resolver failed with HTTP ${response.status}.`;
      this.logger.error('ai', 'resolver_failed', message, {
        key_source: source,
        model,
        status_code: response.status,
        latency_ms: Date.now() - startedAt,
      });
      throw new BadRequestException({
        message,
        code: 'anthropic_resolver_failed',
        status: response.status,
      });
    }
    return body;
  }

  private async callAnthropicRepair(
    key: string,
    model: string,
    invalidOutput: string,
    validationError: string,
    source: 'tenant_config' | 'env' | 'none',
  ) {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: this.anthropicTimeoutSignal(),
        body: JSON.stringify({
          model,
          max_tokens: this.anthropicResolverMaxTokens(),
          temperature: 0,
          system: resolverRepairSystemPrompt(),
          messages: [{
            role: 'user',
            content: JSON.stringify({
              invalid_output: invalidOutput.slice(0, 14_000),
              validation_error: validationError.slice(0, 2_000),
            }),
          }],
        }),
      });
    } catch (error) {
      const timeout = isTimeoutError(error);
      const message = timeout
        ? `Anthropic resolver repair timed out after ${this.anthropicTimeoutMs()}ms.`
        : `Anthropic resolver repair could not reach provider: ${error instanceof Error ? error.message : String(error)}`;
      throw new BadRequestException({
        message,
        code: timeout ? 'anthropic_resolver_repair_timeout' : 'anthropic_resolver_repair_network_error',
      });
    }
    const text = await response.text();
    const body = parseJson(text) as Record<string, unknown> | null;
    if (!response.ok) {
      const message = providerMessage(body as { error?: { message?: unknown } } | null, text)
        ?? `Anthropic resolver repair failed with HTTP ${response.status}.`;
      this.logger.error('ai', 'resolver_repair_failed', message, {
        key_source: source,
        model,
        status_code: response.status,
        latency_ms: Date.now() - startedAt,
      });
      throw new BadRequestException({
        message,
        code: 'anthropic_resolver_repair_failed',
        status: response.status,
      });
    }
    return body;
  }

  private resolverCostMicros(usage: AnthropicUsage) {
    const inputPerMillion = positiveInt(this.config.get<string>('ANTHROPIC_INPUT_COST_PER_MILLION_MICROS'), 0);
    const outputPerMillion = positiveInt(this.config.get<string>('ANTHROPIC_OUTPUT_COST_PER_MILLION_MICROS'), 0);
    if (inputPerMillion <= 0 && outputPerMillion <= 0) return null;
    return Math.round((usage.inputTokens * inputPerMillion + usage.outputTokens * outputPerMillion) / 1_000_000);
  }

  private anthropicTimeoutMs() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TIMEOUT_MS') ?? '15000');
    return Number.isFinite(configured) && configured >= 1000 && configured <= 120000 ? configured : 15000;
  }

  private anthropicTimeoutSignal() {
    return AbortSignal.timeout(this.anthropicTimeoutMs());
  }

  private anthropicResolverMaxTokens() {
    // Resolver v5 emits a complete staff brief plus evidence-backed operational signals.
    // A smaller cap truncates valid JSON and then spends a second request on a repair
    // that is subject to the same cap. This is an output ceiling, not a usage target;
    // Anthropic stops charging output tokens as soon as the JSON is complete.
    return boundedPositiveInt(this.config.get<string>('ANTHROPIC_RESOLVER_MAX_TOKENS'), 2400, { min: 2000, max: 4096 });
  }
}

function parseJson(text: string): { data?: unknown; error?: { message?: unknown } } | null {
  try {
    return JSON.parse(text) as { data?: unknown; error?: { message?: unknown } };
  } catch {
    return null;
  }
}

function providerMessage(body: { error?: { message?: unknown } } | null, fallback: string) {
  if (typeof body?.error?.message === 'string' && body.error.message.trim()) return body.error.message.slice(0, 300);
  return fallback.trim().slice(0, 300) || null;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? '');
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function boundedPositiveInt(value: string | undefined, fallback: number, bounds: { min: number; max: number }) {
  const parsed = Number(value ?? '');
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, parsed));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function resolverSystemPrompt() {
  return `${buildTranscriptResolverPromptFromEnums()}

Return STRICT JSON only. The JSON must exactly match this schema:
{
  "customer_match": {"customer_id": string|null, "phone": string|null, "name_hint": string|null, "confidence": number},
  "product_mentions": [{"sku": string|null, "name_hint": string|null, "confidence": number}],
  "psych_tags": one or more allowed psych_tags from the enum list,
  "call_intent": one allowed call_intents enum value,
  "shipping_signals": {"address_mentioned": boolean, "tracking_asked": boolean, "complaint": boolean},
  "payment_signals": {"method_mentioned": boolean, "refund_asked": boolean, "complaint": boolean},
  "urgency_signal": one allowed urgency_levels enum value,
  "conversation": {
    "direction": "inbound"|"outbound"|"unknown",
    "kind": "customer_conversation"|"voicemail"|"automated_system"|"carrier_vendor"|"agent_only"|"unknown",
    "customer_present": boolean,
    "confidence": number,
    "evidence": [{"speaker": "customer"|"agent"|"system"|"unknown", "text": string}]
  },
  "customer_mood": {
    "label": "positive"|"calm"|"neutral"|"confused"|"anxious"|"frustrated"|"angry"|"urgent"|"unknown",
    "confidence": number,
    "evidence": [{"speaker": "customer"|"agent"|"system"|"unknown", "text": string}]
  },
  "customer_issue": {"detected": boolean, "category": string|null, "description": string|null, "confidence": number, "evidence": []},
  "promise": {"made": boolean, "owner": "agent"|"customer"|"none", "commitment": string|null, "due_hint": string|null, "confidence": number, "evidence": []},
  "next_action": {"required": boolean, "owner": "staff"|"customer"|"none", "action": string|null, "expected_outcome": string|null, "priority": "low"|"medium"|"high"|"urgent", "confidence": number, "evidence": []},
  "operational_signals": [{
    "intent": one allowed operational_intents enum value,
    "confidence": number,
    "action_required": boolean,
    "recommended_axis": "sales"|"account"|null,
    "reason": string,
    "suggested_task_title": string|null
  }],
  "person_brief": {
    "why_calling": string,
    "upset_about": string,
    "call_goal": string,
    "suggested_actions": string[],
    "transcript_snippet": string,
    "direction": "inbound"|"outbound"|"unknown",
    "mood": string,
    "issue": string,
    "promise": string,
    "next_action": string,
    "evidence": [{"speaker": "customer"|"agent"|"system"|"unknown", "text": string}]
  },
  "competitor_mentioned": string[],
  "summary": string under 200 tokens,
  "language_detected": ISO-like language name or code,
  "resolved_with_version": ${TRANSCRIPT_RESOLVER_SCHEMA_VERSION}
}
Classify operational_signals for DTF Supply / Heat Press sales operations, not customer-request automation.
The transcript is the only semantic source. Do not infer a customer request from metadata, phone direction, boilerplate, or generic sales assumptions.
Every mood, issue, promise, and next action claim must be supported by evidence from the transcript. If evidence is absent, return unknown/null/false rather than guessing.
The operational_signals array is authoritative. Downstream code will validate and deduplicate it but will never derive intent by keyword or regex.
Map calls to concrete operational intent: heat press machine purchase, spare part purchase, generic heat press purchase, DTF supply reorder, quote, callback, refund/account review, shipping/account review, financing, price objection, product-fit consultation, sample, machine upgrade, training/installation, existing-customer expansion, or no_action.
Return at most one actionable operational_signals item. Choose the primary staff action; do not return multiple sales/account tasks for one call.
Do not return callback_requested when another concrete intent is present. Callback is only primary when the customer explicitly asks to be called back and no stronger purchase, account, refund, shipping, quote, financing, product-fit, sample, upgrade, training, or reorder intent exists.
Do not create or imply an automatic support case, ticket, or customer request. Staff may later open a case manually if the customer explicitly asks.
Treat carrier greetings, voicemail prompts, recording disclaimers, survey prompts, and phrases like "quality and training purposes" as boilerplate. They must not trigger training_installation_need, shipping_status_question, callback_requested, or any sales/account task unless the transcript also contains a real customer request.
Treat freight/carrier/vendor-only calls, including Roadrunner or delivery appointment scheduling, as no_action when no Shopify customer, Shopify order, or DTF product request is present.
If the transcript is only automated/voicemail/agent outbound courtesy text, including an unanswered courtesy call from staff to a customer, return no_action with action_required=false and explain that no customer request was captured.
Write person_brief for the staff member who will call the customer. Base it on transcript evidence and resolver signals, not generic workflow text.
person_brief.why_calling: one concise sentence explaining why this specific customer should be called now.
person_brief.upset_about: the concrete complaint, objection, confusion, risk, or "No explicit complaint captured in the transcript."
person_brief.call_goal: the next human outcome, such as confirm part fit, quote machine pricing, recover a refund concern, or schedule follow-up.
person_brief.suggested_actions: 2 to 5 specific call actions. Do not include generic actions like "review customer context" unless the transcript has no usable signal.
person_brief.transcript_snippet: a short evidence snippet or tight paraphrase from the transcript.
Do not use the words "AI", "automation", or "support case" in person_brief text.
Use no_action only when there is no callback, quote, purchase, reorder, financing, product-fit, sample, upgrade, training, installation, refund/account, or shipping/account follow-up opportunity.
  Use null or empty arrays when unknown. Confidence values must be 0..1.`;
}

function resolverRepairSystemPrompt() {
  return `${resolverSystemPrompt()}

You are repairing a previous resolver response that failed JSON or schema validation. Return only the corrected JSON object. Do not add facts, reinterpret the transcript, or add markdown.`;
}

function extractAnthropicText(body: Record<string, unknown> | null) {
  const content = Array.isArray(body?.content) ? body.content as Array<Record<string, unknown>> : [];
  const text = content
    .map((item) => (item.type === 'text' && typeof item.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (!text) throw new BadRequestException('Anthropic resolver returned an empty response.');
  return text;
}

function parseJsonObject(text: string) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new BadRequestException('Anthropic resolver did not return a JSON object.');
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    throw new BadRequestException('Anthropic resolver returned invalid JSON.');
  }
}

function parseResolverOutput(text: string): { output: ReturnType<typeof transcriptResolverOutputSchema.parse> | null; error: string } {
  try {
    const value = parseJsonObject(text);
    const parsed = transcriptResolverOutputSchema.safeParse(value);
    if (parsed.success) return { output: parsed.data, error: '' };
    return {
      output: null,
      error: parsed.error.issues
        .slice(0, 20)
        .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
        .join('; '),
    };
  } catch (error) {
    return { output: null, error: error instanceof Error ? error.message : String(error) };
  }
}

type AnthropicUsage = { inputTokens: number; outputTokens: number };

function anthropicUsage(body: Record<string, unknown> | null): AnthropicUsage {
  const usage = body?.usage && typeof body.usage === 'object' ? body.usage as Record<string, unknown> : {};
  return {
    inputTokens: safeTokenCount(usage.input_tokens),
    outputTokens: safeTokenCount(usage.output_tokens),
  };
}

function addAnthropicUsage(left: AnthropicUsage, right: AnthropicUsage): AnthropicUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  };
}

function safeTokenCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
