import { useEffect, useState, type CSSProperties, type HTMLAttributes, type Ref } from 'react';
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

  const reorderDaily = useMutation<unknown, Error, { segmentId: string; orderedItemIds: string[] }, { previous?: DailyOperations }>({
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

  const selectedCard = priority.find((card) => card.id === selectedId) ?? (deepLinkCard?.id === selectedId ? deepLinkCard : null);
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
        <div className="kpi"><div className="label">Daily calls</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">segment customers</div></div>
        <div className="kpi"><div className="label">Priority tasks</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">urgency desc</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>
        <div className="kpi"><div className="label">U80+</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">same formula</div></div>
        <div className="kpi"><div className="label">Axes</div><div className="val">{summary?.visibleAxes.length ?? 0}</div><div className="sub">{summary?.visibleAxes.join(', ') || 'none'}</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle="No segment-owned work yet"
        emptyBody="Assign live Shopify-backed segment ownership to make the daily call groups appear here."
      >
        <div className="ops-grid">
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Daily call list</h2>
                <p>Segment-driven customers, sorted by the urgency formula.</p>
              </div>
              <span className="ops-count">{groups.length} groups</span>
            </div>
            {reorderDaily.error ? <div className="ops-inline-error">{friendlyError(reorderDaily.error)}</div> : null}
            <div className="segment-groups">
              {groups.length === 0 ? (
                <div className="ops-empty">No segment groups assigned to this workspace.</div>
              ) : groups.map((group) => (
                <SegmentGroup
                  key={group.segmentId}
                  group={group}
                  collapsed={Boolean(collapsedGroups[group.segmentId])}
                  onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.segmentId]: !current[group.segmentId] }))}
                  onTogglePin={(item) => customerPin.mutate(item.customerId)}
                  onReorder={(segmentId, orderedItemIds) => reorderDaily.mutate({ segmentId, orderedItemIds })}
                  pinDisabled={customerPin.isPending}
                  reorderDisabled={reorderDaily.isPending}
                />
              ))}
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Priority kanban</h2>
                <p>Rule-engine tasks, axis-scoped and urgency-desc.</p>
              </div>
            </div>
            <div className="ops-list">
              {deepLinkError ? <div className="ops-empty">{deepLinkError}</div> : null}
              {priority.length === 0 ? (
                <div className="ops-empty">No priority tasks in your axis scope.</div>
              ) : priority.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onTogglePin={() => taskPin.mutate(card)}
                  onOpen={setSelectedId}
                  onTransfer={setTransferCard}
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

function SegmentGroup({
  group,
  collapsed,
  onToggle,
  onTogglePin,
  onReorder,
  pinDisabled,
  reorderDisabled,
}: {
  group: SegmentDailyGroup;
  collapsed: boolean;
  onToggle: () => void;
  onTogglePin: (item: DailyCallItem) => void;
  onReorder: (segmentId: string, orderedItemIds: string[]) => void;
  pinDisabled: boolean;
  reorderDisabled: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const cap = group.dailyCap ?? group.totalCustomers;
  const itemIds = group.items.map((item) => item.id);
  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const oldIndex = itemIds.indexOf(activeId);
    const newIndex = itemIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(group.segmentId, arrayMove(itemIds, oldIndex, newIndex));
  };
  return (
    <section className="segment-group" aria-label={group.segmentName}>
      <button type="button" className={`segment-group-toggle${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className="chevron" />
        <span className="segment-group-dot" style={{ background: group.segmentColor }} />
        <span className="segment-group-title">{group.segmentName}</span>
        <span className="segment-group-meta">{group.items.length}/{cap}</span>
      </button>
      {!collapsed && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <div className="segment-group-items">
          {group.items.length === 0 ? (
            <div className="segment-group-empty">No customers in this segment group.</div>
          ) : group.items.map((item) => (
            <SortableDailyCustomerCard
              key={item.id}
              item={item}
              onTogglePin={() => onTogglePin(item)}
              disabled={pinDisabled}
              dragDisabled={reorderDisabled}
            />
          ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

function SortableDailyCustomerCard({
  item,
  onTogglePin,
  disabled,
  dragDisabled,
}: {
  item: DailyCallItem;
  onTogglePin: () => void;
  disabled: boolean;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: dragDisabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <DailyCustomerCard
      nodeRef={setNodeRef}
      style={style}
      dragging={isDragging}
      item={item}
      onTogglePin={onTogglePin}
      disabled={disabled}
      dragDisabled={dragDisabled}
      dragHandleRef={setActivatorNodeRef}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

function DailyCustomerCard({
  nodeRef,
  style,
  dragging,
  item,
  onTogglePin,
  disabled,
  dragDisabled,
  dragHandleRef,
  dragHandleProps,
}: {
  nodeRef?: Ref<HTMLElement>;
  style?: CSSProperties;
  dragging?: boolean;
  item: DailyCallItem;
  onTogglePin: () => void;
  disabled: boolean;
  dragDisabled: boolean;
  dragHandleRef?: Ref<HTMLButtonElement>;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  const orderSummary = `${item.ordersCount} orders | $${Math.round(item.totalSpent).toLocaleString()}`;

  return (
    <article ref={nodeRef} style={style} className={`daily-card${dragging ? ' dragging' : ''}`} data-daily-card-id={item.id}>
      <div className="daily-card-row">
        <div className="daily-title-wrap">
          <button
            ref={dragHandleRef}
            type="button"
            className="daily-drag-handle"
            aria-label={`Reorder ${item.customerName}`}
            disabled={dragDisabled}
            {...dragHandleProps}
          >
            <GripVertical size={13} />
          </button>
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

function reorderDailyData(data: DailyOperations, segmentId: string, orderedItemIds: string[]): DailyOperations {
  const ordered = new Set(orderedItemIds);
  const applyOrder = (items: DailyCallItem[]) => {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const requested = orderedItemIds.map((id) => byId.get(id)).filter((item): item is DailyCallItem => Boolean(item));
    const rest = items.filter((item) => !ordered.has(item.id));
    return [...requested, ...rest].map((item, index) => ({ ...item, customOrder: ordered.has(item.id) ? index : item.customOrder }));
  };
  return {
    ...data,
    dailyCallList: applyOrder(data.dailyCallList),
    segmentGroups: data.segmentGroups.map((group) => group.segmentId === segmentId ? { ...group, items: applyOrder(group.items) } : group),
  };
}
