import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    const credentials = await this.resolveAnthropicKey();
    if (!credentials.key) {
      throw new BadRequestException('Anthropic API key is not configured for this tenant.');
    }

    const model = await this.resolveModel(credentials.key);
    const response = await this.callAnthropicResolver(credentials.key, model, input, credentials.source);
    const text = extractAnthropicText(response);
    const parsed = transcriptResolverOutputSchema.parse(parseJsonObject(text));
    const output = { ...parsed, resolved_with_version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION };
    return {
      provider: 'anthropic',
      model,
      source: credentials.source === 'none' ? 'env' : credentials.source,
      promptKey: 'ai.transcript-resolver',
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
    const fallback = 'claude-3-5-haiku-latest';
    if (knownModelIds.length) return knownModelIds.find((id) => id.includes('haiku')) ?? knownModelIds[0] ?? fallback;
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
      return ids.find((id) => id.includes('haiku')) ?? ids[0] ?? fallback;
    } catch {
      return fallback;
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
          max_tokens: 1000,
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

  private anthropicTimeoutMs() {
    const configured = Number(this.config.get<string>('ANTHROPIC_TIMEOUT_MS') ?? '15000');
    return Number.isFinite(configured) && configured >= 1000 && configured <= 120000 ? configured : 15000;
  }

  private anthropicTimeoutSignal() {
    return AbortSignal.timeout(this.anthropicTimeoutMs());
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
  "operational_signals": [{
    "intent": one allowed operational_intents enum value,
    "confidence": number,
    "action_required": boolean,
    "recommended_axis": "sales"|"account"|null,
    "reason": string,
    "suggested_task_title": string|null
  }],
  "competitor_mentioned": string[],
  "summary": string under 200 tokens,
  "language_detected": ISO-like language name or code,
  "resolved_with_version": ${TRANSCRIPT_RESOLVER_SCHEMA_VERSION}
}
Classify operational_signals for DTF Supply / Heat Press sales operations, not customer-request automation.
Map calls to concrete operational intent: heat press purchase, DTF supply reorder, quote, callback, refund/account review, shipping/account review, financing, price objection, product-fit consultation, sample, machine upgrade, training/installation, existing-customer expansion, or no_action.
Do not create or imply an automatic support case, ticket, or customer request. Staff may later open a case manually if the customer explicitly asks.
Use no_action only when there is no callback, quote, purchase, reorder, financing, product-fit, sample, upgrade, training, installation, refund/account, or shipping/account follow-up opportunity.
Use null or empty arrays when unknown. Confidence values must be 0..1.`;
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

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
