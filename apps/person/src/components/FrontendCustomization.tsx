import type {
  FrontendCustomizationBinding,
  FrontendCustomizationBlock,
  FrontendCustomizationCondition,
  FrontendCustomizationRuntimeDto,
  FrontendCustomizationSlot,
} from '@factory-engine-pro/contracts';

export type FrontendCustomizationContext = Partial<Record<'summary' | 'dailyCall' | 'priorityCustomer' | 'taskBrief' | 'customerDetail', unknown>>;

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
