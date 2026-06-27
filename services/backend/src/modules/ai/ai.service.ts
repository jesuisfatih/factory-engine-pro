import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiHealthResponse } from '@factory-engine-pro/contracts';
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
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: {
          'x-api-key': credentials.key,
          'anthropic-version': '2023-06-01',
        },
      });
      const latencyMs = Date.now() - startedAt;
      const text = await response.text();
      const body = parseJson(text);
      if (response.ok) {
        return {
          provider: 'anthropic',
          credentialRequired: false,
          configured: true,
          reachable: true,
          status: 'ok',
          source: credentials.source,
          latencyMs,
          checkedAt: new Date().toISOString(),
          modelCount: Array.isArray(body?.data) ? body.data.length : null,
          error: null,
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
      };
    }
  }

  private async resolveAnthropicKey(): Promise<{ key: string | null; source: 'tenant_config' | 'env' | 'none' }> {
    const config = await this.prisma.db.tenantConfig.findFirst({ select: { anthropicApiKeyEncrypted: true } });
    const tenantKey = this.crypto.decrypt(config?.anthropicApiKeyEncrypted)?.trim();
    if (tenantKey) return { key: tenantKey, source: 'tenant_config' };
    const envKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    if (envKey) return { key: envKey, source: 'env' };
    return { key: null, source: 'none' };
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
