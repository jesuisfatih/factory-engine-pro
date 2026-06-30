import {
  transcriptOperationalSignalSchema,
  type TranscriptOperationalSignal,
  type TranscriptResolverOutput,
} from '@factory-engine-pro/contracts';

export const OPERATIONAL_INTENT_KEYWORDS = {
  spare_part_purchase_intent: [
    'spare part',
    'replacement part',
    'part for',
    'parts for',
    'machine part',
    'printer part',
    'yedek parca',
    'parca',
    'wiper blade',
    'blade',
    'handle',
    'sliding handle',
    'nozzle',
    'damper',
    'cap top',
    'printhead',
    'motherboard',
    'sensor',
    'belt',
    'cable',
    'tube',
  ],
  heat_press_machine_purchase_intent: [
    'heat press machine',
    'new heat press',
    'buy heat press',
    'purchase heat press',
    'heat press price',
    'hydraulic press machine',
    'press machine',
    'machine purchase',
    'new machine',
    'hydro heat press',
    'dual station',
    'auto open',
    'clamshell',
    'swing away',
    'pneumatic',
    '16x20',
    '15x15',
  ],
  refund_requested: [
    'refund',
    'return',
    'chargeback',
    'cancel order',
    'cancel my order',
    'money back',
    'dispute',
    'exchange',
    'return label',
    'replacement',
  ],
  shipping_status_question: [
    'shipping',
    'tracking',
    'delivery',
    'freight',
    'liftgate',
    'address',
    'where is my order',
    'eta',
    'lost package',
    'damaged shipment',
    'dock',
  ],
  callback_requested: [
    'call back',
    'callback',
    'call me',
    'call me back',
    'can someone call',
    'ring me',
    'missed call',
    'voicemail',
    'left a message',
    'follow up',
    'reach out',
    'schedule a call',
    'can i speak to',
  ],
  quote_request: [
    'quote',
    'estimate',
    'proposal',
    'invoice me',
    'send pricing',
    'send me price',
    'purchase order',
    'po',
    'bulk pricing',
    'volume pricing',
    'wholesale',
    'reseller',
    'net terms',
  ],
  financing_question: [
    'financing',
    'finance',
    'timepayment',
    'lease',
    'leasing',
    'monthly payment',
    'payment plan',
    'installments',
    'shop pay',
    'affirm',
    'down payment',
    'credit application',
  ],
  price_objection: [
    'price',
    'cost',
    'discount',
    'expensive',
    'too much',
    'cheaper',
    'match price',
    'price match',
    'competitor cheaper',
    'coupon',
    'promo',
    'deal',
    'budget',
    'can you do better',
  ],
  sample_request: [
    'sample',
    'samples',
    'test print',
    'demo print',
    'sample pack',
    'proof',
    'see quality',
  ],
  machine_upgrade_interest: [
    'upgrade',
    'bigger machine',
    'larger machine',
    'replace my machine',
    'second machine',
    'another machine',
    'faster machine',
    'higher volume',
    'more production',
    'add station',
    'dual station upgrade',
    'new location',
  ],
  training_installation_need: [
    'training',
    'installation',
    'install',
    'setup',
    'assembly',
    'how to use',
    'onboarding',
    'calibration',
    'pressure setting',
    'temperature setting',
    'time setting',
    'not heating',
    'wont heat',
    "won't heat",
    'uneven pressure',
    'peeling',
    'curing',
    'error code',
    'not working',
    'troubleshoot',
  ],
  product_fit_question: [
    'which machine',
    'which one',
    'right machine',
    'what size',
    'what do i need',
    'compare',
    'difference between',
    'fit my',
    'recommend',
    'recommendation',
    'beginner',
    'startup',
    'starter',
    'best for shirts',
    'best for hats',
    'compatibility',
    'compatible',
    'works with',
    'production volume',
  ],
  dtf_supply_reorder_signal: [
    'ink',
    'white ink',
    'cmyk',
    'powder',
    'adhesive powder',
    'hot melt',
    'film',
    'pet film',
    'roll film',
    'transfer film',
    'dtf supply',
    'dtf supplies',
    'supplies',
    'transfer sheet',
    'gang sheet',
    'dtf transfers',
    'consumable',
    'cleaning solution',
    'printhead',
    'maintenance',
    'reorder',
    'restock',
    'running low',
    'out of ink',
    'out of film',
    'out of powder',
    'need more',
    'another roll',
  ],
  heat_press_purchase_intent: [
    'heat press',
    'hydro',
    'hydraulic press',
    'press machine',
    'dual station',
    'auto open',
    'clamshell',
    'swing away',
    'pneumatic',
    '16x20',
    '15x15',
    'heat platen',
    'sublimation press',
    'mug press',
    'cap press',
    'rhinestone press',
  ],
  existing_customer_expansion_signal: [
    'add another',
    'buy more',
    'new product',
    'also need',
    'more locations',
    'new location',
    'expanding',
    'new employee',
    'new line',
    'more volume',
    'second unit',
  ],
} as const satisfies Record<Exclude<TranscriptOperationalSignal['intent'], 'no_action'>, readonly string[]>;

