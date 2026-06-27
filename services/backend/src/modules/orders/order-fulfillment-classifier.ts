import type { FulfillmentMode } from '@factory-engine-pro/contracts';

export interface FulfillmentInput {
  tags?: string[];
  lineItems?: unknown[];
  shippingAddress?: unknown;
  shippingLines?: unknown[];
  deliveryMethod?: string | null;
  fulfillmentStatus?: string | null;
}

export interface FulfillmentClassification {
  mode: FulfillmentMode;
  evidence: {
    matchedTags: string[];
    shippingLineTitles: string[];
    deliveryMethod?: string | null;
    hasShippingAddress: boolean;
    fulfillmentStatus?: string | null;
  };
}

const PICKUP_PATTERNS = ['pickup', 'pick up', 'local pickup', 'in store', 'in-store', 'store pickup', 'collect'];
const DELIVERY_PATTERNS = ['local delivery', 'delivery'];

export function classifyFulfillment(input: FulfillmentInput): FulfillmentClassification {
  const tags = (input.tags ?? []).map((tag) => tag.toLowerCase());
  const shippingLineTitles = (input.shippingLines ?? [])
    .map((line) => extractTitle(line).toLowerCase())
    .filter(Boolean);
  const deliveryMethod = input.deliveryMethod?.toLowerCase() ?? null;
  const haystack = [...tags, ...shippingLineTitles, deliveryMethod ?? ''].join(' ');

  if (matches(haystack, PICKUP_PATTERNS)) {
    return build('pickup', input, tags, shippingLineTitles);
  }

  if (matches(haystack, DELIVERY_PATTERNS)) {
    return build('local_delivery', input, tags, shippingLineTitles);
  }

  if (input.shippingAddress || shippingLineTitles.length > 0) {
    return build('shipping', input, tags, shippingLineTitles);
  }

  return build('unknown', input, tags, shippingLineTitles);
}

function build(
  mode: FulfillmentMode,
  input: FulfillmentInput,
  tags: string[],
  shippingLineTitles: string[],
): FulfillmentClassification {
  return {
    mode,
    evidence: {
      matchedTags: tags.filter((tag) => matches(tag, [...PICKUP_PATTERNS, ...DELIVERY_PATTERNS])),
      shippingLineTitles,
      deliveryMethod: input.deliveryMethod ?? null,
      hasShippingAddress: Boolean(input.shippingAddress),
      fulfillmentStatus: input.fulfillmentStatus ?? null,
    },
  };
}

function extractTitle(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const candidate = value as Record<string, unknown>;
  return String(candidate.title ?? candidate.name ?? candidate.method ?? '');
}

function matches(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}
