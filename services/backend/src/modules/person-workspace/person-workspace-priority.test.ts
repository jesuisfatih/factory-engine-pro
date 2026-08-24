import assert from 'node:assert/strict';
import test from 'node:test';
import { PersonWorkspaceService, futureScheduledPriorityWorkIsCurrent, priorityCustomerShouldAppear } from './person-workspace.service.js';

test('priority pool removes a customer as soon as follow-up work exists', () => {
  assert.equal(priorityCustomerShouldAppear(0, false), true);
  assert.equal(priorityCustomerShouldAppear(1, false), false);
});

test('completed customers remain out of the prospecting pool', () => {
  assert.equal(priorityCustomerShouldAppear(0, true), false);
});

test('future rule-driven reappearance is not treated as current work', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  assert.equal(futureScheduledPriorityWorkIsCurrent(new Date('2026-08-25T12:00:00.000Z'), now), false);
  assert.equal(futureScheduledPriorityWorkIsCurrent(new Date('2026-08-23T12:00:00.000Z'), now), true);
});

test('priority call work is visible in the follow-up list', () => {
  const service = Object.create(PersonWorkspaceService.prototype) as unknown as {
    isDailyWorkflowTask: (row: unknown) => boolean;
  };
  assert.equal(service.isDailyWorkflowTask({
    source: 'priority_call',
    axis: 'sales',
    sourceCallId: null,
    sourceEmailId: null,
    matchedRuleId: null,
    metadata: {},
  }), true);
});
