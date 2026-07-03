import type {
  FrontendCustomizationBinding,
  FrontendCustomizationBlock,
  FrontendCustomizationCondition,
  FrontendCustomizationElementField,
  FrontendCustomizationElementId,
  FrontendCustomizationElementOverride,
  FrontendCustomizationModalSection,
  FrontendCustomizationRuntimeDto,
  FrontendCustomizationSlot,
  FrontendCustomizationTone,
} from '@factory-engine-pro/contracts';

export type FrontendCustomizationContext = Partial<Record<'summary' | 'dailyCall' | 'priorityCustomer' | 'taskBrief' | 'customerDetail', unknown>>;

export type EffectiveElementOverride = Omit<
  FrontendCustomizationElementOverride,
  'audience' | 'copyOverrides' | 'hiddenFields' | 'visibleFields'
> & {
  copyOverrides: Record<string, string>;
  hiddenFields: FrontendCustomizationElementField[];
  visibleFields?: FrontendCustomizationElementField[];
};

interface SlotProps {
  customization?: FrontendCustomizationRuntimeDto | null;
  slot: FrontendCustomizationSlot;
  context: FrontendCustomizationContext;
  className?: string;
}

export function FrontendCustomizationSlotView({ customization, slot, context, className }: SlotProps) {
  const blocks = customization?.definition.blocks
    ?.filter((block) => block.slot === slot && blockVisible(block, context))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id)) ?? [];
  if (blocks.length === 0) return null;
  return (
    <div className={`mcp-ui-slot mcp-ui-slot-${slot.replaceAll('.', '-')}${className ? ` ${className}` : ''}`}>
      {blocks.map((block) => <FrontendCustomizationBlockView key={block.id} block={block} context={context} />)}
    </div>
  );
}

export function frontendElementOverride(
  customization: FrontendCustomizationRuntimeDto | null | undefined,
  elementId: FrontendCustomizationElementId,
  context: FrontendCustomizationContext,
): EffectiveElementOverride | null {
  const matches = (customization?.definition.elementOverrides ?? [])
    .filter((override) => override.elementId === elementId && audienceMatches(override, context))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (matches.length === 0) return null;

  const merged: EffectiveElementOverride = {
    id: matches[0].id,
    elementId,
    priority: 0,
    toneRule: 'none',
    copyOverrides: {},
    hiddenFields: [],
    requireScreenshotProof: true,
  };
  for (const override of matches) {
    merged.id = override.id;
    merged.priority = override.priority;
    merged.density = override.density ?? merged.density;
    merged.emphasis = override.emphasis ?? merged.emphasis;
    merged.toneRule = override.toneRule ?? merged.toneRule;
    merged.tone = override.tone ?? merged.tone;
    merged.requireScreenshotProof = override.requireScreenshotProof;
    if (override.visibleFields) merged.visibleFields = [...override.visibleFields];
    if (override.hiddenFields) {
      merged.hiddenFields = Array.from(new Set([...merged.hiddenFields, ...override.hiddenFields]));
    }
    if (override.sectionOrder) merged.sectionOrder = [...override.sectionOrder];
    merged.copyOverrides = { ...merged.copyOverrides, ...override.copyOverrides };
  }
  return merged;
}

export function frontendFieldVisible(
  override: EffectiveElementOverride | null | undefined,
  field: FrontendCustomizationElementField,
  defaultVisible = true,
) {
  if (!override) return defaultVisible;
  if (override.visibleFields?.length) return override.visibleFields.includes(field);
  if (override.hiddenFields.includes(field)) return false;
  return defaultVisible;
}

export function frontendCopy(
  override: EffectiveElementOverride | null | undefined,
  key: string,
  fallback: string,
) {
  return override?.copyOverrides[key] ?? fallback;
}

export function frontendElementClassName(
  override: EffectiveElementOverride | null | undefined,
  urgencyScore?: number | null,
) {
  if (!override) return '';
  const classes = ['mcp-element'];
  if (override.density) classes.push(`mcp-element-density-${override.density}`);
  if (override.emphasis) classes.push(`mcp-element-emphasis-${override.emphasis}`);
  const tone = toneForOverride(override, urgencyScore);
  if (tone && tone !== 'neutral') classes.push(`mcp-element-tone-${tone}`);
  return classes.join(' ');
}

export function frontendModalSectionStyle(
  override: EffectiveElementOverride | null | undefined,
  section: FrontendCustomizationModalSection,
  fallbackOrder: number,
): { order: number } {
  const index = override?.sectionOrder?.indexOf(section) ?? -1;
  return { order: index >= 0 ? index + 1 : fallbackOrder };
}

