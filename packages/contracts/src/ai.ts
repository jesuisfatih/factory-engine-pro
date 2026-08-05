import { z } from 'zod';
import { CALL_INTENTS, CREATE_TASK_AXIS, OPERATIONAL_INTENTS, PSYCH_TAGS, URGENCY_LEVELS } from './enums.js';

export const TRANSCRIPT_RESOLVER_SCHEMA_VERSION = 5;

export const TRANSCRIPT_RESOLVER_OUTPUT_FIELDS = [
  'customer_match',
  'product_mentions',
  'psych_tags',
  'call_intent',
  'shipping_signals',
  'payment_signals',
  'urgency_signal',
  'conversation',
  'customer_mood',
  'customer_issue',
  'promise',
  'next_action',
  'operational_signals',
  'person_brief',
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
  transcript: z.string().trim().min(10).max(160_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TranscriptResolverTestInput = z.infer<typeof transcriptResolverTestSchema>;

const confidenceSchema = z.number().min(0).max(1);

export const transcriptEvidenceSchema = z.object({
  speaker: z.enum(['customer', 'agent', 'system', 'unknown']),
  text: z.string().trim().min(1).max(500),
});
export type TranscriptEvidence = z.infer<typeof transcriptEvidenceSchema>;

const transcriptEvidenceListSchema = z.array(transcriptEvidenceSchema).max(6).default([]);

export const transcriptConversationSchema = z.object({
  direction: z.enum(['inbound', 'outbound', 'unknown']),
  kind: z.enum(['customer_conversation', 'voicemail', 'automated_system', 'carrier_vendor', 'agent_only', 'unknown']),
  customer_present: z.boolean(),
  confidence: confidenceSchema,
  evidence: transcriptEvidenceListSchema,
});

export const transcriptCustomerMoodSchema = z.object({
  label: z.enum(['positive', 'calm', 'neutral', 'confused', 'anxious', 'frustrated', 'angry', 'urgent', 'unknown']),
  confidence: confidenceSchema,
  evidence: transcriptEvidenceListSchema,
});

export const transcriptCustomerIssueSchema = z.object({
  detected: z.boolean(),
  category: z.string().trim().max(80).nullable(),
  description: z.string().trim().max(800).nullable(),
  confidence: confidenceSchema,
  evidence: transcriptEvidenceListSchema,
});

export const transcriptPromiseSchema = z.object({
  made: z.boolean(),
  owner: z.enum(['agent', 'customer', 'none']),
  commitment: z.string().trim().max(600).nullable(),
  due_hint: z.string().trim().max(120).nullable(),
  confidence: confidenceSchema,
  evidence: transcriptEvidenceListSchema,
});

export const transcriptNextActionSchema = z.object({
  required: z.boolean(),
  owner: z.enum(['staff', 'customer', 'none']),
  action: z.string().trim().max(600).nullable(),
  expected_outcome: z.string().trim().max(600).nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  confidence: confidenceSchema,
  evidence: transcriptEvidenceListSchema,
});

export const transcriptOperationalSignalSchema = z.object({
  intent: z.enum(OPERATIONAL_INTENTS),
  confidence: confidenceSchema,
  action_required: z.boolean(),
  recommended_axis: z.enum(CREATE_TASK_AXIS).nullable(),
  reason: z.string().max(500),
  suggested_task_title: z.string().max(120).nullable(),
});
export type TranscriptOperationalSignal = z.infer<typeof transcriptOperationalSignalSchema>;

export const transcriptPersonBriefSchema = z.object({
  why_calling: z.string().max(800).default(''),
  upset_about: z.string().max(800).default(''),
  call_goal: z.string().max(500).default(''),
  suggested_actions: z.array(z.string().max(160)).max(6).default([]),
  transcript_snippet: z.string().max(600).default(''),
  direction: z.enum(['inbound', 'outbound', 'unknown']).default('unknown'),
  mood: z.string().max(120).default(''),
  issue: z.string().max(800).default(''),
  promise: z.string().max(600).default(''),
  next_action: z.string().max(600).default(''),
  evidence: transcriptEvidenceListSchema,
}).default({
  why_calling: '',
  upset_about: '',
  call_goal: '',
  suggested_actions: [],
  transcript_snippet: '',
  direction: 'unknown',
  mood: '',
  issue: '',
  promise: '',
  next_action: '',
  evidence: [],
});
export type TranscriptPersonBrief = z.infer<typeof transcriptPersonBriefSchema>;

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
  conversation: transcriptConversationSchema,
  customer_mood: transcriptCustomerMoodSchema,
  customer_issue: transcriptCustomerIssueSchema,
  promise: transcriptPromiseSchema,
  next_action: transcriptNextActionSchema,
  operational_signals: z.array(transcriptOperationalSignalSchema).default([]),
  person_brief: transcriptPersonBriefSchema,
  competitor_mentioned: z.array(z.string()),
  summary: z.string().max(1200),
  language_detected: z.string(),
  resolved_with_version: z.number().int().min(1),
});
export type TranscriptResolverOutput = z.infer<typeof transcriptResolverOutputSchema>;

const legacyTranscriptResolverOutputSchema = transcriptResolverOutputSchema.omit({
  conversation: true,
  customer_mood: true,
  customer_issue: true,
  promise: true,
  next_action: true,
});

export type StoredTranscriptResolverParseResult =
  | { success: true; data: TranscriptResolverOutput; migratedFromVersion: number | null }
  | { success: false; error: z.ZodError };

/**
 * Reads historical resolver rows without relaxing the contract used for new
 * provider responses. Missing v5 fields remain explicitly unknown instead of
 * being inferred from transcript text.
 */
export function parseStoredTranscriptResolverOutput(value: unknown): StoredTranscriptResolverParseResult {
  const current = transcriptResolverOutputSchema.safeParse(value);
  if (current.success) {
    return { success: true, data: current.data, migratedFromVersion: null };
  }

  const legacy = legacyTranscriptResolverOutputSchema.safeParse(value);
  if (!legacy.success) return { success: false, error: current.error };

  const personBrief = legacy.data.person_brief;
  return {
    success: true,
    migratedFromVersion: legacy.data.resolved_with_version,
    data: {
      ...legacy.data,
      conversation: {
        direction: personBrief.direction,
        kind: 'unknown',
        customer_present: false,
        confidence: 0,
        evidence: [],
      },
      customer_mood: {
        label: 'unknown',
        confidence: 0,
        evidence: [],
      },
      customer_issue: {
        detected: false,
        category: null,
        description: null,
        confidence: 0,
        evidence: [],
      },
      promise: {
        made: false,
        owner: 'none',
        commitment: null,
        due_hint: null,
        confidence: 0,
        evidence: [],
      },
      next_action: {
        required: false,
        owner: 'none',
        action: null,
        expected_outcome: null,
        priority: 'low',
        confidence: 0,
        evidence: [],
      },
    },
  };
}

export const transcriptResolverTestResponseSchema = z.object({
  provider: z.literal('anthropic'),
  model: z.string(),
  source: z.enum(['tenant_config', 'env']),
  promptKey: z.literal('ai.transcript-resolver'),
  promptVersion: z.number().int().min(1),
  inputHash: z.string().length(64),
  attemptCount: z.number().int().min(1).max(2),
  repaired: z.boolean(),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
  }),
  costMicros: z.number().int().min(0).nullable(),
  output: transcriptResolverOutputSchema,
  latencyMs: z.number().int().min(0),
  checkedAt: z.string(),
});
export type TranscriptResolverTestResponse = z.infer<typeof transcriptResolverTestResponseSchema>;
