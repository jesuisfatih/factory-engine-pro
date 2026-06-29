import { z } from 'zod';
import { CALL_INTENTS, CREATE_TASK_AXIS, OPERATIONAL_INTENTS, PSYCH_TAGS, URGENCY_LEVELS } from './enums.js';

export const TRANSCRIPT_RESOLVER_SCHEMA_VERSION = 2;

export const TRANSCRIPT_RESOLVER_OUTPUT_FIELDS = [
  'customer_match',
  'product_mentions',
  'psych_tags',
  'call_intent',
  'shipping_signals',
  'payment_signals',
  'urgency_signal',
  'operational_signals',
  'competitor_mentioned',
  'summary',
  'language_detected',
  'resolved_with_version',
] as const;

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
  resolverReachable: z.boolean(),
  resolverStatus: z.enum(['ok', 'not_checked', 'provider_error', 'network_error']),
  resolverError: z.string().nullable(),
});

export type AiHealthResponse = z.infer<typeof aiHealthResponseSchema>;

export const transcriptResolverTestSchema = z.object({
  transcript: z.string().trim().min(10).max(12_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TranscriptResolverTestInput = z.infer<typeof transcriptResolverTestSchema>;

const confidenceSchema = z.number().min(0).max(1);

export const transcriptOperationalSignalSchema = z.object({
  intent: z.enum(OPERATIONAL_INTENTS),
  confidence: confidenceSchema,
  action_required: z.boolean(),
  recommended_axis: z.enum(CREATE_TASK_AXIS).nullable(),
  reason: z.string().max(500),
  suggested_task_title: z.string().max(120).nullable(),
});
export type TranscriptOperationalSignal = z.infer<typeof transcriptOperationalSignalSchema>;

export const transcriptResolverOutputSchema = z.object({
  customer_match: z.object({
    customer_id: z.string().nullable(),
    phone: z.string().nullable(),
    name_hint: z.string().nullable(),
    confidence: confidenceSchema,
  }),
  product_mentions: z.array(z.object({
    sku: z.string().nullable(),
    name_hint: z.string().nullable(),
    confidence: confidenceSchema,
  })),
  psych_tags: z.array(z.enum(PSYCH_TAGS)),
  call_intent: z.enum(CALL_INTENTS),
  shipping_signals: z.object({
    address_mentioned: z.boolean(),
    tracking_asked: z.boolean(),
    complaint: z.boolean(),
  }),
  payment_signals: z.object({
    method_mentioned: z.boolean(),
    refund_asked: z.boolean(),
    complaint: z.boolean(),
  }),
  urgency_signal: z.enum(URGENCY_LEVELS),
  operational_signals: z.array(transcriptOperationalSignalSchema).default([]),
  competitor_mentioned: z.array(z.string()),
  summary: z.string().max(1200),
  language_detected: z.string(),
  resolved_with_version: z.number().int().min(1),
});
export type TranscriptResolverOutput = z.infer<typeof transcriptResolverOutputSchema>;

export const transcriptResolverTestResponseSchema = z.object({
  provider: z.literal('anthropic'),
  model: z.string(),
  source: z.enum(['tenant_config', 'env']),
  promptKey: z.literal('ai.transcript-resolver'),
  output: transcriptResolverOutputSchema,
  latencyMs: z.number().int().min(0),
  checkedAt: z.string(),
});
export type TranscriptResolverTestResponse = z.infer<typeof transcriptResolverTestResponseSchema>;
