import { staffSafeDisplayText } from '../packages/contracts/dist/index.js';

const forbidden = [
  'AI',
  'workflow',
  'rule',
  'axis',
  'sales',
  'support',
  'commission',
  'debug',
  'resolver',
];

const samples = [
  'AI workflow rule created a task on sales axis',
  'Matched rule trace from transcript resolver',
  'support axis routed by workflow rule',
  'sales_axis create_task',
  'support cases from ai_transcript',
  'commission request debug detail',
  'workflow_rule matchedResolver output',
  'rule-engine service_request source',
  'transcript_resolver ai_model',
  'Customer is assigned to sales - support transfer',
  'AI Workflow Rules',
  'resolver debug: support axis',
];

const staffSurfaceSamples = [
  'Call summary',
  'Customer priority',
  'Follow-up',
  'Transferred',
  'Purchase intent',
  'Customer care',
  'Customer request',
  'Refund question',
  'Shipping question',
  'Follow-up requested',
  'Customer concern',
  'Product question',
  'No follow-up needed',
  'Payment/refund issue - clarify next step',
  'Delivery issue - give next step',
  'Callback requested - call back',
  'Purchase intent - qualify next step',
  'Product question - guide the customer',
];

const failures = [];

for (const input of samples) {
  const output = staffSafeDisplayText(input);
  const leaked = forbidden.filter((word) => containsForbidden(output, word));
  if (leaked.length > 0) failures.push({ input, output, leaked });
}

for (const output of staffSurfaceSamples) {
  const leaked = forbidden.filter((word) => containsForbidden(output, word));
  if (leaked.length > 0) failures.push({ input: '<staff-surface-sample>', output, leaked });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checkedSamples: samples.length + staffSurfaceSamples.length,
  forbidden,
}, null, 2));

function containsForbidden(value, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(value);
}
