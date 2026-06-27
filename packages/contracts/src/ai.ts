import { z } from 'zod';

export const aiHealthResponseSchema = z.object({
  provider: z.literal('anthropic'),
  credentialRequired: z.boolean(),
  configured: z.boolean(),
  reachable: z.boolean(),
  status: z.enum(['ok', 'missing_credentials', 'invalid_credentials', 'provider_error', 'network_error']),
  source: z.enum(['tenant_config', 'env', 'none']),
  latencyMs: z.number().int().min(0).nullable(),
  checkedAt: z.string(),
  modelCount: z.number().int().min(0).nullable(),
  error: z.string().nullable(),
});

export type AiHealthResponse = z.infer<typeof aiHealthResponseSchema>;
