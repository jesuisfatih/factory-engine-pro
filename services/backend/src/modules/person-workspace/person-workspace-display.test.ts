import assert from 'node:assert/strict';
import test from 'node:test';
import { personCardDisplay, personDailyCallItemDisplay } from './person-workspace.service.js';

test('priority customer cards expose recorded portfolio facts without invented actions', () => {
  const display = personCardDisplay({
    kind: 'customer',
    id: 'daily-seg_1-cust_1',
    customerId: 'cust_1',
    title: 'Acme Prints',
    summary: 'Wholesale Customers segment customer - U7.1',
    segment: 'Wholesale Customers',
    segmentColor: '#2563eb',
    priority: 7,
    urgencyScore: 7.1,
    urgencyBreakdown: { score: 7.1, factors: [] },
    columnId: 'unassigned',
    pinned: false,
    pinnedAt: null,
    source: 'segment_priority',
    phone: '+13125550100',
    email: 'buyer@example.com',
    ordersCount: 2,
    totalSpent: 350,
    customerRisk: 'none',
    customerRiskNote: null,
    currentDisposition: null,
    outcomeRequired: false,
  } as never);

  assert.equal(display.analysisStatus, 'not_applicable');
  assert.equal(display.displayReason, 'Assigned customer list: Wholesale Customers.');
  assert.equal(display.displayConcern, '');
  assert.equal(display.displayOutcome, '');
  assert.deepEqual(display.displayActions, []);
  assert.equal(display.displayBadges[0]?.label, 'Wholesale Customers');
});

test('priority list rows report open requests without manufacturing a playbook', () => {
  const display = personDailyCallItemDisplay({
    kind: 'customer',
    id: 'daily-seg_1-cust_1',
    customerId: 'cust_1',
    customerName: 'Acme Prints',
    email: 'buyer@example.com',
    phone: '+13125550100',
    ordersCount: 2,
    totalSpent: 350,
    lastContact: '2026-08-06T12:00:00.000Z',
    assignedAxis: 'sales',
    segment: { id: 'seg_1', name: 'Wholesale Customers', color: '#2563eb', priority: 10, dailyCap: null },
    urgencyScore: 7.1,
    urgencyBreakdown: { score: 7.1, factors: [] },
    repeatCount: 0,
    customOrder: null,
    pinned: false,
    pinId: null,
    notesCount: 0,
    openTasksCount: 0,
    openRequestsCount: 2,
    callsCount: 0,
    customerRisk: 'none',
    customerRiskNote: null,
    latestNote: null,
    latestOrder: null,
    latestCall: null,
    reason: 'Wholesale Customers segment customer - 2 customer requests',
  } as never);

  assert.equal(display.displayOutcome, '2 open customer requests are attached to this customer.');
  assert.deepEqual(display.displayActions, []);
});

test('failed call analysis exposes an explicit unavailable state without invented guidance', () => {
  const display = personCardDisplay({
    kind: 'task',
    id: 'swi_1',
    customerId: 'cust_1',
    assignedMemberId: 'tmbr_1',
    assignedMemberName: 'Linda',
    axis: 'sales',
    title: 'Call follow-up',
    summary: 'Payment refund callback shipping purchase intent',
    segment: 'Call analysis',
    segmentColor: '#2563eb',
    priority: 8,
    urgencyScore: 8,
    urgencyBreakdown: { score: 8, factors: [] },
    columnId: 'unassigned',
    pinned: false,
    pinnedAt: null,
    source: 'call_analysis',
    customerRisk: 'none',
    customerRiskNote: null,
    resolverOutput: null,
    aiBrief: {
      whyCalling: '',
      upsetAbout: '',
      callGoal: '',
      suggestedActions: [],
      promptKey: 'person.workspace.resolver-unavailable',
      promptVersion: '5',
      modelUsed: 'unavailable',
      confidence: 0,
    },
    currentDisposition: 'not_selected',
    outcomeRequired: true,
  } as never);

  assert.equal(display.analysisStatus, 'unavailable');
  assert.equal(display.displayReason, '');
  assert.equal(display.displayConcern, '');
  assert.equal(display.displayOutcome, '');
  assert.deepEqual(display.displayActions, []);
  assert.equal(display.displayTitle, 'Call follow-up');
  assert.deepEqual(display.displayBadges, [{ label: 'Call details unavailable', tone: 'info' }]);
});

test('manual text containing intent keywords is not converted into a generated playbook', () => {
  const display = personCardDisplay({
    kind: 'task',
    id: 'swi_manual',
    customerId: 'cust_1',
    title: 'Refund and shipping follow-up',
    summary: 'Payment refund callback shipping purchase intent',
    segment: 'Manual follow-up',
    segmentColor: '#2563eb',
    priority: 8,
    urgencyScore: 8,
    urgencyBreakdown: { score: 8, factors: [] },
    columnId: 'unassigned',
    pinned: false,
    pinnedAt: null,
    source: 'manual',
    customerRisk: 'none',
    customerRiskNote: null,
    currentDisposition: 'not_selected',
    outcomeRequired: true,
  } as never);

  assert.equal(display.analysisStatus, 'not_applicable');
  assert.equal(display.displayReason, 'Payment refund callback shipping purchase intent');
  assert.equal(display.displayOutcome, '');
  assert.deepEqual(display.displayActions, []);
  assert.deepEqual(display.displayBadges, []);
});
