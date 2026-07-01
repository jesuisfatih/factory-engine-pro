import type { TaskSource } from '../types';

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
  if (!value) return '';
  return value
    .replace(/\bworkflow\s+rules?\b/gi, 'call routing')
    .replace(/\bworkflow\b/gi, 'follow-up')
    .replace(/\brule\s+engine\b/gi, 'call routing')
    .replace(/\brules?\b/gi, 'routing')
    .replace(/\baxis\b/gi, 'focus')
    .replace(/\bsales\b/gi, 'purchase intent')
    .replace(/\bsale\b/gi, 'purchase intent')
    .replace(/\bsupport\b/gi, 'customer request')
    .replace(/\btranscript\s+resolver\b/gi, 'call summary')
    .replace(/\btranscript\b/gi, 'call')
    .replace(/\bAI\b/g, 'Call')
    .replace(/\bai\b/g, 'call');
}

export function humanize(value: string) {
  return personSafeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
}