export const PURCHASE_SIGNAL_KEYWORDS = [
  'buy',
  'purchase',
  'order one',
  'interested',
  'interested in buying',
  'looking for',
  'need a',
  'need an',
  'want a',
  'want to buy',
  'ready to order',
  'pricing on',
  'price on',
  'do you have',
  'availability',
] as const;

export function transcriptOperationalSignals(output: TranscriptResolverOutput, options: { customerMatched: boolean }): TranscriptOperationalSignal[] {
  const derived = new Map<string, TranscriptOperationalSignal>();
  const sourceText = [
    output.summary,
    output.call_intent,
    output.psych_tags.join(' '),
    output.product_mentions.map((mention) => `${mention.sku ?? ''} ${mention.name_hint ?? ''}`).join(' '),
    output.competitor_mentioned.join(' '),
  ].join(' ');
  if (isAutomatedOrVoicemailOnlyTranscript(sourceText)) {
    return [noActionSignal('Automated carrier, recording, voicemail, or agent-only outbound message was captured; no customer sales or account request was detected.')];
  }
  if (isCarrierVendorOnlyTranscript(sourceText, { customerMatched: options.customerMatched || Boolean(output.customer_match.customer_id) })) {
    return [noActionSignal('Carrier or freight vendor contact was captured without a matched customer, Shopify order, or DTF product request.')];
  }

  const provided = dedupeSignals(output.operational_signals.flatMap((signal) => {
    const parsed = transcriptOperationalSignalSchema.safeParse(signal);
    return parsed.success ? [parsed.data] : [];
  }));
  if (provided.length > 0 && provided.every((signal) => signal.intent === 'no_action' || !signal.action_required)) {
    return provided.some((signal) => signal.intent === 'no_action')
      ? provided
      : [noActionSignal('Resolver explicitly marked this transcript as non-actionable.')];
  }

  const text = normalizedText(sourceText);
  const hasTag = (tag: string) => output.psych_tags.includes(tag as TranscriptResolverOutput['psych_tags'][number]);
  const hasAny = (needles: readonly string[]) => needles.some((needle) => keywordMatches(text, needle));
  const productText = normalizedText(output.product_mentions.map((mention) => `${mention.sku ?? ''} ${mention.name_hint ?? ''}`).join(' '));
  const hasProduct = (needles: readonly string[]) => needles.some((needle) => keywordMatches(productText, needle));
  const hasPurchaseSignal = hasTag('purchase_intent') || output.call_intent === 'sale' || hasAny(PURCHASE_SIGNAL_KEYWORDS);
  const action = (intent: TranscriptOperationalSignal['intent'], confidence: number, axis: TranscriptOperationalSignal['recommended_axis'], title: string, reason: string) => {
    derived.set(intent, {
      intent,
      confidence,
      action_required: intent !== 'no_action',
      recommended_axis: axis,
      reason,
      suggested_task_title: intent === 'no_action' ? null : title,
    });
  };

  if (output.payment_signals.refund_asked || hasTag('refund_intent') || hasAny(OPERATIONAL_INTENT_KEYWORDS.refund_requested)) {
    action('refund_requested', 0.86, 'account', 'Refund review follow-up', 'Customer mentioned refund, return, cancellation, or payment recovery.');
  }
  if (output.shipping_signals.tracking_asked || output.shipping_signals.address_mentioned || output.shipping_signals.complaint || hasTag('shipping_issue') || hasAny(OPERATIONAL_INTENT_KEYWORDS.shipping_status_question)) {
    action('shipping_status_question', 0.78, 'account', 'Shipping status follow-up', 'Customer asked about shipping, delivery, tracking, freight, or address details.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.callback_requested) || output.call_intent === 'follow_up' || hasTag('follow_up')) {
    action('callback_requested', 0.82, 'sales', 'Callback requested follow-up', 'Customer or agent indicated a follow-up call is needed.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.quote_request)) {
    action('quote_request', 0.84, 'sales', 'Quote request follow-up', 'Customer asked for a quote, estimate, proposal, or pricing send-out.');
  }
  if (output.payment_signals.method_mentioned || hasAny(OPERATIONAL_INTENT_KEYWORDS.financing_question)) {
    action('financing_question', 0.8, 'account', 'Financing question follow-up', 'Customer discussed financing, payment method, lease, or payment plan.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.price_objection)) {
    action('price_objection', 0.72, 'sales', 'Price objection follow-up', 'Customer discussed price, discount, or cost objection.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.sample_request)) {
    action('sample_request', 0.82, 'sales', 'Sample request follow-up', 'Customer asked for samples, demo print, or test output.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.spare_part_purchase_intent) || hasProduct(OPERATIONAL_INTENT_KEYWORDS.spare_part_purchase_intent)) {
    action('spare_part_purchase_intent', 0.84, 'sales', 'Spare part purchase follow-up', 'Customer asked about a replacement part, machine part, or SKU.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.machine_upgrade_interest)) {
    action('machine_upgrade_interest', 0.82, 'sales', 'Machine upgrade follow-up', 'Customer signaled upgrade, replacement, or additional machine interest.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.training_installation_need)) {
    action('training_installation_need', 0.76, 'account', 'Training or installation follow-up', 'Customer needs setup, training, installation, or equipment-use follow-up.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.product_fit_question)) {
    action('product_fit_question', 0.78, 'sales', 'Product fit consultation follow-up', 'Customer is evaluating fit, size, comparison, or recommendation.');
  }
  if (hasAny(OPERATIONAL_INTENT_KEYWORDS.dtf_supply_reorder_signal) || hasProduct(OPERATIONAL_INTENT_KEYWORDS.dtf_supply_reorder_signal)) {
    action('dtf_supply_reorder_signal', 0.78, 'sales', 'DTF supply reorder follow-up', 'Customer mentioned DTF supplies, transfers, film, powder, ink, or consumables.');
  }
  if (hasPurchaseSignal && (hasAny(OPERATIONAL_INTENT_KEYWORDS.heat_press_machine_purchase_intent) || hasProduct(OPERATIONAL_INTENT_KEYWORDS.heat_press_machine_purchase_intent))) {
    action('heat_press_machine_purchase_intent', 0.9, 'sales', 'Heat press machine purchase follow-up', 'Customer showed purchase intent for a new heat press machine.');
  }
  if (hasPurchaseSignal && (hasAny(OPERATIONAL_INTENT_KEYWORDS.heat_press_purchase_intent) || hasProduct(OPERATIONAL_INTENT_KEYWORDS.heat_press_purchase_intent) || productText.includes('press'))) {
    action('heat_press_purchase_intent', 0.88, 'sales', 'Heat press purchase follow-up', 'Customer showed purchase intent for heat press or related machine.');
  }
  if ((options.customerMatched || output.customer_match.customer_id) && (hasPurchaseSignal || hasAny(OPERATIONAL_INTENT_KEYWORDS.existing_customer_expansion_signal))) {
    action('existing_customer_expansion_signal', 0.74, 'sales', 'Existing customer expansion follow-up', 'Matched customer showed expansion, upsell, or additional purchase signal.');
  }
  if (derived.size === 0 && output.product_mentions.length > 0 && (hasTag('info_request') || output.call_intent === 'inquiry')) {
    action('product_fit_question', 0.62, 'sales', 'Product information follow-up', 'Customer asked about a product and may need sales consultation.');
  }
  if (derived.size === 0) {
    derived.set('no_action', noActionSignal('No sales or personnel follow-up signal was detected.'));
  }
  return dedupeSignals([...provided, ...Array.from(derived.values())]);
}

export function isAutomatedOrVoicemailOnlyTranscript(value: string) {
  const text = normalizedText(value);
  if (!text) return false;
  const automatedScore = phraseScore(text, AUTOMATED_CALL_BOILERPLATE_PHRASES);
  const voicemailScore = phraseScore(text, VOICEMAIL_BOILERPLATE_PHRASES);
  const agentOnlyScore = phraseScore(text, AGENT_OUTBOUND_ONLY_PHRASES);
  const hasCustomerDemand = CUSTOMER_DEMAND_PATTERNS.some((pattern) => pattern.test(text));
  return !hasCustomerDemand && (
    automatedScore >= 2
    || voicemailScore >= 2
    || (automatedScore >= 1 && agentOnlyScore >= 1)
    || (voicemailScore >= 1 && agentOnlyScore >= 1)
  );
}

export function isCarrierVendorOnlyTranscript(value: string, options: { customerMatched?: boolean } = {}) {
  if (options.customerMatched) return false;
  const text = normalizedText(value);
  if (!text) return false;
  const carrierScore = phraseScore(text, CARRIER_VENDOR_PHRASES);
  if (carrierScore === 0) return false;
  const hasDtfContext = DTF_PRODUCT_CONTEXT_PHRASES.some((phrase) => keywordMatches(text, phrase));
  const hasShopifyOrderContext = SHOPIFY_ORDER_CONTEXT_PATTERNS.some((pattern) => pattern.test(text));
  const hasDirectCustomerRequest = CUSTOMER_DEMAND_PATTERNS.some((pattern) => pattern.test(text));
  return !hasDtfContext && !hasShopifyOrderContext && (
    carrierScore >= 2
    || (carrierScore >= 1 && !hasDirectCustomerRequest)
  );
}

function noActionSignal(reason: string): TranscriptOperationalSignal {
  return {
    intent: 'no_action',
    confidence: 1,
    action_required: false,
    recommended_axis: null,
    reason,
    suggested_task_title: null,
  };
}

export function normalizedText(value: string) {
  return value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function keywordMatches(text: string, keyword: string) {
  const normalizedKeyword = normalizedText(keyword);
  if (!normalizedKeyword) return false;
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

function dedupeSignals(signals: TranscriptOperationalSignal[]) {
  const byIntent = new Map<string, TranscriptOperationalSignal>();
  for (const signal of signals) {
    const existing = byIntent.get(signal.intent);
    if (!existing || signal.confidence > existing.confidence) byIntent.set(signal.intent, signal);
  }
  const actionable = Array.from(byIntent.values()).filter((signal) => signal.intent !== 'no_action');
  return actionable.length > 0 ? actionable : Array.from(byIntent.values());
}

function phraseScore(text: string, phrases: readonly string[]) {
  return phrases.reduce((score, phrase) => score + (text.includes(normalizedText(phrase)) ? 1 : 0), 0);
}

const AUTOMATED_CALL_BOILERPLATE_PHRASES = [
  'call may be recorded',
  'may be recorded',
  'quality and training purposes',
  'thank you for choosing roadrunner',
  'choosing roadrunner',
  'at roadrunner',
  'make shipping smarter',
  'more efficient starting online',
  'at the end of your call',
  'brief two question survey',
  'your feedback helps us',
  'please listen carefully as our menu options',
] as const;

const VOICEMAIL_BOILERPLATE_PHRASES = [
  'your call has been forwarded to voicemail',
  'person you are trying to reach is not available',
  'please record your message',
  'when you have finished recording',
  'you may hang up',
  'press 1',
  'leave it alone',
] as const;

const AGENT_OUTBOUND_ONLY_PHRASES = [
  'this is',
  'from dtfbank',
  'from dpfbank',
  'courtesy call',
  'just reaching out',
  'see how everything is going',
  'please feel free to reach out',
] as const;

const CARRIER_VENDOR_PHRASES = [
  'roadrunner',
  'road runner',
  'roadrunner transportation',
  'road runner transportation',
  'rrts.com',
  'delivery appointment',
  'schedule a delivery appointment',
  'shipping smarter',
  'freight carrier',
  'transportation',
] as const;

const DTF_PRODUCT_CONTEXT_PHRASES = [
  'dtf',
  'dtf bank',
  'dtf supply',
  'dtf supplies',
  'heat press',
  'hydro',
  'heat platen',
  'gang sheet',
  'transfer sheet',
  'printer',
  'film',
  'powder',
  'ink',
  'spare part',
  'machine',
] as const;

const CUSTOMER_DEMAND_PATTERNS = [
  /\bi\s+(need|want|would like|am looking|m looking|ordered|bought|purchased|have|got)\b/,
  /\bwe\s+(need|want|would like|are looking|re looking|ordered|bought|purchased|have|got)\b/,
  /\b(can|could)\s+you\b/,
  /\b(how much|what is the price|what's the price|quote|refund|tracking|where is my order|order number|need help|not working|broken|error code)\b/,
] as const;

const SHOPIFY_ORDER_CONTEXT_PATTERNS = [
  /\border\s*(#|number|no\.?)\s*\d{3,}/,
  /\bshopify\b/,
  /\btracking\s*(#|number|no\.?)\b/,
] as const;
