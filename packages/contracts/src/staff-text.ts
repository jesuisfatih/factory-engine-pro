const DELIMITED_PREFIX = '(^|[^A-Za-z0-9])';
const DELIMITED_SUFFIX = '(?=$|[^A-Za-z0-9])';

export function staffSafeDisplayText(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const cleaned = [
    [/call[\s._-]+analysis/gi, 'call summary'],
    [/segment[\s._-]+priority/gi, 'customer priority'],
    [/stale[\s._-]+follow[\s._-]+up/gi, 'follow-up'],
    [/admin[\s._-]+transfer/gi, 'transferred'],
    [/service[\s._-]+requests?/gi, 'customer request'],
    [/create[\s._-]+task/gi, 'create follow-up'],
    [/matched[\s._-]+rules?/gi, 'matched routing'],
    [/rule[\s._-]+trace/gi, 'routing detail'],
    [/ai[\s._-]+workflow[\s._-]+rules?/gi, 'call routing'],
    [/ai[\s._-]+workflow/gi, 'follow-up'],
    [/workflow[\s._-]+rules?/gi, 'call routing'],
    [/workflow[\s._-]+rule/gi, 'call routing'],
    [/rule[\s._-]+engine/gi, 'call routing'],
    [/support[\s._-]+cases?/gi, 'customer request'],
    [/support[\s._-]+axis/gi, 'customer request focus'],
    [/sales[\s._-]+axis/gi, 'purchase intent focus'],
    [/shopify[\s._-]+segments?/gi, 'Shopify customer list'],
    [/customer[\s._-]+segments?/gi, 'customer list'],
    [/transcript[\s._-]+snippets?/gi, 'call excerpt'],
    [/transcript[\s._-]+previews?/gi, 'call preview'],
    [/transcript[\s._-]+resolver/gi, 'call summary'],
    [/ai[\s._-]+resolver/gi, 'call summary'],
    [/ai[\s._-]+model/gi, 'call model'],
  ].reduce((text, [pattern, replacement]) => replaceDelimited(text, pattern as RegExp, replacement as string), raw);

  return [
    ['AI', 'call'],
    ['workflow', 'follow-up'],
    ['rule', 'routing'],
    ['rules', 'routing'],
    ['axis', 'focus'],
    ['sales', 'purchase intent'],
    ['sale', 'purchase intent'],
    ['support', 'customer request'],
    ['automation', 'follow-up'],
    ['segments', 'customer lists'],
    ['segment', 'customer list'],
    ['kanban', 'customer list'],
    ['transcript', 'call summary'],
    ['transcripts', 'call summary'],
    ['resolver', 'summary'],
    ['debug', 'review'],
    ['commission', 'request'],
  ].reduce((text, [token, replacement]) => replaceToken(text, token, replacement), cleaned)
    .replace(/\s+/g, ' ')
    .trim();
}

function replaceDelimited(value: string, pattern: RegExp, replacement: string) {
  const source = pattern.source;
  const flags = pattern.flags.includes('i') ? 'gi' : 'g';
  const delimited = new RegExp(`${DELIMITED_PREFIX}${source}${DELIMITED_SUFFIX}`, flags);
  return value.replace(delimited, (_match, prefix: string) => `${prefix}${replacement}`);
}

function replaceToken(value: string, token: string, replacement: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const delimited = new RegExp(`${DELIMITED_PREFIX}${escaped}${DELIMITED_SUFFIX}`, 'gi');
  return value.replace(delimited, (_match, prefix: string) => `${prefix}${replacement}`);
}
