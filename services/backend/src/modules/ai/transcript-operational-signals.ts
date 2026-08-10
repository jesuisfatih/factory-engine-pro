import {
  transcriptOperationalSignalSchema,
  type TranscriptOperationalSignal,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';

export interface TranscriptResolverConsistency {
  requiresHumanReview: boolean;
  reasons: string[];
}

const MIN_ACTIONABLE_CONFIDENCE = 0.55;

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
  const consistency = transcriptResolverConsistency(output, actionable);
  if (consistency.requiresHumanReview) {
    const confidence = Math.max(
      output.next_action.confidence,
      output.promise.confidence,
      output.conversation.confidence,
      actionable[0]?.confidence ?? 0,
    );
    return [{
      intent: 'human_review_required',
      confidence: Math.max(0.5, Math.min(1, confidence)),
      action_required: true,
      recommended_axis: 'account',
      reason: consistency.reasons.join(' '),
      suggested_task_title: 'Review call outcome',
    }];
  }
  if (actionable.length > 0) return [actionable[0]];

  const noAction = signals
    .filter((signal) => signal.intent === 'no_action' || !signal.action_required)
    .sort((left, right) => right.confidence - left.confidence)[0];
  return noAction ? [noAction] : [];
}

export function transcriptResolverConsistency(
  output: TranscriptResolverOutput,
  parsedActionableSignals?: TranscriptOperationalSignal[],
): TranscriptResolverConsistency {
  const actionable = parsedActionableSignals ?? output.operational_signals
    .flatMap((candidate) => {
      const parsed = transcriptOperationalSignalSchema.safeParse(candidate);
      return parsed.success && parsed.data.action_required && parsed.data.intent !== 'no_action' ? [parsed.data] : [];
    })
    .sort((left, right) => right.confidence - left.confidence);
  const reasons: string[] = [];
  const staffNextAction = output.next_action.required && output.next_action.owner === 'staff';
  const staffPromise = output.promise.made && output.promise.owner === 'agent';

  if ((staffNextAction || staffPromise) && actionable.length === 0) {
    reasons.push('The structured call analysis requires staff action but did not provide a reliable operational intent.');
  }
  if (actionable[0] && actionable[0].intent !== 'human_review_required' && actionable[0].confidence < MIN_ACTIONABLE_CONFIDENCE) {
    reasons.push('The operational intent confidence is below the automatic-routing threshold.');
  }
  if (
    actionable.length === 0
    && output.operational_signals.length === 0
    && output.conversation.customer_present
    && output.conversation.kind === 'customer_conversation'
  ) {
    reasons.push('A customer conversation was captured without an operational decision.');
  }

  return { requiresHumanReview: reasons.length > 0, reasons };
}
