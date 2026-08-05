import {
  transcriptOperationalSignalSchema,
  type TranscriptOperationalSignal,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';

/**
 * Resolver output is the sole semantic authority. This function only validates,
 * deduplicates, and enforces the one-primary-action contract.
 */
export function transcriptOperationalSignals(output: TranscriptResolverOutput): TranscriptOperationalSignal[] {
  const byIntent = new Map<TranscriptOperationalSignal['intent'], TranscriptOperationalSignal>();
  for (const candidate of output.operational_signals) {
    const parsed = transcriptOperationalSignalSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const existing = byIntent.get(parsed.data.intent);
    if (!existing || parsed.data.confidence > existing.confidence) byIntent.set(parsed.data.intent, parsed.data);
  }

  const signals = [...byIntent.values()];
  const actionable = signals
    .filter((signal) => signal.action_required && signal.intent !== 'no_action')
    .sort((left, right) => right.confidence - left.confidence);
  if (actionable.length > 0) return [actionable[0]];

  const noAction = signals
    .filter((signal) => signal.intent === 'no_action' || !signal.action_required)
    .sort((left, right) => right.confidence - left.confidence)[0];
  return noAction ? [noAction] : [];
}
