import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';
import { transcriptOperationalSignals } from './transcript-operational-signals.js';

const baseOutput = {
  customer_match: { customer_id: null, phone: '+13125550100', name_hint: 'Customer', confidence: 0.8 },
  product_mentions: [],
  psych_tags: ['follow_up'],
  call_intent: 'follow_up',
  shipping_signals: { address_mentioned: false, tracking_asked: false, complaint: false },
  payment_signals: { method_mentioned: false, refund_asked: false, complaint: false },
  urgency_signal: 'medium',
  conversation: {
    direction: 'inbound',
    kind: 'customer_conversation',
    customer_present: true,
    confidence: 0.95,
    evidence: [],
  },
  customer_mood: { label: 'calm', confidence: 0.8, evidence: [] },
  customer_issue: { detected: false, category: null, description: null, confidence: 0.8, evidence: [] },
  promise: { made: false, owner: 'none', commitment: null, due_hint: null, confidence: 0.8, evidence: [] },
  next_action: {
    required: false,
    owner: 'none',
    action: null,
    expected_outcome: null,
    priority: 'low',
    confidence: 0.8,
    evidence: [],
  },
  operational_signals: [{
    intent: 'no_action',
    confidence: 0.9,
    action_required: false,
    recommended_axis: null,
    reason: 'No staff action is required.',
    suggested_task_title: null,
  }],
  person_brief: {
    why_calling: '',
    upset_about: '',
    call_goal: '',
    suggested_actions: [],
    transcript_snippet: '',
    direction: 'inbound',
    mood: 'calm',
    issue: '',
    promise: '',
    next_action: '',
    evidence: [],
  },
  competitor_mentioned: [],
  summary: 'Customer conversation.',
  language_detected: 'en',
  resolved_with_version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
} satisfies TranscriptResolverOutput;

test('routes a contradictory no-action decision to human review', () => {
  const output: TranscriptResolverOutput = {
    ...baseOutput,
    next_action: {
      required: true,
      owner: 'staff',
      action: 'Call the customer with an update.',
      expected_outcome: 'Close the promised follow-up.',
      priority: 'high',
      confidence: 0.9,
      evidence: [],
    },
  };

  const [signal] = transcriptOperationalSignals(output);

  assert.equal(signal?.intent, 'human_review_required');
  assert.equal(signal?.action_required, true);
  assert.match(signal?.reason ?? '', /requires staff action/i);
});

test('routes an unresolved agent promise to human review', () => {
  const output: TranscriptResolverOutput = {
    ...baseOutput,
    promise: {
      made: true,
      owner: 'agent',
      commitment: 'I will call you tomorrow.',
      due_hint: 'tomorrow',
      confidence: 0.92,
      evidence: [],
    },
  };

  assert.equal(transcriptOperationalSignals(output)[0]?.intent, 'human_review_required');
});

test('routes a low-confidence actionable intent to human review', () => {
  const output: TranscriptResolverOutput = {
    ...baseOutput,
    operational_signals: [{
      intent: 'callback_requested',
      confidence: 0.4,
      action_required: true,
      recommended_axis: 'account',
      reason: 'A callback might have been requested.',
      suggested_task_title: 'Return customer call',
    }],
  };

  const [signal] = transcriptOperationalSignals(output);

  assert.equal(signal?.intent, 'human_review_required');
  assert.match(signal?.reason ?? '', /confidence/i);
});

test('keeps a confident actionable resolver decision', () => {
  const output: TranscriptResolverOutput = {
    ...baseOutput,
    next_action: {
      required: true,
      owner: 'staff',
      action: 'Return the customer call.',
      expected_outcome: 'Confirm the pending decision.',
      priority: 'medium',
      confidence: 0.9,
      evidence: [],
    },
    operational_signals: [{
      intent: 'callback_requested',
      confidence: 0.91,
      action_required: true,
      recommended_axis: 'account',
      reason: 'The customer requested a callback.',
      suggested_task_title: 'Return customer call',
    }],
  };

  assert.equal(transcriptOperationalSignals(output)[0]?.intent, 'callback_requested');
});

test('keeps no-action for a verified automated call without a customer', () => {
  const output: TranscriptResolverOutput = {
    ...baseOutput,
    conversation: {
      direction: 'outbound',
      kind: 'automated_system',
      customer_present: false,
      confidence: 0.98,
      evidence: [],
    },
  };

  assert.equal(transcriptOperationalSignals(output)[0]?.intent, 'no_action');
});
