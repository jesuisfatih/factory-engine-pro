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
    lineItemSignals: string[];
    deliveryMethod?: string | null;
    hasShippingAddress: boolean;
    fulfillmentStatus?: string | null;
  };
}

const PICKUP_PATTERNS = ['pickup', 'pick up', 'local pickup', 'in store', 'in-store', 'store pickup', 'collect'];
const DELIVERY_PATTERNS = ['local delivery', 'delivery'];
const DELIVERY_PROPERTY_PATTERNS = ['delivery', 'shipping', 'pickup', 'pick up', 'fulfillment', 'method', 'location'];

export function classifyFulfillment(input: FulfillmentInput): FulfillmentClassification {
  const tags = (input.tags ?? []).map(normalizeSignal).filter(Boolean);
  const shippingLineTitles = (input.shippingLines ?? [])
    .flatMap(extractShippingSignals)
    .map(normalizeSignal)
    .filter(Boolean);
  const lineItemSignals = (input.lineItems ?? [])
    .flatMap(extractLineItemSignals)
    .map(normalizeSignal)
    .filter(Boolean);
  const deliveryMethod = input.deliveryMethod ? normalizeSignal(input.deliveryMethod) : null;
  const haystack = [...tags, ...shippingLineTitles, ...lineItemSignals, deliveryMethod ?? ''].join(' ');

  if (matches(haystack, PICKUP_PATTERNS)) {
    return build('pickup', input, tags, shippingLineTitles, lineItemSignals);
  }

  if (matches(haystack, DELIVERY_PATTERNS)) {
    return build('local_delivery', input, tags, shippingLineTitles, lineItemSignals);
  }

  if (input.shippingAddress || shippingLineTitles.length > 0) {
    return build('shipping', input, tags, shippingLineTitles, lineItemSignals);
  }

  return build('unknown', input, tags, shippingLineTitles, lineItemSignals);
}

function build(
  mode: FulfillmentMode,
  input: FulfillmentInput,
  tags: string[],
  shippingLineTitles: string[],
  lineItemSignals: string[],
): FulfillmentClassification {
  return {
    mode,
    evidence: {
      matchedTags: tags.filter((tag) => matches(tag, [...PICKUP_PATTERNS, ...DELIVERY_PATTERNS])),
      shippingLineTitles,
      lineItemSignals,
      deliveryMethod: input.deliveryMethod ?? null,
      hasShippingAddress: Boolean(input.shippingAddress),
      fulfillmentStatus: input.fulfillmentStatus ?? null,
    },
  };
}

function extractShippingSignals(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  return [
    candidate.title,
    candidate.name,
    candidate.method,
    candidate.code,
    candidate.source,
    candidate.carrier_identifier,
    candidate.carrierIdentifier,
    candidate.requested_fulfillment_service_id,
    candidate.requestedFulfillmentServiceId,
  ].filter(isMeaningfulScalar).map(String);
}

function extractLineItemSignals(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const candidate = value as Record<string, unknown>;
  const direct = [candidate.fulfillment_service, candidate.fulfillmentService]
    .filter(isMeaningfulScalar)
    .map(String);
  const properties = candidate.properties ?? candidate.customAttributes ?? candidate.custom_attributes;
  if (Array.isArray(properties)) {
    for (const property of properties) {
      if (!property || typeof property !== 'object') continue;
      const record = property as Record<string, unknown>;
      const name = record.name ?? record.key;
      const propertyValue = record.value ?? record.val;
      pushDeliveryProperty(direct, name, propertyValue);
    }
  } else if (properties && typeof properties === 'object') {
    for (const [name, propertyValue] of Object.entries(properties as Record<string, unknown>)) {
      pushDeliveryProperty(direct, name, propertyValue);
    }
  }
  return direct;
}

function pushDeliveryProperty(target: string[], name: unknown, value: unknown) {
  const normalizedName = isMeaningfulScalar(name) ? normalizeSignal(String(name)) : '';
  const normalizedValue = isMeaningfulScalar(value) ? normalizeSignal(String(value)) : '';
  const namedForDelivery = matches(normalizedName, DELIVERY_PROPERTY_PATTERNS);
  const valueIsDeliveryMode = [...PICKUP_PATTERNS, 'local delivery']
    .some((pattern) => normalizedValue === normalizeSignal(pattern));
  if (!namedForDelivery && !valueIsDeliveryMode) return;
  if (normalizedName) target.push(normalizedName);
  if (normalizedValue) target.push(normalizedValue);
}

function normalizeSignal(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isMeaningfulScalar(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number';
}

function matches(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}
