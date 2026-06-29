import { useEffect, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { ChevronDown, GripVertical, Phone, StickyNote, X } from 'lucide-react';
import { archiveDailyCall, fetchCustomerDetail, fetchDailyOperations, fetchTaskBrief, friendlyError, reorderDailyCalls, saveCustomerNote, toggleCustomerPin, togglePin } from '../api/live';
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
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [noteCustomer, setNoteCustomer] = useState<DailyCallItem | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const queryKey = [...QK_BASE, range] as const;
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => fetchDailyOperations(range) });
  const customerDetailQuery = useQuery({
    queryKey: ['person', 'customer-detail', detailCustomerId],
    queryFn: () => fetchCustomerDetail(detailCustomerId ?? ''),
    enabled: Boolean(detailCustomerId),
  });

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

  const archiveTask = useMutation({
    mutationFn: (card: CardData) => archiveDailyCall(card.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_BASE });
    },
  });

  const customerNote = useMutation({
    mutationFn: (input: { customerId: string; body: string }) => saveCustomerNote(input.customerId, { body: input.body }),
    onSuccess: (detail, input) => {
      setNoteCustomer(null);
      setNoteBody('');
      setDetailCustomerId(input.customerId);
      qc.setQueryData(['person', 'customer-detail', input.customerId], detail);
      qc.invalidateQueries({ queryKey: ['person', 'notes'] });
      qc.invalidateQueries({ queryKey: ['person', 'customers'] });
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
        <div className="kpi"><div className="label">{archive ? 'Archived calls' : 'Daily calls'}</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">{archive ? 'older than 7 days or manually archived' : range === 'today' ? 'today only' : 'last 7 days call analysis'}</div></div>
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
        emptyBody={archive ? 'Call-analysis tasks older than 7 days, or tasks you archived manually, will appear here.' : 'Recent call tasks and assigned Shopify segment customers will appear here.'}
      >
        <div className={`ops-grid${archive ? ' archive' : ''}`}>
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>{archive ? 'Daily call list archive' : 'Daily call list'}</h2>
                <p>{archive ? 'Archived call-analysis tasks for this staff member.' : 'Live call-analysis tasks grouped by day.'}</p>
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
            {archiveTask.error ? <div className="ops-inline-error">{friendlyError(archiveTask.error)}</div> : null}
            <DailyWorkflowList
              cards={daily}
              emptyLabel={archive ? 'No archived call-analysis tasks.' : range === 'today' ? 'No call-analysis tasks from today.' : 'No call-analysis tasks from the last 7 days.'}
              reorderDisabled={reorderDaily.isPending}
              onReorder={(orderedItemIds) => reorderDaily.mutate({ range, orderedItemIds })}
              onTogglePin={(card) => taskPin.mutate(card)}
              onArchive={(card) => archiveTask.mutate(card)}
              onOpen={setSelectedId}
              onTransfer={setTransferCard}
            />
          </section>

          {!archive && <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Priority kanban</h2>
                <p>Assigned Shopify segment customers grouped by owner scope.</p>
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
                  onOpenCustomer={(item) => setDetailCustomerId(item.customerId)}
                  onAddNote={(item) => setNoteCustomer(item)}
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
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={customerDetailQuery.data}
        isLoading={customerDetailQuery.isLoading}
        error={customerDetailQuery.error ? friendlyError(customerDetailQuery.error) : null}
        onRetry={() => customerDetailQuery.refetch()}
        onClose={() => setDetailCustomerId(null)}
      />
      {noteCustomer && (
        <CustomerNoteModal
          customer={noteCustomer}
          body={noteBody}
          isSaving={customerNote.isPending}
          error={customerNote.error ? friendlyError(customerNote.error) : null}
          onBodyChange={setNoteBody}
          onClose={() => {
            setNoteCustomer(null);
            setNoteBody('');
          }}
          onSubmit={() => {
            if (!noteCustomer || !noteBody.trim()) return;
            customerNote.mutate({ customerId: noteCustomer.customerId, body: noteBody });
          }}
        />
      )}
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
  onArchive,
  onOpen,
  onTransfer,
}: {
  cards: CardData[];
  emptyLabel: string;
  reorderDisabled: boolean;
  onReorder: (orderedItemIds: string[]) => void;
  onTogglePin: (card: CardData) => void;
  onArchive: (card: CardData) => void;
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
              onArchive={() => onArchive(row.card)}
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
  onArchive,
  onOpen,
  onTransfer,
}: {
  card: CardData;
  disabled: boolean;
  onTogglePin: () => void;
  onArchive: () => void;
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
        <Card card={card} onTogglePin={onTogglePin} onArchive={onArchive} onOpen={onOpen} onTransfer={onTransfer} />
      </div>
    </div>
  );
}

function DailyTaskBadges({ card }: { card: CardData }) {
  const tags = (card.psychTags ?? []).filter(Boolean).slice(0, 3);
  if (!card.callIntent && tags.length === 0) return null;
  return (
    <div className="daily-task-badges" aria-label="Call analysis">
      {card.callIntent ? <span className="insight-badge">intent: {card.callIntent}</span> : null}
      {tags.map((tag) => <span key={tag} className="insight-badge">tag: {tag}</span>)}
    </div>
  );
}

function PrioritySegmentGroup({
  group,
  collapsed,
  onToggle,
  onTogglePin,
  onOpenCustomer,
  onAddNote,
  pinDisabled,
}: {
  group: SegmentDailyGroup;
  collapsed: boolean;
  onToggle: () => void;
  onTogglePin: (item: DailyCallItem) => void;
  onOpenCustomer: (item: DailyCallItem) => void;
  onAddNote: (item: DailyCallItem) => void;
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
              onOpen={() => onOpenCustomer(item)}
              onAddNote={() => onAddNote(item)}
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
  onOpen,
  onAddNote,
  disabled,
}: {
  item: DailyCallItem;
  onTogglePin: () => void;
  onOpen: () => void;
  onAddNote: () => void;
  disabled: boolean;
}) {
  const orderSummary = `${item.ordersCount} orders | $${Math.round(item.totalSpent).toLocaleString()}`;
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      className="daily-card segment-customer-card"
      data-priority-customer-id={item.id}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="daily-card-row segment-customer-top">
        <div className="daily-title-wrap segment-customer-title">
          <div className="daily-title">{item.customerName}</div>
          <div className="segment-customer-contact">{item.phone || item.email || 'No phone on file'}</div>
        </div>
        <span className="priority p7">U{item.urgencyScore}</span>
      </div>
      <div className="daily-meta">{item.reason}</div>
      <div className="segment-customer-foot">
        <span className="chip" style={{ background: item.segment.color }}>{item.segment.name}</span>
        <span className="segment-customer-orders">{orderSummary}</span>
        <div className="segment-customer-actions">
          <a
            className={`quick-action${item.phone ? '' : ' disabled'}`}
            href={item.phone ? `tel:${item.phone}` : undefined}
            aria-disabled={!item.phone}
            title={item.phone ? `Call ${item.phone}` : 'No phone on file'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              if (!item.phone) event.preventDefault();
              event.stopPropagation();
            }}
          >
            <Phone size={12} />
            <span>Call</span>
          </a>
          <button
            type="button"
            className="quick-action"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onAddNote();
            }}
          >
            <StickyNote size={12} />
            <span>Note</span>
          </button>
          <button
            type="button"
            className={`pin-btn${item.pinned ? ' pinned' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            disabled={disabled}
          >
            {item.pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>
      </div>
    </article>
  );
}

function CustomerNoteModal({
  customer,
  body,
  isSaving,
  error,
  onBodyChange,
  onClose,
  onSubmit,
}: {
  customer: DailyCallItem;
  body: string;
  isSaving: boolean;
  error: string | null;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || isSaving) return;
    onSubmit();
  };
  return (
    <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-labelledby="customer-note-title">
      <form className="modal-card customer-note-modal" onSubmit={submit}>
        <header className="modal-head">
          <div>
            <div className="brief-eyebrow">
              <span className="chip" style={{ background: customer.segment.color }}>{customer.segment.name}</span>
            </div>
            <h2 id="customer-note-title">Customer note</h2>
            <div className="brief-identity">
              <span>{customer.customerName}</span>
              {customer.phone ? <span><Phone size={11} /> {customer.phone}</span> : null}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body customer-note-body">
          <label className="customer-note-field">
            <span>Note</span>
            <textarea
              className="brief-edit"
              rows={6}
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              placeholder="Write the customer-specific note..."
              autoFocus
            />
          </label>
          {error ? <div className="ops-inline-error">{error}</div> : null}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!body.trim() || isSaving}>
            <StickyNote size={13} /> {isSaving ? 'Saving' : 'Save note'}
          </button>
        </footer>
      </form>
    </div>
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
