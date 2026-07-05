import type { TaskSource } from '../types';
import { staffSafeDisplayText } from '@factory-engine-pro/contracts';

export function taskSourceLabel(source: TaskSource) {
  if (source === 'call_analysis') return 'Call summary';
  if (source === 'segment_priority') return 'Customer priority';
  if (source === 'stale_follow_up') return 'Follow-up';
  if (source === 'admin_transfer') return 'Transferred';
  return 'Manual';
}

export function focusLabel(value: string | null | undefined) {
  const normalized = normalizeKey(value);
  if (!normalized) return 'No focus selected';
  if (normalized === 'sales' || normalized === 'sale' || normalized.includes('purchase')) return 'Purchase intent';
  if (normalized === 'account') return 'Customer care';
  if (normalized === 'support') return 'Customer request';
  if (normalized.includes('refund')) return 'Refund question';
  if (normalized.includes('shipping')) return 'Shipping question';
  if (normalized.includes('callback') || normalized.includes('follow_up')) return 'Follow-up requested';
  if (normalized.includes('complaint')) return 'Customer concern';
  if (normalized.includes('info') || normalized.includes('inquiry')) return 'Product question';
  if (normalized.includes('no_action')) return 'No follow-up needed';
  return humanize(value ?? '');
}

export function personSafeText(value: string | null | undefined) {
  return staffSafeDisplayText(value);
}

export function humanize(value: string) {
  return personSafeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type StaffActionInput = {
  intent?: string | null;
  tags?: string[] | null;
  upset?: string | null;
  goal?: string | null;
  summary?: string | null;
  urgencyScore?: number | null;
};

export function staffActionLabel(input: StaffActionInput) {
  const signal = primaryActionSignal(input);
  if (signal.includes('refund') || signal.includes('payment') || signal.includes('pricing')) {
    return 'Payment/refund issue - clarify next step';
  }
  if (signal.includes('complaint') || signal.includes('upset') || signal.includes('angry')) {
    return 'Customer concern - handle carefully';
  }
  if (signal.includes('shipping') || signal.includes('delivery') || signal.includes('tracking') || signal.includes('freight')) {
    return 'Delivery issue - give next step';
  }
  if (signal.includes('callback') || signal.includes('follow up') || signal.includes('call back')) {
    return 'Callback requested - call back';
  }
  if (signal.includes('purchase') || signal.includes('quote') || signal.includes('price') || signal.includes('sale')) {
    return 'Purchase intent - qualify next step';
  }
  if (signal.includes('product') || signal.includes('fit') || signal.includes('information') || signal.includes('inquiry')) {
    return 'Product question - guide the customer';
  }
  if ((input.urgencyScore ?? 0) >= 8) return 'High priority - act today';
  return 'Customer follow-up';
}

export function staffActionTone(input: StaffActionInput) {
  const signal = primaryActionSignal(input);
  if (signal.includes('refund') || signal.includes('payment') || signal.includes('pricing') || signal.includes('complaint') || signal.includes('upset') || signal.includes('angry')) return 'danger';
  if (signal.includes('shipping') || signal.includes('delivery') || signal.includes('tracking') || signal.includes('callback') || signal.includes('follow up')) return 'warn';
  if (signal.includes('purchase') || signal.includes('quote') || signal.includes('price') || signal.includes('sale')) return 'success';
  if ((input.urgencyScore ?? 0) >= 8) return 'danger';
  if ((input.urgencyScore ?? 0) >= 6) return 'warn';
  return 'info';
}

export function staffBriefLine(input: StaffActionInput) {
  const candidates = [
    input.goal,
    input.upset,
    input.summary,
  ].map((value) => personSafeText(value).trim()).filter(Boolean);
  const meaningful = candidates.find((value) => !/^no explicit complaint/i.test(value) && !/^no customer/i.test(value));
  return meaningful ?? candidates[0] ?? 'Review the customer context and record the next step.';
}

function primaryActionSignal(input: StaffActionInput) {
  const evidence = actionSignal({
    upset: input.upset,
    goal: input.goal,
    summary: input.summary,
    urgencyScore: input.urgencyScore,
  });
  if (evidence && !isGenericReviewSignal(evidence)) return evidence;
  return actionSignal(input);
}

function actionSignal(input: StaffActionInput) {
  return [
    input.upset,
    input.goal,
    input.summary,
    input.intent,
    ...(input.tags ?? []),
  ].map((value) => positiveSignalText(value)).filter(Boolean).join(' ');
}

function isGenericReviewSignal(value: string) {
  return value.includes('review transcript')
    || value.includes('review call')
    || value.includes('decide whether')
    || value.includes('no confirmed follow up')
    || value.includes('no clear customer follow up')
    || value.includes('no dtf bank product request')
    || value.includes('no follow up needed');
}

function positiveSignalText(value: string | null | undefined) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return '';
  if (isNegativeComplaintSignal(normalized)) return normalized
    .replace(/\bno (explicit )?complaint\b[^.;]*/g, '')
    .replace(/\bno customer (complaint|request)\b[^.;]*/g, '')
    .trim();
  return normalized;
}

function isNegativeComplaintSignal(value: string) {
  return value.includes('no explicit complaint')
    || value.includes('no customer complaint')
    || value.includes('no complaint')
    || value.includes('not a complaint');
}

function normalizeSearchText(value: string | null | undefined) {
  return personSafeText(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
}
