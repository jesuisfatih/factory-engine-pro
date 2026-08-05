import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import { currentModelResolverOutput } from './transcript-resolver-trust.js';

const output = {
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
    evidence: [{ speaker: 'customer', text: 'Please call me tomorrow.' }],
  },
  customer_mood: { label: 'calm', confidence: 0.8, evidence: [] },
  customer_issue: { detected: true, category: 'callback', description: 'Customer requested a callback.', confidence: 0.9, evidence: [] },
  promise: { made: true, owner: 'agent', commitment: 'Call tomorrow.', due_hint: 'tomorrow', confidence: 0.9, evidence: [] },
  next_action: { required: true, owner: 'staff', action: 'Call the customer tomorrow.', expected_outcome: 'Confirm the pending request.', priority: 'medium', confidence: 0.9, evidence: [] },
  operational_signals: [{
    intent: 'callback_requested',
    confidence: 0.9,
    action_required: true,
    recommended_axis: 'account',
    reason: 'Customer requested a callback.',
    suggested_task_title: 'Return customer call',
  }],
  person_brief: {
    why_calling: 'The customer requested a callback.',
    upset_about: 'No complaint was captured.',
    call_goal: 'Confirm the pending request.',
    suggested_actions: ['Call the customer tomorrow.'],
    transcript_snippet: 'Please call me tomorrow.',
    direction: 'inbound',
    mood: 'calm',
    issue: 'Callback requested',
    promise: 'Call tomorrow',
    next_action: 'Call the customer tomorrow.',
    evidence: [],
  },
  competitor_mentioned: [],
  summary: 'Customer requested a callback.',
  language_detected: 'en',
  resolved_with_version: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
};

const trustedRow = {
  resolverOutput: output,
  resolverModel: 'claude-haiku-4-5',
  resolvedAt: new Date('2026-08-06T12:00:00.000Z'),
  resolvedWithVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
};

test('accepts only a current model resolver result', () => {
  assert.equal(currentModelResolverOutput(trustedRow)?.summary, output.summary);
  assert.equal(currentModelResolverOutput({ ...trustedRow, resolverModel: 'local-rule-fallback' }), null);
  assert.equal(currentModelResolverOutput({ ...trustedRow, resolverModel: null }), null);
  assert.equal(currentModelResolverOutput({ ...trustedRow, resolvedAt: null }), null);
  assert.equal(currentModelResolverOutput({ ...trustedRow, resolvedWithVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION - 1 }), null);
});

test('rejects legacy resolver payloads even when their database version was advanced', () => {
  const legacy = { ...output } as Record<string, unknown>;
  delete legacy.conversation;
  delete legacy.customer_mood;
  delete legacy.customer_issue;
  delete legacy.promise;
  delete legacy.next_action;

  assert.equal(currentModelResolverOutput({ ...trustedRow, resolverOutput: legacy }), null);
});