function FrontendCustomizationBlockView({ block, context }: { block: FrontendCustomizationBlock; context: FrontendCustomizationContext }) {
  const value = block.value ? formatBinding(block.value, context) : null;
  const body = block.template ? renderTemplate(block.template, context) : block.text;
  const title = block.title ? renderTemplate(block.title, context) : block.label;
  const tone = `tone-${block.tone}`;
  if (block.type === 'stat_tile') {
    return (
      <div className={`mcp-ui-block mcp-ui-stat ${tone}${block.compact ? ' compact' : ''}`}>
        <span>{block.label}</span>
        <strong>{value ?? body ?? '-'}</strong>
        {body && value ? <em>{body}</em> : null}
      </div>
    );
  }
  if (block.type === 'badge') {
    return <span className={`mcp-ui-block mcp-ui-badge ${tone}`}>{value ?? body ?? title}</span>;
  }
  if (block.type === 'field') {
    return (
      <div className={`mcp-ui-block mcp-ui-field ${tone}${block.compact ? ' compact' : ''}`}>
        <span>{block.label}</span>
        <strong>{value ?? body ?? '-'}</strong>
      </div>
    );
  }
  if (block.type === 'checklist') {
    return (
      <div className={`mcp-ui-block mcp-ui-checklist ${tone}`}>
        <strong>{title}</strong>
        <ul>
          {block.items.map((item) => <li key={item}>{renderTemplate(item, context)}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <div className={`mcp-ui-block mcp-ui-message ${tone}${block.type === 'section' ? ' section' : ''}${block.compact ? ' compact' : ''}`}>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {value ? <p>{value}</p> : null}
    </div>
  );
}

function audienceMatches(override: FrontendCustomizationElementOverride, context: FrontendCustomizationContext) {
  const audience = override.audience ?? {};
  const memberIds = audience.memberIds ?? [];
  const memberEmails = (audience.memberEmails ?? []).map((email) => email.toLowerCase());
  const roleNames = (audience.roleNames ?? []).map((role) => role.toLowerCase());
  if (memberIds.length === 0 && memberEmails.length === 0 && roleNames.length === 0) return true;

  const viewer = asRecord(asRecord(context.summary).viewer);
  const viewerId = typeof viewer.id === 'string' ? viewer.id : '';
  const viewerEmail = typeof viewer.email === 'string' ? viewer.email.toLowerCase() : '';
  const viewerRoles = Array.isArray(viewer.roleNames)
    ? viewer.roleNames.map((role) => String(role).toLowerCase())
    : [];

  return (viewerId && memberIds.includes(viewerId))
    || (viewerEmail && memberEmails.includes(viewerEmail))
    || viewerRoles.some((role) => roleNames.includes(role));
}

function toneForOverride(
  override: EffectiveElementOverride,
  urgencyScore?: number | null,
): FrontendCustomizationTone | null {
  if (override.toneRule === 'static') return override.tone ?? 'accent';
  if (override.toneRule !== 'urgency') return override.tone ?? null;
  const score = Number(urgencyScore ?? 0);
  if (score >= 8) return 'danger';
  if (score >= 6) return 'warning';
  if (score >= 4) return 'success';
  return 'info';
}

function blockVisible(block: FrontendCustomizationBlock, context: FrontendCustomizationContext) {
  const all = block.visibility?.all ?? [];
  const any = block.visibility?.any ?? [];
  if (all.length > 0 && !all.every((condition) => conditionMatches(condition, context))) return false;
  if (any.length > 0 && !any.some((condition) => conditionMatches(condition, context))) return false;
  return true;
}

function conditionMatches(condition: FrontendCustomizationCondition, context: FrontendCustomizationContext) {
  const actual = readBindingValue({ source: condition.source, path: condition.path }, context);
  const expected = condition.value;
  switch (condition.operator) {
    case 'exists':
      return actual !== null && actual !== undefined && actual !== '';
    case 'not_exists':
      return actual === null || actual === undefined || actual === '';
    case 'eq':
      return String(actual ?? '') === String(expected ?? '');
    case 'neq':
      return String(actual ?? '') !== String(expected ?? '');
    case 'gte':
      return Number(actual ?? 0) >= Number(expected ?? 0);
    case 'lte':
      return Number(actual ?? 0) <= Number(expected ?? 0);
    case 'contains':
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'in':
      return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ''));
    default:
      return false;
  }
}

function formatBinding(binding: FrontendCustomizationBinding, context: FrontendCustomizationContext) {
  const raw = readBindingValue(binding, context);
  if (raw === null || raw === undefined || raw === '') return binding.fallback ?? null;
  if (binding.format === 'number' || binding.format === 'count') return numberFormat(raw);
  if (binding.format === 'currency') return currencyFormat(raw);
  if (binding.format === 'relative_time') return relativeTime(raw);
  return String(raw);
}

function readBindingValue(binding: Pick<FrontendCustomizationBinding, 'source' | 'path'>, context: FrontendCustomizationContext) {
  const root = context[binding.source];
  if (!root) return null;
  return binding.path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) return (current as Record<string, unknown>)[part];
    return null;
  }, root);
}

function renderTemplate(template: string, context: FrontendCustomizationContext) {
  return template.replace(/\{\{\s*([a-zA-Z]+)\.([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, source: keyof FrontendCustomizationContext, path: string) => {
    const value = readBindingValue({ source, path }, context);
    return value === null || value === undefined || value === '' ? '-' : String(value);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberFormat(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);
}

function currencyFormat(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
}

function relativeTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
