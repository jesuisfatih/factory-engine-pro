import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FrontendCustomizationRuntimeDto } from '@factory-engine-pro/contracts';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { ChevronDown, GripVertical, Loader2, Phone, RefreshCw, StickyNote, X } from 'lucide-react';
import { archiveDailyCall, dialAircall, fetchCustomerDetail, fetchDailyOperations, fetchTaskBrief, friendlyError, reorderDailyCalls, saveCustomerNote, syncPersonTasks, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem, DailyOperationRange, DailyOperations, SegmentDailyGroup } from '../types';
import { Card } from '../components/Card';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible, FrontendCustomizationSlotView } from '../components/FrontendCustomization';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';
import { TransferTaskModal } from '../components/TransferTaskModal';
import { personSafeText, staffActionLabel, staffBriefLine } from '../lib/personTerminology';

const QK_BASE = ['person', 'daily-operations'] as const;
type DailyFilter = 'all' | 'must_call' | 'payment_refund' | 'purchase_intent' | 'unmatched';

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
  const [dailyFilter, setDailyFilter] = useState<DailyFilter>('all');
  const [missedCollapsed, setMissedCollapsed] = useState(false);
  const [riskCollapsed, setRiskCollapsed] = useState(false);
  const queryKey = [...QK_BASE, range] as const;
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchDailyOperations(range),
    refetchInterval: archive ? false : 15000,
    refetchIntervalInBackground: false,
  });
  const customerDetailQuery = useQuery({
    queryKey: ['person', 'customer-detail', detailCustomerId],
    queryFn: () => fetchCustomerDetail(detailCustomerId ?? ''),
    enabled: Boolean(detailCustomerId),
  });

  const daily = data?.dailyCallList ?? [];
  const priority = data?.priorityKanban ?? [];
  const pinned = data?.pinBoard ?? [];
  const groups = data?.segmentGroups ?? [];
  const frontendCustomization = data?.frontendCustomization ?? null;
  const actionStats = useMemo(() => dailyActionStats(daily), [daily]);
  const filteredDaily = useMemo(() => filterDailyCards(daily, dailyFilter), [daily, dailyFilter]);
  const missedFollowUps = useMemo(() => daily.filter((card) => card.unreached || Boolean(card.missedNote)), [daily]);
  const atRiskCustomers = useMemo(
    () => groups.flatMap((group) => group.items.filter((item) => item.customerRisk !== 'none')),
    [groups],
  );

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
  const syncTasks = useMutation({
    mutationFn: syncPersonTasks,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_BASE });
      qc.invalidateQueries({ queryKey: ['person', 'summary'] });
    },
  });
  const dialCustomer = useMutation({
    mutationFn: dialAircall,
    onSuccess: (result) => {
      if (result.mode === 'tel_fallback') window.location.assign(result.telHref);
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
        <FrontendCustomizationSlotView customization={frontendCustomization} slot="kpi.before" context={{ summary }} />
        {!archive && <div className="kpi"><div className="label">Incoming calls</div><div className="val">{summary?.incomingCallsToday ?? 0}</div><div className="sub">today</div></div>}
        {!archive && <div className="kpi"><div className="label">Outbound calls</div><div className="val">{summary?.outboundCallsToday ?? 0}</div><div className="sub">today</div></div>}
        {!archive && <div className="kpi"><div className="label">Open requests</div><div className="val">{summary?.openRequestsCount ?? 0}</div><div className="sub">waiting</div></div>}
        <div className="kpi"><div className="label">{archive ? 'Archived calls' : 'Daily calls'}</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">{archive ? 'older than 7 days or manually archived' : range === 'today' ? 'today only' : 'last 7 days calls'}</div></div>
        {!archive && <div className="kpi"><div className="label">Priority customers</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">assigned segments</div></div>}
        {!archive && <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>}
        {!archive && <div className="kpi"><div className="label">High intent</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">needs fast follow-up</div></div>}
        <button type="button" className="kpi queue-sync-card" onClick={() => syncTasks.mutate()} disabled={syncTasks.isPending}>
          <div className="label">Sync</div>
          <div className="val">{syncTasks.isPending ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}</div>
          <div className="sub">{syncTasks.data ? `${syncTasks.data.backfill.ingested} calls updated` : 'pull latest calls'}</div>
        </button>
        <FrontendCustomizationSlotView customization={frontendCustomization} slot="kpi.after" context={{ summary }} />
      </div>
      {syncTasks.error ? <div className="ops-inline-error">{friendlyError(syncTasks.error)}</div> : null}
      {!archive && (
        <>
          <FrontendCustomizationSlotView customization={frontendCustomization} slot="focus.before" context={{ summary }} />
          <TodayFocusPanel
            summary={summary}
            actionStats={actionStats}
            activeFilter={dailyFilter}
            onFilter={setDailyFilter}
          />
          <FrontendCustomizationSlotView customization={frontendCustomization} slot="focus.after" context={{ summary }} />
        </>
      )}
      {!archive && (
        <div className="call-action-stats" aria-label="Daily call action summary">
          <button type="button" className={`call-action-stat stat-call${dailyFilter === 'must_call' ? ' active' : ''}`} onClick={() => setDailyFilter(dailyFilter === 'must_call' ? 'all' : 'must_call')}>
            <span>Must call</span>
            <strong>{actionStats.mustCall}</strong>
            <em>urgent or callback</em>
          </button>
          <button type="button" className={`call-action-stat stat-money${dailyFilter === 'payment_refund' ? ' active' : ''}`} onClick={() => setDailyFilter(dailyFilter === 'payment_refund' ? 'all' : 'payment_refund')}>
            <span>Payment/refund</span>
            <strong>{actionStats.paymentOrRefund}</strong>
            <em>needs careful wording</em>
          </button>
          <button type="button" className={`call-action-stat stat-purchase${dailyFilter === 'purchase_intent' ? ' active' : ''}`} onClick={() => setDailyFilter(dailyFilter === 'purchase_intent' ? 'all' : 'purchase_intent')}>
            <span>Purchase intent</span>
            <strong>{actionStats.purchaseIntent}</strong>
            <em>quote or order path</em>
          </button>
          <button type="button" className={`call-action-stat stat-match${dailyFilter === 'unmatched' ? ' active' : ''}`} onClick={() => setDailyFilter(dailyFilter === 'unmatched' ? 'all' : 'unmatched')}>
            <span>Unmatched callers</span>
            <strong>{actionStats.unmatched}</strong>
            <em>confirm before promise</em>
          </button>
        </div>
      )}
      {!archive && (missedFollowUps.length > 0 || atRiskCustomers.length > 0) ? (
        <div className="attention-grid">
          <AttentionPanel
            title="Missed work"
            count={summary?.missedFollowUpCount ?? missedFollowUps.length}
            description="Open follow-ups that need a human next step."
            collapsed={missedCollapsed}
            onToggle={() => setMissedCollapsed((value) => !value)}
          >
            <CompactTaskList cards={missedFollowUps.slice(0, 6)} onOpen={setSelectedId} />
          </AttentionPanel>
          <AttentionPanel
            title="At-risk customers"
            count={summary?.atRiskCustomerCount ?? atRiskCustomers.length}
            description="Assigned customers that need careful outreach."
            collapsed={riskCollapsed}
            onToggle={() => setRiskCollapsed((value) => !value)}
          >
            <AtRiskCustomerList
              items={atRiskCustomers.slice(0, 6)}
              onOpenCustomer={(item) => setDetailCustomerId(item.customerId)}
              onCallCustomer={(item) => {
                if (item.phone) dialCustomer.mutate({ phone: item.phone, customerId: item.customerId, source: 'priority_board' });
              }}
              callDisabled={dialCustomer.isPending}
            />
          </AttentionPanel>
        </div>
      ) : null}

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle={archive ? 'No archived daily calls' : 'No call work assigned yet'}
        emptyBody={archive ? 'Calls older than 7 days, or calls you archived manually, will appear here.' : 'Recent customer calls and assigned customer groups will appear here.'}
      >
        <div className={`ops-grid${archive ? ' archive' : ''}`}>
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>{archive ? 'Daily call list archive' : 'Daily call list'}</h2>
                <p>{archive ? 'Older customer call follow-ups for this staff member.' : 'Recent customer calls grouped by day.'}</p>
                <FrontendCustomizationSlotView customization={frontendCustomization} slot="daily.header" context={{ summary }} />
              </div>
              <div className="ops-head-actions">
                {!archive && (
                  <div className="daily-range-toggle" aria-label="Daily call list range">
                    <button type="button" className={range === 'last7d' ? 'active' : ''} aria-pressed={range === 'last7d'} onClick={() => setRange('last7d')}>Last 7 days</button>
                    <button type="button" className={range === 'today' ? 'active' : ''} aria-pressed={range === 'today'} onClick={() => setRange('today')}>Today</button>
                  </div>
                )}
                <span className="ops-count">{dailyFilter === 'all' ? daily.length : filteredDaily.length} follow-ups</span>
                {dailyFilter !== 'all' ? <button type="button" className="clear-filter" onClick={() => setDailyFilter('all')}>Clear filter</button> : null}
              </div>
            </div>
            {reorderDaily.error ? <div className="ops-inline-error">{friendlyError(reorderDaily.error)}</div> : null}
            {archiveTask.error ? <div className="ops-inline-error">{friendlyError(archiveTask.error)}</div> : null}
            <FrontendCustomizationSlotView customization={frontendCustomization} slot="daily.before_list" context={{ summary }} />
            <DailyWorkflowList
              cards={filteredDaily}
              customization={frontendCustomization}
              summary={summary}
              emptyLabel={archive ? 'No archived call tasks.' : dailyFilter !== 'all' ? 'No follow-ups match this focus.' : range === 'today' ? 'No call tasks from today.' : 'No call tasks from the last 7 days.'}
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
                <p>Assigned customer groups for purchase and follow-up focus.</p>
                <FrontendCustomizationSlotView customization={frontendCustomization} slot="priority.header" context={{ summary }} />
              </div>
              <span className="ops-count">{groups.length} segments</span>
            </div>
            <div className="segment-groups">
              {deepLinkError ? <div className="ops-empty">{deepLinkError}</div> : null}
              {groups.length === 0 ? (
                <div className="ops-empty">No customer group is assigned to this workspace.</div>
              ) : groups.map((group) => (
                <PrioritySegmentGroup
                  key={group.segmentId}
                  group={group}
                  customization={frontendCustomization}
                  summary={summary}
                  collapsed={Boolean(collapsedGroups[group.segmentId])}
                  onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.segmentId]: !current[group.segmentId] }))}
                  onTogglePin={(item) => customerPin.mutate(item.customerId)}
                  onOpenCustomer={(item) => setDetailCustomerId(item.customerId)}
                  onAddNote={(item) => setNoteCustomer(item)}
                  onCallCustomer={(item) => {
                    if (item.phone) dialCustomer.mutate({ phone: item.phone, customerId: item.customerId, source: 'priority_board' });
                  }}
                  pinDisabled={customerPin.isPending}
                  callDisabled={dialCustomer.isPending}
                />
              ))}
            </div>
          </section>}

          {!archive && <div className="ops-panel pin-board-panel">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>}
        </div>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} customization={frontendCustomization} summary={summary} onClose={closeTaskModal} />}
      <CustomerDetailPanel
        open={Boolean(detailCustomerId)}
        detail={customerDetailQuery.data}
        isLoading={customerDetailQuery.isLoading}
        error={customerDetailQuery.error ? friendlyError(customerDetailQuery.error) : null}
        onRetry={() => customerDetailQuery.refetch()}
        onClose={() => setDetailCustomerId(null)}
        onCallCustomer={(phone, customerId) => dialCustomer.mutate({ phone, customerId, source: 'customer_detail' })}
        isCallingCustomer={dialCustomer.isPending}
        callMessage={dialCustomer.data?.message ?? (dialCustomer.error ? friendlyError(dialCustomer.error) : null)}
        staffTerminology
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
  customization,
  summary,
  emptyLabel,
  reorderDisabled,
  onReorder,
  onTogglePin,
  onArchive,
  onOpen,
  onTransfer,
}: {
  cards: CardData[];
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
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
              customization={customization}
              summary={summary}
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
  customization,
  summary,
  disabled,
  onTogglePin,
  onArchive,
  onOpen,
  onTransfer,
}: {
  card: CardData;
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
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
        <Card card={card} customization={customization} summary={summary} onTogglePin={onTogglePin} onArchive={onArchive} onOpen={onOpen} onTransfer={onTransfer} />
        <FrontendCustomizationSlotView customization={customization} slot="daily.card.after_brief" context={{ dailyCall: card, summary }} />
        <FrontendCustomizationSlotView customization={customization} slot="daily.card.footer" context={{ dailyCall: card, summary }} />
      </div>
    </div>
  );
}

