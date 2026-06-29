import { useEffect, useState, type CSSProperties } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, GripVertical } from 'lucide-react';
import { fetchDailyOperations, fetchTaskBrief, friendlyError, reorderDailyCalls, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem, DailyOperationRange, DailyOperations, SegmentDailyGroup } from '../types';
import { Card } from '../components/Card';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';
import { TransferTaskModal } from '../components/TransferTaskModal';

const QK_BASE = ['person', 'daily-operations'] as const;

export function CallQueueView({ range: initialRange = 'last7d', archive = false }: { range?: DailyOperationRange; archive?: boolean } = {}) {
  const qc = useQueryClient();
  const [range, setRange] = useState<DailyOperationRange>(initialRange);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkCard, setDeepLinkCard] = useState<CardData | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [transferCard, setTransferCard] = useState<CardData | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const queryKey = [...QK_BASE, range] as const;
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchDailyOperations(range) });

  const daily = data?.dailyCallList ?? [];
  const priority = data?.priorityKanban ?? [];
  const pinned = data?.pinBoard ?? [];
  const groups = data?.segmentGroups ?? [];

  const reorderDaily = useMutation<unknown, Error, { segmentId?: string; range: DailyOperationRange; orderedItemIds: string[] }, { previous?: DailyOperations }>({
    mutationFn: reorderDailyCalls,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<DailyOperations>(queryKey);
      if (previous) qc.setQueryData<DailyOperations>(queryKey, reorderDailyData(previous, input.segmentId, input.orderedItemIds));
      return { previous };
    },
    onError: (_mutationError, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK_BASE });
    },
  });

  const customerPin = useMutation<unknown, Error, string>({
    mutationFn: (customerId: string) => toggleCustomerPin(customerId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK_BASE });
    },
  });

  const taskPin = useMutation<unknown, Error, CardData>({
    mutationFn: (card: CardData) => {
      if (card.kind === 'customer' && card.customerId) return toggleCustomerPin(card.customerId);
      return togglePin(card.id);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK_BASE });
    },
  });

  useEffect(() => {
    setRange(initialRange);
  }, [initialRange]);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId) return;
    let cancelled = false;
    setSelectedId(taskId);
    fetchTaskBrief(taskId)
      .then((detail) => {
        if (!cancelled) {
          setDeepLinkCard(detail.card);
          setDeepLinkError(null);
        }
      })
      .catch((taskError: unknown) => {
        if (!cancelled) setDeepLinkError(friendlyError(taskError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCard = daily.find((card) => card.id === selectedId)
    ?? pinned.find((card) => card.id === selectedId)
    ?? (deepLinkCard?.id === selectedId ? deepLinkCard : null);
  const summary = data?.summary;
  const empty = !isLoading && (archive ? daily.length === 0 : daily.length === 0 && priority.length === 0 && pinned.length === 0);
  const closeTaskModal = () => {
    setSelectedId(null);
    setDeepLinkCard(null);
    setDeepLinkError(null);
    if (window.location.search.includes('taskId=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <div className="queue-wrap">
      <div className="kpis">
        <div className="kpi"><div className="label">{archive ? 'Archived calls' : 'Daily calls'}</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">{archive ? 'older than 7 days' : range === 'today' ? 'today only' : 'last 7 days AI workflow'}</div></div>
        {!archive && <div className="kpi"><div className="label">Priority customers</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">assigned segments</div></div>}
        {!archive && <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>}
        {!archive && <div className="kpi"><div className="label">U80+</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">same formula</div></div>}
        <div className="kpi"><div className="label">Axes</div><div className="val">{summary?.visibleAxes.length ?? 0}</div><div className="sub">{summary?.visibleAxes.join(', ') || 'none'}</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle={archive ? 'No archived daily calls' : 'No call work assigned yet'}
        emptyBody={archive ? 'AI workflow tasks older than 7 days will appear here after they age out of the Daily call list.' : 'Workflow tasks from recent calls and assigned Shopify segment customers will appear here.'}
      >
        <div className={`ops-grid${archive ? ' archive' : ''}`}>
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>{archive ? 'Daily call list archive' : 'Daily call list'}</h2>
                <p>{archive ? 'Workflow tasks older than 7 days from live call analysis.' : 'AI workflow tasks from live call analysis, grouped by day.'}</p>
              </div>
              <div className="ops-head-actions">
                {!archive && (
                  <div className="daily-range-toggle" aria-label="Daily call list range">
                    <button type="button" className={range === 'last7d' ? 'active' : ''} aria-pressed={range === 'last7d'} onClick={() => setRange('last7d')}>Last 7 days</button>
                    <button type="button" className={range === 'today' ? 'active' : ''} aria-pressed={range === 'today'} onClick={() => setRange('today')}>Today</button>
                  </div>
                )}
                <span className="ops-count">{daily.length} tasks</span>
              </div>
            </div>
            {reorderDaily.error ? <div className="ops-inline-error">{friendlyError(reorderDaily.error)}</div> : null}
            <DailyWorkflowList
              cards={daily}
              emptyLabel={archive ? 'No workflow tasks older than 7 days.' : range === 'today' ? 'No workflow tasks from today.' : 'No workflow tasks from the last 7 days.'}
              reorderDisabled={reorderDaily.isPending}
              onReorder={(orderedItemIds) => reorderDaily.mutate({ range, orderedItemIds })}
              onTogglePin={(card) => taskPin.mutate(card)}
              onOpen={setSelectedId}
              onTransfer={setTransferCard}
            />
          </section>

          {!archive && <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Priority kanban</h2>
                <p>Assigned Shopify segments grouped by segment owner scope.</p>
              </div>
              <span className="ops-count">{groups.length} segments</span>
            </div>
            <div className="segment-groups">
              {deepLinkError ? <div className="ops-empty">{deepLinkError}</div> : null}
              {groups.length === 0 ? (
                <div className="ops-empty">No Shopify segment ownership is assigned to this workspace.</div>
              ) : groups.map((group) => (
                <PrioritySegmentGroup
                  key={group.segmentId}
                  group={group}
                  collapsed={Boolean(collapsedGroups[group.segmentId])}
                  onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.segmentId]: !current[group.segmentId] }))}
                  onTogglePin={(item) => customerPin.mutate(item.customerId)}
                  pinDisabled={customerPin.isPending}
                />
              ))}
            </div>
          </section>}

          {!archive && <div className="ops-panel pin-board-panel">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>}
        </div>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} onClose={closeTaskModal} />}
      {transferCard && (
        <TransferTaskModal
          card={transferCard}
          onClose={() => setTransferCard(null)}
          onTransferred={() => {
            setTransferCard(null);
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: QK_BASE });
          }}
        />
      )}
    </div>
  );
}

