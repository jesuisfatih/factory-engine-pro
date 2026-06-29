import { useEffect, useState, type CSSProperties } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, GripVertical } from 'lucide-react';
import { fetchDailyOperations, fetchTaskBrief, friendlyError, reorderDailyCalls, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem, DailyOperations, SegmentDailyGroup } from '../types';
import { Card } from '../components/Card';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';
import { TransferTaskModal } from '../components/TransferTaskModal';

const QK = ['person', 'daily-operations'] as const;

export function CallQueueView() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkCard, setDeepLinkCard] = useState<CardData | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [transferCard, setTransferCard] = useState<CardData | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { data, isLoading, error } = useQuery({ queryKey: QK, queryFn: fetchDailyOperations });

  const daily = data?.dailyCallList ?? [];
  const priority = data?.priorityKanban ?? [];
  const pinned = data?.pinBoard ?? [];
  const groups = data?.segmentGroups ?? [];

  const reorderDaily = useMutation<unknown, Error, { segmentId?: string; orderedItemIds: string[] }, { previous?: DailyOperations }>({
    mutationFn: reorderDailyCalls,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: QK });
      const previous = qc.getQueryData<DailyOperations>(QK);
      if (previous) qc.setQueryData<DailyOperations>(QK, reorderDailyData(previous, input.segmentId, input.orderedItemIds));
      return { previous };
    },
    onError: (_mutationError, _input, context) => {
      if (context?.previous) qc.setQueryData(QK, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const customerPin = useMutation<unknown, Error, string>({
    mutationFn: (customerId: string) => toggleCustomerPin(customerId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const taskPin = useMutation<unknown, Error, CardData>({
    mutationFn: (card: CardData) => {
      if (card.kind === 'customer' && card.customerId) return toggleCustomerPin(card.customerId);
      return togglePin(card.id);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

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
  const empty = !isLoading && daily.length === 0 && priority.length === 0 && pinned.length === 0;
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
        <div className="kpi"><div className="label">Daily calls</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">today&apos;s AI workflow</div></div>
        <div className="kpi"><div className="label">Priority customers</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">assigned segments</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>
        <div className="kpi"><div className="label">U80+</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">same formula</div></div>
        <div className="kpi"><div className="label">Axes</div><div className="val">{summary?.visibleAxes.length ?? 0}</div><div className="sub">{summary?.visibleAxes.join(', ') || 'none'}</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle="No call work assigned yet"
        emptyBody="Workflow tasks from today's calls and assigned Shopify segment customers will appear here."
      >
        <div className="ops-grid">
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Daily call list</h2>
                <p>Today&apos;s workflow tasks from live call analysis.</p>
              </div>
              <span className="ops-count">{daily.length} tasks</span>
            </div>
            {reorderDaily.error ? <div className="ops-inline-error">{friendlyError(reorderDaily.error)}</div> : null}
            <DailyWorkflowList
              cards={daily}
              reorderDisabled={reorderDaily.isPending}
              onReorder={(orderedItemIds) => reorderDaily.mutate({ orderedItemIds })}
              onTogglePin={(card) => taskPin.mutate(card)}
              onOpen={setSelectedId}
              onTransfer={setTransferCard}
            />
          </section>

          <section className="ops-panel">
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
          </section>

          <div className="ops-panel pin-board-panel">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>
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
            qc.invalidateQueries({ queryKey: QK });
          }}
        />
      )}
    </div>
  );
}

function DailyWorkflowList({
  cards,
  reorderDisabled,
  onReorder,
  onTogglePin,
  onOpen,
  onTransfer,
}: {
  cards: CardData[];
  reorderDisabled: boolean;
  onReorder: (orderedItemIds: string[]) => void;
  onTogglePin: (card: CardData) => void;
  onOpen: (id: string) => void;
  onTransfer: (card: CardData) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const itemIds = cards.map((card) => card.id);
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const oldIndex = itemIds.indexOf(activeId);
    const newIndex = itemIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(itemIds, oldIndex, newIndex));
  };
  if (cards.length === 0) return <div className="ops-empty">No workflow tasks from today&apos;s calls.</div>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="daily-task-list">
          {cards.map((card) => (
            <SortableDailyTaskCard
              key={card.id}
              card={card}
              disabled={reorderDisabled}
              onTogglePin={() => onTogglePin(card)}
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
      <Card card={card} onTogglePin={onTogglePin} onOpen={onOpen} onTransfer={onTransfer} />
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
