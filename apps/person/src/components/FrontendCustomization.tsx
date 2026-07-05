import type {
  FrontendCustomizationBinding,
  FrontendCustomizationBlock,
  FrontendCustomizationCondition,
  FrontendCustomizationContentBlock,
  FrontendCustomizationElementField,
  FrontendCustomizationElementId,
  FrontendCustomizationElementOverride,
  FrontendCustomizationModalSection,
  FrontendCustomizationRuntimeDto,
  FrontendCustomizationSlot,
  FrontendCustomizationTone,
  FrontendNavigationNavId,
  FrontendNavigationOverride,
} from '@factory-engine-pro/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { personSafeText } from '../lib/personTerminology';
import type { NavItem } from '../types';

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
    .map((block) => ({ kind: 'block' as const, priority: block.priority, id: block.id, block })) ?? [];
  const contentBlocks = customization?.definition.contentBlocks
    ?.filter((block) => block.slot === slot && contentBlockVisible(block, context))
    .map((block) => ({ kind: 'content' as const, priority: block.priority, id: block.id, block })) ?? [];
  const items = [...blocks, ...contentBlocks].sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (items.length === 0) return null;
  return (
    <div className={`mcp-ui-slot mcp-ui-slot-${slot.replaceAll('.', '-')}${className ? ` ${className}` : ''}`}>
      {items.map((item) => item.kind === 'block'
        ? <FrontendCustomizationBlockView key={item.id} block={item.block} context={context} />
        : <FrontendCustomizationContentBlockView key={item.id} block={item.block} context={context} />)}
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
  return staffSafeUiText(override?.copyOverrides[key] ?? fallback);
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

export function frontendThemeClassName(customization: FrontendCustomizationRuntimeDto | null | undefined) {
  const overrides = customization?.definition.themeOverrides;
  if (!overrides) return '';
  const classes = ['mcp-theme'];
  if (overrides.spacing) classes.push(`mcp-theme-spacing-${overrides.spacing}`);
  if (overrides.density) classes.push(`mcp-theme-density-${overrides.density}`);
  if (overrides.fontWeight) classes.push(`mcp-theme-font-${overrides.fontWeight}`);
  if (overrides.radius) classes.push(`mcp-theme-radius-${overrides.radius}`);
  if (overrides.cardTone) classes.push(`mcp-theme-card-${overrides.cardTone}`);
  if (overrides.accent) classes.push(`mcp-theme-accent-${overrides.accent}`);
  return classes.length > 1 ? classes.join(' ') : '';
}

export function frontendThemeStyle(customization: FrontendCustomizationRuntimeDto | null | undefined): CSSProperties | undefined {
  const overrides = customization?.definition.themeOverrides;
  if (!overrides) return undefined;
  const style = {} as CSSProperties & Record<string, string>;
  if (overrides.spacing === 'compact') {
    style['--mcp-space'] = '8px';
  } else if (overrides.spacing === 'roomy') {
    style['--mcp-space'] = '16px';
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

export interface FrontendNavigationItem extends NavItem {
  order: number;
  badgeMode: 'count' | 'dot' | 'none';
  emphasis: 'high' | 'normal' | 'quiet';
  hidden: boolean;
  required: boolean;
}

export interface FrontendNavigationResult {
  items: FrontendNavigationItem[];
  defaultNavId: FrontendNavigationNavId | null;
}

export function frontendNavigation(
  customization: FrontendCustomizationRuntimeDto | null | undefined,
  navItems: NavItem[],
  context: FrontendCustomizationContext,
): FrontendNavigationResult {
  const initial = navItems.map((item, index): FrontendNavigationItem => ({
    ...item,
    label: staffSafeUiText(item.label),
    group: item.group ? staffSafeUiText(item.group) : item.group,
    order: index * 10,
    badgeMode: item.id === 'queue' || item.id === 'customers' || item.id === 'notifications' ? 'count' : 'none',
    emphasis: item.id === 'queue' ? 'high' : 'normal',
    hidden: false,
    required: item.id === 'queue' || item.id === 'customers',
  }));
  const overrides = (customization?.definition.navigationOverrides ?? [])
    .filter((override) => override.target === 'sidebar' && navigationAudienceMatches(override, context))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (overrides.length === 0) return { items: initial, defaultNavId: null };

  const groupLabels = new Map<string, { label: string; order: number }>();
  let defaultNavId: FrontendNavigationNavId | null = null;
  for (const override of overrides) {
    for (const group of override.groups) groupLabels.set(group.id, { label: staffSafeUiText(group.label), order: group.order });
    if (override.defaultNavId) defaultNavId = override.defaultNavId;
    for (const itemOverride of override.items) {
      const index = initial.findIndex((item) => item.id === itemOverride.navId);
      if (index < 0) continue;
      const current = initial[index];
      const groupRef = itemOverride.group ? groupLabels.get(itemOverride.group) : null;
      initial[index] = {
        ...current,
        label: staffSafeUiText(itemOverride.label ?? current.label),
        group: staffSafeUiText(groupRef?.label ?? itemOverride.group ?? current.group),
        order: itemOverride.order ?? current.order,
        hidden: itemOverride.hidden,
        badgeMode: itemOverride.badgeMode ?? current.badgeMode,
        emphasis: itemOverride.emphasis ?? current.emphasis,
        required: itemOverride.required || current.required,
      };
    }
  }
  return {
    items: initial
      .filter((item) => !item.hidden)
      .sort((left, right) => groupOrder(left.group, groupLabels) - groupOrder(right.group, groupLabels) || left.order - right.order || left.label.localeCompare(right.label)),
    defaultNavId,
  };
}

function FrontendCustomizationBlockView({ block, context }: { block: FrontendCustomizationBlock; context: FrontendCustomizationContext }) {
  const rawValue = block.value ? formatBinding(block.value, context) : null;
  const value = rawValue ? staffSafeUiText(rawValue) : null;
  const body = staffSafeUiText(block.template ? renderTemplate(block.template, context) : block.text);
  const title = staffSafeUiText(block.title ? renderTemplate(block.title, context) : block.label);
  const label = staffSafeUiText(block.label);
  const tone = `tone-${block.tone}`;
  if (block.type === 'stat_tile') {
    return (
      <div className={`mcp-ui-block mcp-ui-stat ${tone}${block.compact ? ' compact' : ''}`}>
        <span>{label}</span>
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
        <span>{label}</span>
        <strong>{value ?? body ?? '-'}</strong>
      </div>
    );
  }
  if (block.type === 'checklist') {
    return (
      <div className={`mcp-ui-block mcp-ui-checklist ${tone}`}>
        <strong>{title}</strong>
        <ul>
          {block.items.map((item) => <li key={item}>{staffSafeUiText(renderTemplate(item, context))}</li>)}
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

function FrontendCustomizationContentBlockView({ block, context }: { block: FrontendCustomizationContentBlock; context: FrontendCustomizationContext }) {
  const content = staffSafeUiText(renderTemplate(block.content, context));
  const label = staffSafeUiText(block.label);
  const rendered = block.format === 'html'
    ? renderSafeHtml(content, block.allowedClasses)
    : renderSafeMarkdown(content, block.allowedClasses);
  return (
    <div className={`mcp-ui-block mcp-ui-content tone-${block.tone}${block.compact ? ' compact' : ''}`}>
      <span className="mcp-ui-content-label">{label}</span>
      <div className="mcp-ui-content-body">{rendered}</div>
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

function navigationAudienceMatches(override: FrontendNavigationOverride, context: FrontendCustomizationContext) {
  return audienceMatches({ ...override, elementId: 'daily.card', toneRule: 'none', copyOverrides: {}, requireScreenshotProof: true } as FrontendCustomizationElementOverride, context);
}

function groupOrder(group: string | undefined, groups: Map<string, { label: string; order: number }>) {
  if (!group) return 500;
  for (const candidate of groups.values()) {
    if (candidate.label === group) return candidate.order;
  }
  if (group === 'Workspace') return 10;
  if (group === 'Knowledge') return 20;
  if (group === 'Account') return 30;
  return 500;
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

function contentBlockVisible(block: FrontendCustomizationContentBlock, context: FrontendCustomizationContext) {
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
    return value === null || value === undefined || value === '' ? '-' : staffSafeUiText(String(value));
  });
}

function staffSafeUiText(value: string | null | undefined): string {
  return personSafeText(value);
}

const SAFE_HTML_TAGS = new Set(['p', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'br', 'span', 'div']);

function renderSafeHtml(html: string, allowedClasses: string[]): ReactNode {
  if (typeof window === 'undefined' || !('DOMParser' in window)) return htmlToPlainText(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map((node, index) => renderSafeNode(node, allowedClasses, `html-${index}`));
}

function renderSafeNode(node: ChildNode, allowedClasses: string[], key: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child, index) => renderSafeNode(child, allowedClasses, `${key}-${index}`));
  if (!SAFE_HTML_TAGS.has(tag)) return <span key={key}>{children}</span>;
  const className = safeClassName(element.getAttribute('class'), allowedClasses);
  if (tag === 'br') return <br key={key} />;
  if (tag === 'strong' || tag === 'b') return <strong key={key} className={className}>{children}</strong>;
  if (tag === 'em' || tag === 'i') return <em key={key} className={className}>{children}</em>;
  if (tag === 'ul') return <ul key={key} className={className}>{children}</ul>;
  if (tag === 'ol') return <ol key={key} className={className}>{children}</ol>;
  if (tag === 'li') return <li key={key} className={className}>{children}</li>;
  if (tag === 'div') return <div key={key} className={className}>{children}</div>;
  return <p key={key} className={className}>{children}</p>;
}

function renderSafeMarkdown(markdown: string, allowedClasses: string[]): ReactNode {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length === 0) return;
    nodes.push(<ul key={`list-${nodes.length}`} className={allowedClasses.includes('checklist') ? 'checklist' : undefined}>{listItems.map((item) => <li key={item}>{renderInlineMarkdown(item)}</li>)}</ul>);
    listItems = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      listItems.push(bullet[1]);
      continue;
    }
    flushList();
    nodes.push(<p key={`p-${nodes.length}`}>{renderInlineMarkdown(trimmed)}</p>);
  }
  flushList();
  return nodes;
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

function safeClassName(raw: string | null, allowedClasses: string[]) {
  if (!raw) return undefined;
  const allowed = new Set(allowedClasses);
  const classes = raw.split(/\s+/).filter((name) => allowed.has(name));
  return classes.length ? classes.join(' ') : undefined;
}

function htmlToPlainText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