function TodayFocusPanel({
  summary,
  actionStats,
  activeFilter,
  onFilter,
}: {
  summary?: DailyOperations['summary'];
  actionStats: ReturnType<typeof dailyActionStats>;
  activeFilter: DailyFilter;
  onFilter: (filter: DailyFilter) => void;
}) {
  const focusItems: Array<{ label: string; value: number; body: string; tone: string; filter?: DailyFilter }> = [
    { label: 'Urgent follow-ups', value: actionStats.mustCall, body: 'Call these before routine outreach.', tone: 'warn', filter: 'must_call' },
    { label: 'Customer concerns', value: actionStats.paymentOrRefund, body: 'Use careful wording before promises.', tone: 'danger', filter: 'payment_refund' },
    { label: 'Missed work', value: summary?.missedFollowUpCount ?? 0, body: 'Open items waiting for a human next step.', tone: 'info' },
    { label: 'At-risk customers', value: summary?.atRiskCustomerCount ?? 0, body: 'Review context before outreach.', tone: 'danger' },
    { label: 'Open requests', value: summary?.openRequestsCount ?? 0, body: 'Customer requests waiting in your workspace.', tone: 'warn' },
    { label: 'Calls made today', value: summary?.callsMadeToday ?? 0, body: 'Outbound calls placed from this workspace.', tone: 'success' },
  ];
  return (
    <section className="today-focus-panel" aria-label="Today focus">
      <div className="today-focus-copy">
        <span>Today focus</span>
        <strong>Start with the highest consequence follow-ups.</strong>
        <p>Work customer concerns first, then missed follow-ups, then the assigned portfolio.</p>
      </div>
      <div className="today-focus-items">
        {focusItems.map((item) => {
          const active = item.filter && activeFilter === item.filter;
          return (
            <button
              key={item.label}
              type="button"
              className={`today-focus-item tone-${item.tone}${active ? ' active' : ''}`}
              onClick={() => item.filter ? onFilter(active ? 'all' : item.filter) : undefined}
              aria-disabled={!item.filter}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <em>{item.body}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AttentionPanel({
  title,
  count,
  description,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  description: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="attention-panel">
      <button type="button" className="attention-head" onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className={collapsed ? 'chevron collapsed' : 'chevron'} />
        <span>{title}</span>
        <strong>{count}</strong>
        <em>{description}</em>
      </button>
      {!collapsed ? <div className="attention-body">{children}</div> : null}
    </section>
  );
}

function CompactTaskList({ cards, onOpen }: { cards: CardData[]; onOpen: (id: string) => void }) {
  if (cards.length === 0) return <div className="attention-empty">No missed follow-ups right now.</div>;
  return (
    <div className="compact-work-list">
      {cards.map((card) => {
        const actionInput = cardActionInput(card);
        return (
          <button key={card.id} type="button" className="compact-work-row" onClick={() => onOpen(card.id)}>
            <span className="compact-work-title">{personSafeText(card.title)}</span>
            <strong>{staffActionLabel(actionInput)}</strong>
            <em>{card.missedNote ?? staffBriefLine(actionInput)}</em>
            <span className="compact-work-meta">U{card.urgencyScore} · {card.phone ?? 'No phone on file'}</span>
          </button>
        );
      })}
    </div>
  );
}

function AtRiskCustomerList({
  items,
  onOpenCustomer,
  onCallCustomer,
  callDisabled,
}: {
  items: DailyCallItem[];
  onOpenCustomer: (item: DailyCallItem) => void;
  onCallCustomer: (item: DailyCallItem) => void;
  callDisabled: boolean;
}) {
  if (items.length === 0) return <div className="attention-empty">No at-risk assigned customers right now.</div>;
  return (
    <div className="compact-work-list">
      {items.map((item) => (
        <article
          key={item.id}
          className="compact-work-row"
          tabIndex={0}
          role="button"
          onClick={() => onOpenCustomer(item)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onOpenCustomer(item);
          }}
        >
          <span className="compact-work-title">{item.customerName}</span>
          <strong>{riskLabel(item.customerRisk)}</strong>
          <em>{item.customerRiskNote ?? item.reason}</em>
          <span className="compact-work-meta">
            {item.phone ? (
              <button
                type="button"
                className={`compact-call-link${callDisabled ? ' disabled' : ''}`}
                disabled={callDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!callDisabled) onCallCustomer(item);
                }}
              >
                <Phone size={11} /> {item.phone}
              </button>
            ) : 'No phone on file'}
          </span>
        </article>
      ))}
    </div>
  );
}

function PrioritySegmentGroup({
  group,
  customization,
  summary,
  collapsed,
  onToggle,
  onTogglePin,
  onOpenCustomer,
  onAddNote,
  onCallCustomer,
  pinDisabled,
  callDisabled,
}: {
  group: SegmentDailyGroup;
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  collapsed: boolean;
  onToggle: () => void;
  onTogglePin: (item: DailyCallItem) => void;
  onOpenCustomer: (item: DailyCallItem) => void;
  onAddNote: (item: DailyCallItem) => void;
  onCallCustomer: (item: DailyCallItem) => void;
  pinDisabled: boolean;
  callDisabled: boolean;
}) {
  const cap = group.dailyCap ?? group.totalCustomers;
  const groupSummary = {
    ...(typeof summary === 'object' && summary && !Array.isArray(summary) ? summary as Record<string, unknown> : {}),
    groupName: group.segmentName,
    groupCount: group.items.length,
    groupCap: cap,
  };
  return (
    <section className="segment-group" aria-label={group.segmentName}>
      <button type="button" className={`segment-group-toggle${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className="chevron" />
        <span className="segment-group-dot" style={{ background: group.segmentColor }} />
        <span className="segment-group-title">{group.segmentName}</span>
        <span className="segment-group-meta">{group.items.length}/{cap}</span>
      </button>
      <FrontendCustomizationSlotView customization={customization} slot="priority.group.header" context={{ summary: groupSummary }} />
      {!collapsed && (
        <div className="segment-group-items">
          {group.items.length === 0 ? (
            <div className="segment-group-empty">No customers in this assigned segment.</div>
          ) : group.items.map((item) => (
            <SegmentCustomerCard
              key={item.id}
              item={item}
              customization={customization}
              summary={summary}
              onTogglePin={() => onTogglePin(item)}
              onOpen={() => onOpenCustomer(item)}
              onAddNote={() => onAddNote(item)}
              onCall={() => onCallCustomer(item)}
              disabled={pinDisabled}
              callDisabled={callDisabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SegmentCustomerCard({
  item,
  customization,
  summary,
  onTogglePin,
  onOpen,
  onAddNote,
  onCall,
  disabled,
  callDisabled,
}: {
  item: DailyCallItem;
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  onTogglePin: () => void;
  onOpen: () => void;
  onAddNote: () => void;
  onCall: () => void;
  disabled: boolean;
  callDisabled: boolean;
}) {
  const orderSummary = `${item.ordersCount} orders | ${formatCurrency(item.totalSpent)}`;
  const override = frontendElementOverride(customization, 'priority.card', { priorityCustomer: item, summary });
  const latestOrder = item.latestOrder
    ? `${item.latestOrder.orderNumber ?? item.latestOrder.id} | ${formatCurrency(item.latestOrder.totalPrice, item.latestOrder.currency)}`
    : 'No linked order';
  const latestCall = item.latestCall
    ? `${relativeTime(item.latestCall.at)} | ${item.latestCall.phone ?? item.latestCall.email ?? 'linked call'}`
    : 'No linked call yet';
  const customerBrief = priorityCustomerBrief(item);
  const urgencyClass = priorityUrgencyClass(item.urgencyScore);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      className={`daily-card segment-customer-card ${frontendElementClassName(override, item.urgencyScore)}`}
      data-priority-customer-id={item.id}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div className="segment-customer-head">
        <button
          type="button"
          className="segment-customer-open"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          title="Open customer history"
        >
          {frontendFieldVisible(override, 'customerName') ? <span className="daily-title">{item.customerName}</span> : null}
          {(frontendFieldVisible(override, 'phone') || frontendFieldVisible(override, 'email')) ? (
            <span className="segment-customer-contact">
              {frontendFieldVisible(override, 'phone') ? <span><strong>{frontendCopy(override, 'phoneLabel', 'Phone')}</strong>{item.phone ? item.phone : 'No phone on file'}</span> : null}
              {item.email && frontendFieldVisible(override, 'email') ? <span><strong>{frontendCopy(override, 'emailLabel', 'Email')}</strong>{item.email}</span> : null}
            </span>
          ) : null}
        </button>
        {frontendFieldVisible(override, 'actionButtons') ? <div className="segment-customer-actions" aria-label={`${item.customerName} actions`}>
          <button
            type="button"
            className={`quick-action${item.phone ? '' : ' disabled'}`}
            aria-disabled={!item.phone}
            title={item.phone ? `Call ${item.phone}` : 'No phone on file'}
            disabled={!item.phone || callDisabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (item.phone) onCall();
            }}
          >
            <Phone size={12} />
            <span>{frontendCopy(override, 'callButton', 'Call')}</span>
          </button>
          <button
            type="button"
            className="quick-action"
            title="Add customer note"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onAddNote();
            }}
          >
            <StickyNote size={12} />
            <span>{frontendCopy(override, 'noteButton', 'Note')}</span>
          </button>
          <button
            type="button"
            className={`pin-btn${item.pinned ? ' pinned' : ''}`}
            title={item.pinned ? 'Customer is pinned' : 'Pin customer'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin();
            }}
            disabled={disabled}
          >
            {item.pinned ? frontendCopy(override, 'pinnedLabel', 'Pinned') : frontendCopy(override, 'pinLabel', 'Pin')}
          </button>
        </div> : null}
        {frontendFieldVisible(override, 'urgencyScore') ? <span className={`priority ${urgencyClass}`}>U{item.urgencyScore}</span> : null}
      </div>
      {frontendFieldVisible(override, 'priorityBrief') ? <div className={`priority-brief ${urgencyClass}`}>{frontendCopy(override, 'priorityBrief', customerBrief)}</div> : null}
      <FrontendCustomizationSlotView customization={customization} slot="priority.card.after_summary" context={{ priorityCustomer: item, summary }} />
      {frontendFieldVisible(override, 'reason') ? <div className="daily-meta">{personSafeText(item.reason)}</div> : null}
      {(frontendFieldVisible(override, 'latestOrder') || frontendFieldVisible(override, 'latestCall') || frontendFieldVisible(override, 'openFollowUp') || frontendFieldVisible(override, 'latestNote')) ? (
        <div className="segment-customer-insights">
        {frontendFieldVisible(override, 'latestOrder') ? <span className="insight-order"><strong>{frontendCopy(override, 'latestOrderLabel', 'Latest order')}</strong>{latestOrder}</span> : null}
        {frontendFieldVisible(override, 'latestCall') ? <span className="insight-call"><strong>{frontendCopy(override, 'latestCallLabel', 'Latest call')}</strong>{latestCall}</span> : null}
        {frontendFieldVisible(override, 'openFollowUp') ? <span><strong>{frontendCopy(override, 'openFollowUpLabel', 'Open follow-up')}</strong>{item.openTasksCount} items | {item.openRequestsCount} customer requests | {item.notesCount} notes</span> : null}
        {frontendFieldVisible(override, 'latestNote') && item.latestNote ? (
          <span className="segment-customer-latest-note">
            <strong>{item.latestNote.authorName}</strong>
            {item.latestNote.body}
          </span>
        ) : frontendFieldVisible(override, 'latestNote') ? (
          <span><strong>{frontendCopy(override, 'latestNoteLabel', 'Latest note')}</strong>No personnel note yet</span>
        ) : null}
        </div>
      ) : null}
      <div className="segment-customer-foot">
        {frontendFieldVisible(override, 'segmentChip') ? <span className="chip" style={{ background: item.segment.color }}>{item.segment.name}</span> : null}
        {frontendFieldVisible(override, 'orderSummary') ? <span className="segment-customer-orders">{orderSummary}</span> : null}
      </div>
      <FrontendCustomizationSlotView customization={customization} slot="priority.card.footer" context={{ priorityCustomer: item, summary }} />
    </article>
  );
}

function priorityCustomerBrief(item: DailyCallItem) {
  const recentCall = item.latestCall ? `Last call ${relativeTime(item.latestCall.at)}` : 'No recent call captured';
  if (item.openRequestsCount > 0) return `${item.openRequestsCount} customer request${item.openRequestsCount === 1 ? '' : 's'} open - review before outreach.`;
  if (item.ordersCount > 0 && item.latestCall) return `${recentCall} - check order context before calling.`;
  if (item.ordersCount > 0) return `${item.ordersCount} previous orders - good purchase follow-up candidate.`;
  if (item.latestCall) return `${recentCall} - call history needs a human next step.`;
  return 'Assigned priority customer - review history and choose the next outreach.';
}

function priorityUrgencyClass(score: number) {
  if (score >= 8) return 'p9';
  if (score >= 6) return 'p7';
  if (score >= 4) return 'p5';
  return 'p3';
}

function cardActionInput(card: CardData) {
  return {
    intent: card.callIntent ?? card.urgencyBreakdown.intent,
    tags: card.psychTags,
    upset: card.aiBrief?.upsetAbout,
    goal: card.aiBrief?.callGoal,
    summary: card.aiBrief?.whyCalling ?? card.summary,
    urgencyScore: card.urgencyScore,
  };
}

function cardSignalText(card: CardData) {
  return [
    card.title,
    card.summary,
    card.callIntent ?? '',
    ...(card.psychTags ?? []),
    card.aiBrief?.whyCalling ?? '',
    card.aiBrief?.upsetAbout ?? '',
    card.aiBrief?.callGoal ?? '',
    ...(card.aiBrief?.suggestedActions ?? []),
    card.missedNote ?? '',
    card.customerRiskNote ?? '',
  ].join(' ').toLowerCase().replace(/[_-]+/g, ' ');
}

function cardHas(card: CardData, words: string[]) {
  const text = cardSignalText(card);
  return words.some((word) => text.includes(word));
}

function filterDailyCards(cards: CardData[], filter: DailyFilter) {
  if (filter === 'all') return cards;
  if (filter === 'must_call') return cards.filter((card) => card.urgencyScore >= 8 || cardHas(card, ['callback', 'call back', 'follow up', 'call me']));
  if (filter === 'payment_refund') return cards.filter((card) => cardHas(card, ['refund', 'payment', 'chargeback', 'return', 'pricing issue']));
  if (filter === 'purchase_intent') return cards.filter((card) => cardHas(card, ['purchase intent', 'quote', 'order path', 'dtf supply', 'heat press', 'spare part', 'reorder']));
  return cards.filter((card) => !card.customerId);
}

function dailyActionStats(cards: CardData[]) {
  return {
    mustCall: filterDailyCards(cards, 'must_call').length,
    paymentOrRefund: filterDailyCards(cards, 'payment_refund').length,
    purchaseIntent: filterDailyCards(cards, 'purchase_intent').length,
    unmatched: cards.filter((card) => !card.customerId).length,
  };
}

function riskLabel(value: DailyCallItem['customerRisk']) {
  if (value === 'lost') return 'Critical customer risk';
  if (value === 'at_risk') return 'At-risk customer';
  return 'Customer is stable';
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

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
