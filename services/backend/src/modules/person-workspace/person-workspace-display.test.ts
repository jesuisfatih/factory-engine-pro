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

  assert.equal(display.displayReason, 'Customer belongs to the assigned Wholesale Customers list.');
  assert.equal(display.displayConcern, 'No customer concern has been recorded.');
  assert.equal(display.displayOutcome, 'No required outcome has been recorded for this portfolio customer.');
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