function DailyWorkflowList({
  cards,
  emptyLabel,
  reorderDisabled,
  onReorder,
  onTogglePin,
  onOpen,
  onTransfer,
}: {
  cards: CardData[];
  emptyLabel: string;
  reorderDisabled: boolean;
  onReorder: (orderedItemIds: string[]) => void;
  onTogglePin: (card: CardData) => void;
  onOpen: (id: string) => void;
  onTransfer: (card: CardData) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const itemIds = cards.map((card) => card.id);
  const rows = dailyListRows(cards);
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const oldIndex = itemIds.indexOf(activeId);
    const newIndex = itemIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(itemIds, oldIndex, newIndex));
  };
  if (cards.length === 0) return <div className="ops-empty">{emptyLabel}</div>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="daily-task-list">
          {rows.map((row) => row.kind === 'separator' ? (
            <div key={row.key} className="daily-date-separator">{row.label}</div>
          ) : (
            <SortableDailyTaskCard
              key={row.card.id}
              card={row.card}
              disabled={reorderDisabled}
              onTogglePin={() => onTogglePin(row.card)}
              onOpen={onOpen}
              onTransfer={onTransfer}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableDailyTaskCard({
  card,
  disabled,
  onTogglePin,
  onOpen,
  onTransfer,
}: {
  card: CardData;
  disabled: boolean;
  onTogglePin: () => void;
  onOpen: (id: string) => void;
  onTransfer: (card: CardData) => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className={`daily-task-card${isDragging ? ' dragging' : ''}`} data-daily-task-id={card.id}>
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="daily-drag-handle"
        aria-label={`Reorder ${card.title}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>
      <div className="daily-task-main">
        <DailyTaskBadges card={card} />
        <Card card={card} onTogglePin={onTogglePin} onOpen={onOpen} onTransfer={onTransfer} />
      </div>
    </div>
  );
}

function DailyTaskBadges({ card }: { card: CardData }) {
  const tags = (card.psychTags ?? []).filter(Boolean).slice(0, 3);
  if (!card.callIntent && tags.length === 0) return null;
  return (
    <div className="daily-task-badges" aria-label="AI call analysis">
      {card.callIntent ? <span className="ai-badge">intent: {card.callIntent}</span> : null}
      {tags.map((tag) => <span key={tag} className="ai-badge">tag: {tag}</span>)}
    </div>
  );
}

function PrioritySegmentGroup({
  group,
  collapsed,
  onToggle,
  onTogglePin,
  pinDisabled,
}: {
  group: SegmentDailyGroup;
  collapsed: boolean;
  onToggle: () => void;
  onTogglePin: (item: DailyCallItem) => void;
  pinDisabled: boolean;
}) {
  const cap = group.dailyCap ?? group.totalCustomers;
  return (
    <section className="segment-group" aria-label={group.segmentName}>
      <button type="button" className={`segment-group-toggle${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className="chevron" />
        <span className="segment-group-dot" style={{ background: group.segmentColor }} />
        <span className="segment-group-title">{group.segmentName}</span>
        <span className="segment-group-meta">{group.items.length}/{cap}</span>
      </button>
      {!collapsed && (
        <div className="segment-group-items">
          {group.items.length === 0 ? (
            <div className="segment-group-empty">No customers in this assigned segment.</div>
          ) : group.items.map((item) => (
            <SegmentCustomerCard
              key={item.id}
              item={item}
              onTogglePin={() => onTogglePin(item)}
              disabled={pinDisabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SegmentCustomerCard({
  item,
  onTogglePin,
  disabled,
}: {
  item: DailyCallItem;
  onTogglePin: () => void;
  disabled: boolean;
}) {
  const orderSummary = `${item.ordersCount} orders | $${Math.round(item.totalSpent).toLocaleString()}`;

  return (
    <article className="daily-card" data-priority-customer-id={item.id}>
      <div className="daily-card-row">
        <div className="daily-title-wrap">
          <div className="daily-title">{item.customerName}</div>
        </div>
        <span className="priority p7">U{item.urgencyScore}</span>
      </div>
      <div className="daily-meta">{item.reason}</div>
      <div className="daily-card-row daily-foot">
        <span className="chip" style={{ background: item.segment.color }}>{item.segment.name}</span>
        <span>{orderSummary}</span>
        <button
          type="button"
          className={`pin-btn${item.pinned ? ' pinned' : ''}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onTogglePin}
          disabled={disabled}
        >
          {item.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </article>
  );
}

type DailyListRow =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'card'; card: CardData };

function dailyListRows(cards: CardData[]): DailyListRow[] {
  const rows: DailyListRow[] = [];
  let currentKey = '';
  for (const card of cards) {
    const key = istanbulDateKey(card.createdAt);
    if (key !== currentKey) {
      currentKey = key;
      rows.push({ kind: 'separator', key: `date-${key}`, label: dailyDateLabel(card.createdAt, key) });
    }
    rows.push({ kind: 'card', card });
  }
  return rows;
}

function istanbulDateKey(value?: string) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dailyDateLabel(value: string | undefined, key: string) {
  if (key === 'unknown' || !value) return 'Unknown date';
  const todayKey = istanbulDateKey(new Date().toISOString());
  const yesterdayKey = istanbulDateKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function reorderDailyData(data: DailyOperations, segmentId: string | undefined, orderedItemIds: string[]): DailyOperations {
  const ordered = new Set(orderedItemIds);
  const applyCardOrder = (items: CardData[]) => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const requested = orderedItemIds.map((id) => byId.get(id)).filter((item): item is CardData => Boolean(item));
    const rest = items.filter((item) => !ordered.has(item.id));
    return [...requested, ...rest];
  };
  const applySegmentOrder = (items: DailyCallItem[]) => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const requested = orderedItemIds.map((id) => byId.get(id)).filter((item): item is DailyCallItem => Boolean(item));
    const rest = items.filter((item) => !ordered.has(item.id));
    return [...requested, ...rest].map((item, index) => ({ ...item, customOrder: ordered.has(item.id) ? index : item.customOrder }));
  };
  return {
    ...data,
    dailyCallList: segmentId ? data.dailyCallList : applyCardOrder(data.dailyCallList),
    segmentGroups: segmentId ? data.segmentGroups.map((group) => group.segmentId === segmentId ? { ...group, items: applySegmentOrder(group.items) } : group) : data.segmentGroups,
  };
}
