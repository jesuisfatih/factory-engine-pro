import { Fragment, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FrontendCustomizationRuntimeDto } from '@factory-engine-pro/contracts';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import type { CustomerDetailMainInfo, CustomerDetailPanelCustomization } from '@factory-engine-pro/ui';
import { ChevronDown, Clock, GripVertical, ListChecks, Phone, PhoneIncoming, PhoneOutgoing, Pin, RotateCcw, ShieldAlert, ShoppingBag, StickyNote, Users, UserX, X } from 'lucide-react';
import { archiveDailyCall, dialAircall, fetchCustomerDetail, fetchDailyOperations, fetchTaskBrief, friendlyError, reorderDailyCalls, saveCustomerNote, saveTaskNote, syncPersonTasks, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem, DailyOperationRange, DailyOperations, SegmentDailyGroup } from '../types';
import { Card } from '../components/Card';
import { CompleteTaskDialog } from '../components/CompleteTaskDialog';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible, FrontendCustomizationSlotView } from '../components/FrontendCustomization';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefContent, TaskBriefModal } from '../components/TaskBriefModal';
import { TransferTaskModal } from '../components/TransferTaskModal';
import { focusLabel, personSafeText, staffActionLabel } from '../lib/personTerminology';

const QK_BASE = ['person', 'daily-operations'] as const;
type DailyFilter = 'all' | 'urgent' | 'unreached' | 'at_risk';

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
  const [dailyCollapsed, setDailyCollapsed] = useState(false);
  const [missedCollapsed, setMissedCollapsed] = useState(false);
  const [churnCollapsed, setChurnCollapsed] = useState(false);
  const [kanbanCollapsed, setKanbanCollapsed] = useState(false);
  const [kanbanSegment, setKanbanSegment] = useState<string>('all');
  const [completeCandidate, setCompleteCandidate] = useState<CardData | null>(null);
  const queryKey = [...QK_BASE, range] as const;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchDailyOperations(range),
    refetchInterval: archive ? false : 15000,
    refetchIntervalInBackground: false,
  });
  const syncTasks = useMutation({
    mutationFn: syncPersonTasks,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QK_BASE });
      await refetch();
    },
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
  const summary = data?.summary;
  const filteredDaily = useMemo(() => filterDailyCards(daily, dailyFilter), [daily, dailyFilter]);
  const missedFollowUps = useMemo(() => daily.filter((card) => card.unreached || Boolean(card.missedNote)), [daily]);
  const churnFollowUps = useMemo(() => daily.filter((card) => Boolean(card.customerRiskNote) || card.customerRisk === 'lost' || card.customerRisk === 'at_risk'), [daily]);
  const urgentCount = daily.filter((card) => card.urgencyScore >= 12).length;
  const unreachedCount = daily.filter((card) => card.unreached).length;
  const detailMatchedCard = useMemo(() => {
    if (!detailCustomerId) return null;
    return [...daily, ...priority, ...pinned].find((card) => card.customerId === detailCustomerId) ?? null;
  }, [detailCustomerId, daily, pinned, priority]);
  const customerDetailMain = useMemo(() => {
    if (!detailCustomerId) return undefined;
    const item = groups.flatMap((group) => group.items).find((candidate) => candidate.customerId === detailCustomerId);
    if (item) {
      const main = priorityItemMainInfo(item);
      if (!detailMatchedCard) return main;
      return {
        ...main,
        reason: personSafeText(detailMatchedCard.displayReason || detailMatchedCard.displayOutcome || main.reason),
        segmentLabel: personSafeText(detailMatchedCard.segment || main.segmentLabel),
        segmentColor: detailMatchedCard.segmentColor || main.segmentColor,
        urgencyScore: detailMatchedCard.urgencyScore,
        productTags: [detailMatchedCard.displayBadges[0]?.label, detailMatchedCard.displayCustomerSummary, ...main.productTags]
          .map((value) => personSafeText(value))
          .filter(Boolean)
          .slice(0, 4),
        phone: detailMatchedCard.phone ?? main.phone,
        email: detailMatchedCard.email ?? main.email,
        owner: detailMatchedCard.assignedMemberName ?? main.owner,
        lastContact: detailMatchedCard.createdAt ?? main.lastContact,
        lastCallSummary: personSafeText(detailMatchedCard.displayCallSnapshot || main.lastCallSummary) || null,
      };
    }
    return detailMatchedCard ? cardMainInfo(detailMatchedCard) : undefined;
  }, [detailCustomerId, detailMatchedCard, groups]);
  const customerDetailCustomization = useMemo<CustomerDetailPanelCustomization | null>(() => {
    const override = frontendElementOverride(frontendCustomization, 'customer.detail.popup', {
      customerDetail: customerDetailQuery.data,
      summary,
    });
    if (!override) return null;
    return {
      visibleFields: override.visibleFields,
      hiddenFields: override.hiddenFields,
      copyOverrides: override.copyOverrides,
      className: frontendElementClassName(override, customerDetailMain?.urgencyScore),
    };
  }, [customerDetailMain?.urgencyScore, customerDetailQuery.data, frontendCustomization, summary]);

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

  const completeFollowUp = useMutation({
    mutationFn: async ({ card, note }: { card: CardData; note: string }) => {
      if (note) await saveTaskNote(card.id, { body: note });
      return archiveDailyCall(card.id);
    },
    onSuccess: () => {
      setCompleteCandidate(null);
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
  const empty = !isLoading && (archive ? daily.length === 0 : daily.length === 0 && priority.length === 0 && pinned.length === 0);
  const priorityCustomerCount = groups.reduce((total, group) => total + group.totalCustomers, 0);
  const openRequestsCount = summary?.openRequestsCount ?? 0;
  const closeTaskModal = () => {
    setSelectedId(null);
    setDeepLinkCard(null);
    setDeepLinkError(null);
    if (window.location.search.includes('taskId=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };
  const scrollToSection = (id: string, expand?: () => void) => {
    expand?.();
    window.setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 50);
  };

  return (
    <div className="queue-wrap">
      {!archive && (
        <div className="today-focus">
          <div className="today-focus-head">
            <h2>Today's focus</h2>
            <span className="today-focus-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="today-focus-items">
            <span className={`focus-item${urgentCount > 0 ? ' urgent' : ''}`}>
              {urgentCount > 0 ? `Handle ${urgentCount} urgent follow-up${urgentCount > 1 ? 's' : ''} first (U12+)` : 'No urgent follow-ups right now'}
            </span>
            {churnFollowUps.length > 0 ? (
              <span className="focus-item urgent">
                {`Review ${churnFollowUps.length} customer${churnFollowUps.length > 1 ? 's' : ''} at risk`}
              </span>
            ) : null}
            {missedFollowUps.length > 0 ? (
              <span className="focus-item warn">
                {`Catch up ${missedFollowUps.length} missed follow-up${missedFollowUps.length > 1 ? 's' : ''}`}
              </span>
            ) : null}
            <span className="focus-item">
              {daily.length > 0 ? `Call back ${daily.length} customer${daily.length > 1 ? 's' : ''} from your follow-up list` : 'Follow-up list is clear'}
            </span>
            <span className={`focus-item${openRequestsCount > 0 ? ' warn' : ''}`}>
              {openRequestsCount > 0 ? `${openRequestsCount} customer request${openRequestsCount === 1 ? '' : 's'} waiting` : 'No open customer requests'}
            </span>
            <span className="focus-item done">{summary?.callsMadeToday ?? 0} calls made so far today</span>
            <span className="focus-item">
              {`${(summary?.incomingCallsToday ?? 0) + (summary?.outboundCallsToday ?? 0)} calls pulled into today's intake`}
            </span>
          </div>
        </div>
      )}
      <div className="kpis">
        <FrontendCustomizationSlotView customization={frontendCustomization} slot="kpi.before" context={{ summary }} />
        {!archive && (
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-icon blue"><PhoneIncoming size={13} /></span><span className="label">Incoming calls</span></div>
            <div className="val">{summary?.incomingCallsToday ?? 0}</div>
            <div className="sub blue">received today</div>
          </div>
        )}
        {!archive && (
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-icon rose"><PhoneOutgoing size={13} /></span><span className="label">Outbound calls</span></div>
            <div className="val">{summary?.outboundCallsToday ?? 0}</div>
            <div className={`sub ${missedFollowUps.length > 0 ? 'red' : 'green'}`}>{missedFollowUps.length > 0 ? `${missedFollowUps.length} overdue` : 'all caught up'}</div>
          </div>
        )}
        {!archive && (
          <div className="kpi">
            <div className="kpi-head"><span className="kpi-icon amber"><ShieldAlert size={13} /></span><span className="label">Open requests</span></div>
            <div className="val">{openRequestsCount}</div>
            <div className="sub amber">waiting for an update</div>
          </div>
        )}
        <button type="button" className="kpi kpi-link" onClick={() => scrollToSection('followup-list-section', () => setDailyCollapsed(false))}>
          <div className="kpi-head"><span className="kpi-icon indigo"><ListChecks size={13} /></span><span className="label">{archive ? 'Archived calls' : 'Follow-ups'}</span></div>
          <div className="val">{daily.length}</div>
          <div className="sub">{archive ? 'older than 7 days or manually archived' : range === 'today' ? 'today only' : 'last 7 days'}</div>
        </button>
        {!archive && (
          <button type="button" className="kpi kpi-link" onClick={() => scrollToSection('pin-board-section')}>
            <div className="kpi-head"><span className="kpi-icon yellow"><Pin size={13} /></span><span className="label">Pinned</span></div>
            <div className="val">{summary?.pinnedCount ?? 0}</div>
            <div className="sub">persistent board</div>
          </button>
        )}
        {!archive && (
          <button type="button" className="kpi kpi-link" onClick={() => scrollToSection('priority-kanban-section', () => setKanbanCollapsed(false))}>
            <div className="kpi-head"><span className="kpi-icon green"><Users size={13} /></span><span className="label">Priority customers</span></div>
            <div className="val">{priorityCustomerCount}</div>
            <div className="sub green">{groups.length} customer list{groups.length === 1 ? '' : 's'}</div>
          </button>
        )}
        {!archive && (
          <button type="button" className="kpi kpi-link sync-kpi" onClick={() => syncTasks.mutate()} disabled={syncTasks.isPending}>
            <div className="kpi-head"><span className="kpi-icon cyan"><RotateCcw size={13} className={syncTasks.isPending ? 'spin' : ''} /></span><span className="label">Sync</span></div>
            <div className="val sync-val">{syncTasks.isPending ? '...' : 'Run'}</div>
            <div className="sub blue">{syncTasks.isPending ? 'pulling latest calls' : 'pull latest calls'}</div>
          </button>
        )}
        <FrontendCustomizationSlotView customization={frontendCustomization} slot="kpi.after" context={{ summary }} />
      </div>
      {syncTasks.error ? <div className="ops-inline-error">{friendlyError(syncTasks.error)}</div> : null}

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle={archive ? 'No archived daily calls' : 'No call work assigned yet'}
        emptyBody={archive ? 'Calls older than 7 days, or calls you archived manually, will appear here.' : 'Recent customer calls and assigned customer groups will appear here.'}
      >
        <div className={`ops-grid${archive ? ' archive' : ''}`}>
          {!archive && missedFollowUps.length > 0 ? (
            <section className="missed-v2" id="missed-tasks-section">
              <div className="missed-v2-head">
                <button
                  type="button"
                  className="missed-v2-icon missed-refresh"
                  title="Refresh missed work"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RotateCcw size={15} className={isFetching ? 'spin' : ''} />
                </button>
                <button
                  type="button"
                  className="missed-v2-title"
                  aria-expanded={!missedCollapsed}
                  onClick={() => setMissedCollapsed((current) => !current)}
                >
                  <h2>Missed work</h2>
                </button>
                <span className="missed-v2-badge">Not completed - {missedFollowUps.length}</span>
              </div>
              {!missedCollapsed ? (
                <div className="missed-v2-list">
                  {missedFollowUps.slice(0, 8).map((card, index) => {
                    const tags = compactCardChips(card);
                    const note = card.missedNote || card.displayOutcome || card.displayReason || card.summary;
                    const action = missedActionFor(card);
                    return (
                      <button type="button" key={card.id} className="missed-row" onClick={() => setSelectedId(card.id)}>
                        <span className="missed-avatar" style={{ background: MISSED_AVATAR_COLORS[index % MISSED_AVATAR_COLORS.length] }}>
                          {initialsFor(card.displayTitle || card.title)}
                        </span>
                        <span className="missed-main">
                          <span className="missed-name">{personSafeText(card.displayTitle || card.title)}</span>
                          <span className="missed-sub">
                            {tags.map((tag) => <span key={tag} className="missed-chip">{personSafeText(tag)}</span>)}
                            <span className="missed-note"><NoteText text={personSafeText(note)} /></span>
                          </span>
                        </span>
                        <span className={`missed-action ${action.cls}`}>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          {!archive && churnFollowUps.length > 0 ? (
            <section className="missed-v2 churn-v2" id="at-risk-section">
              <button
                type="button"
                className="missed-v2-head churn-v2-head"
                aria-expanded={!churnCollapsed}
                onClick={() => setChurnCollapsed((current) => !current)}
              >
                <span className="missed-v2-icon churn-v2-icon"><UserX size={15} /></span>
                <h2>At-risk customers</h2>
                <span className="missed-v2-badge churn-v2-badge">Needs care - {churnFollowUps.length}</span>
              </button>
              {!churnCollapsed ? (
                <div className="missed-v2-list">
                  {churnFollowUps.slice(0, 8).map((card, index) => {
                    const note = card.customerRiskNote || card.displayConcern || card.displayReason || card.summary;
                    const lost = card.customerRisk === 'lost';
                    const tags = compactCardChips(card);
                    return (
                      <button type="button" key={card.id} className="missed-row" onClick={() => setSelectedId(card.id)}>
                        <span className="missed-avatar" style={{ background: MISSED_AVATAR_COLORS[index % MISSED_AVATAR_COLORS.length] }}>
                          {initialsFor(card.displayTitle || card.title)}
                        </span>
                        <span className="missed-main">
                          <span className="missed-name">{personSafeText(card.displayTitle || card.title)}</span>
                          <span className="missed-sub">
                            {tags.map((tag) => <span key={tag} className="missed-chip">{personSafeText(tag)}</span>)}
                            <span className="missed-note"><NoteText text={personSafeText(note)} /></span>
                          </span>
                        </span>
                        <span className="churn-actions">
                          <span className={`missed-action ${lost ? 'red' : 'amber'}`}>{lost ? 'Critical' : 'At risk'}</span>
                          <span className="churn-cadence">{lost ? 'Call carefully' : 'Review before calling'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="missed-v2 followup-v2" id="followup-list-section">
            <div className="missed-v2-head followup-head">
              <span className="missed-v2-icon followup-icon"><ListChecks size={15} /></span>
              <button
                type="button"
                className="missed-v2-title"
                aria-expanded={!dailyCollapsed}
                onClick={() => setDailyCollapsed((current) => !current)}
              >
                <h2>{archive ? 'Follow-up archive' : range === 'today' ? 'Follow-up list for today' : 'Follow-up list'}</h2>
                <p className="followup-subtitle">{archive ? 'Archived follow-ups for this staff member.' : 'Customers you need to call back, based on recent conversations.'}</p>
                <FrontendCustomizationSlotView customization={frontendCustomization} slot="daily.header" context={{ summary }} />
              </button>
              {!archive && !dailyCollapsed ? (
                <div className="daily-range-toggle" aria-label="Daily call list range">
                  <button type="button" className={range === 'last7d' ? 'active' : ''} aria-pressed={range === 'last7d'} onClick={() => setRange('last7d')}>Last 7 days</button>
                  <button type="button" className={range === 'today' ? 'active' : ''} aria-pressed={range === 'today'} onClick={() => setRange('today')}>Today</button>
                </div>
              ) : null}
              <span className="missed-v2-badge followup-badge">To call - {filteredDaily.length}</span>
            </div>
            {!dailyCollapsed ? (
              <div className="followup-body">
                {!archive ? (
                  <div className="filter-chips" role="tablist" aria-label="Follow-up filters">
                    {([
                      { id: 'all', label: 'All', count: daily.length },
                      { id: 'urgent', label: 'Urgent', count: urgentCount },
                      { id: 'unreached', label: 'Not reached', count: unreachedCount },
                      { id: 'at_risk', label: 'At risk', count: churnFollowUps.length },
                    ] as const).map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        className={`filter-chip${dailyFilter === filter.id ? ' active' : ''}`}
                        aria-pressed={dailyFilter === filter.id}
                        onClick={() => setDailyFilter(filter.id)}
                      >
                        {filter.label} - {filter.count}
                      </button>
                    ))}
                  </div>
                ) : null}
                {dailyFilter !== 'all' ? <button type="button" className="clear-filter" onClick={() => setDailyFilter('all')}>Clear filter</button> : null}
                {reorderDaily.error ? <div className="ops-inline-error">{friendlyError(reorderDaily.error)}</div> : null}
                {completeFollowUp.error ? <div className="ops-inline-error">{friendlyError(completeFollowUp.error)}</div> : null}
                <FrontendCustomizationSlotView customization={frontendCustomization} slot="daily.before_list" context={{ summary }} />
                <DailyWorkflowList
                  cards={filteredDaily}
                  customization={frontendCustomization}
                  summary={summary}
                  emptyLabel={archive ? 'No archived follow-ups.' : dailyFilter !== 'all' ? 'No follow-ups match this focus.' : range === 'today' ? 'No follow-ups for today.' : 'No follow-ups from the last 7 days.'}
                  reorderDisabled={reorderDaily.isPending}
                  onReorder={(orderedItemIds) => reorderDaily.mutate({ range, orderedItemIds })}
                  onTogglePin={(card) => taskPin.mutate(card)}
                  onArchive={(card) => setCompleteCandidate(card)}
                  onOpen={setSelectedId}
                  onCall={(card) => {
                    if (card.phone) dialCustomer.mutate({ phone: card.phone, customerId: card.customerId ?? undefined, source: 'daily_card' });
                  }}
                  callDisabled={dialCustomer.isPending}
                  onTransfer={setTransferCard}
                />
              </div>
            ) : null}
          </section>

          {!archive && <section className="missed-v2 kanban-v2" id="priority-kanban-section">
            <div className="missed-v2-head kanban-head">
              <span className="missed-v2-icon kanban-icon"><Users size={15} /></span>
              <button
                type="button"
                className="missed-v2-title"
                aria-expanded={!kanbanCollapsed}
                onClick={() => setKanbanCollapsed((current) => !current)}
              >
                <h2>Priority customers</h2>
                <p className="followup-subtitle">Assigned customer lists for regular purchase and follow-up work.</p>
                <FrontendCustomizationSlotView customization={frontendCustomization} slot="priority.header" context={{ summary }} />
              </button>
              <span className="missed-v2-badge kanban-badge">Assigned - {groups.reduce((total, group) => total + group.totalCustomers, 0)} across {groups.length} customer list{groups.length === 1 ? '' : 's'}</span>
            </div>
            {!kanbanCollapsed ? <div className="followup-body">
              {(() => {
                const orderedGroups = [...groups].sort((a, b) => a.priority - b.priority);
                const currentIndex = orderedGroups.findIndex((group) => group.segmentId === kanbanSegment);
                const visibleGroups = kanbanSegment === 'all' ? orderedGroups : orderedGroups.filter((group) => group.segmentId === kanbanSegment);
                return (
                  <>
                    {orderedGroups.length > 1 ? (
                      <div className="filter-chips kanban-chips" role="tablist" aria-label="Customer lists">
                        <button
                          type="button"
                          className={`filter-chip green${kanbanSegment === 'all' ? ' active' : ''}`}
                          aria-pressed={kanbanSegment === 'all'}
                          onClick={() => setKanbanSegment('all')}
                        >
                          All lists - {orderedGroups.reduce((total, group) => total + group.items.length, 0)}
                        </button>
                        {orderedGroups.map((group, index) => (
                          <button
                            key={group.segmentId}
                            type="button"
                            className={`filter-chip green${kanbanSegment === group.segmentId ? ' active' : ''}`}
                            aria-pressed={kanbanSegment === group.segmentId}
                            onClick={() => setKanbanSegment(group.segmentId)}
                          >
                            <span className="segment-group-dot" style={{ background: group.segmentColor }} />
                            List {index + 1} - {group.items.length}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {kanbanSegment !== 'all' && currentIndex >= 0 ? (
                      <div className="list-nav">
                        <span className="list-nav-status">Viewing List {currentIndex + 1} of {orderedGroups.length}</span>
                        <button
                          type="button"
                          className="filter-chip green"
                          disabled={currentIndex === 0}
                          onClick={() => setKanbanSegment(orderedGroups[currentIndex - 1].segmentId)}
                        >
                          Previous list
                        </button>
                        <button
                          type="button"
                          className="filter-chip green"
                          disabled={currentIndex === orderedGroups.length - 1}
                          onClick={() => setKanbanSegment(orderedGroups[currentIndex + 1].segmentId)}
                        >
                          Next list
                        </button>
                      </div>
                    ) : null}
                    <div className="segment-groups">
                      {deepLinkError ? <div className="ops-empty">{deepLinkError}</div> : null}
                      {orderedGroups.length === 0 ? (
                        <div className="ops-empty">No customer group is assigned to this workspace.</div>
                      ) : visibleGroups.map((group) => (
                        <PrioritySegmentGroup
                          key={group.segmentId}
                          group={group}
                          listLabel={`List ${orderedGroups.findIndex((entry) => entry.segmentId === group.segmentId) + 1}`}
                          customization={frontendCustomization}
                          summary={summary}
                          segmentLabel={displayNameForGroup(group)}
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
                  </>
                );
              })()}
            </div> : null}
          </section>}

          {!archive && <div className="ops-panel pin-board-panel" id="pin-board-section">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>}
        </div>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} customization={frontendCustomization} summary={summary} onClose={closeTaskModal} />}
      {completeCandidate ? (
        <CompleteTaskDialog
          followUpTitle={personSafeText(completeCandidate.displayTitle || completeCandidate.title)}
          busy={completeFollowUp.isPending}
          errorText={completeFollowUp.error ? friendlyError(completeFollowUp.error) : null}
          onCancel={() => setCompleteCandidate(null)}
          onConfirm={(note) => completeFollowUp.mutate({ card: completeCandidate, note })}
        />
      ) : null}
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
        main={customerDetailMain}
        customization={customerDetailCustomization}
        mainContent={detailMatchedCard ? (
          <TaskBriefContent
            card={detailMatchedCard}
            customization={frontendCustomization}
            summary={summary}
            onClose={() => setDetailCustomerId(null)}
            embedded
          />
        ) : undefined}
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
  onCall,
  callDisabled,
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
  onCall: (card: CardData) => void;
  callDisabled: boolean;
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
              onCall={onCall}
              callDisabled={callDisabled}
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
  onCall,
  callDisabled,
  onTransfer,
}: {
  card: CardData;
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  disabled: boolean;
  onTogglePin: () => void;
  onArchive: () => void;
  onOpen: (id: string) => void;
  onCall: (card: CardData) => void;
  callDisabled: boolean;
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
        aria-label={`Reorder ${personSafeText(card.displayTitle || card.title)}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} />
      </button>
      <div className="daily-task-main">
        <Card
          card={card}
          customization={customization}
          summary={summary}
          onTogglePin={onTogglePin}
          onArchive={onArchive}
          onOpen={onOpen}
          onCall={onCall}
          callDisabled={callDisabled}
          onTransfer={onTransfer}
        />
        <FrontendCustomizationSlotView customization={customization} slot="daily.card.after_brief" context={{ dailyCall: card, summary }} />
        <FrontendCustomizationSlotView customization={customization} slot="daily.card.footer" context={{ dailyCall: card, summary }} />
      </div>
    </div>
  );
}

const MISSED_AVATAR_COLORS = ['#dc4b3e', '#d99a2b', '#2f7f7a', '#6366f1'];

function staffSegmentLabel(internalName: string, displayName?: string | null) {
  if (displayName?.trim()) return displayName.trim();
  return personSafeText(internalName.replace(/^\s*(sales|support|account|internal)\s*[-:|\u00b7]\s*/i, '').trim() || internalName);
}

function NoteText({ text }: { text: string }) {
  const clipped = text.length > 70 ? `${text.slice(0, 70)}...` : text;
  const parts = clipped.split('\u00b7').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return <>{clipped}</>;
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className="note-sep"> - </span> : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function initialsFor(title: string) {
  const words = title.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '#';
  return `${words[0][0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase() || '#';
}

function missedActionFor(card: CardData) {
  const actionInput = cardActionInput(card);
  const label = staffActionLabel(actionInput);
  if (card.urgencyScore >= 12 || card.customerRisk === 'lost') return { label: 'Call again', cls: 'red' };
  if (card.customerRisk === 'at_risk') return { label: 'Review', cls: 'amber' };
  if (label.toLowerCase().includes('call')) return { label: 'Call back', cls: 'amber' };
  return { label: 'Follow up', cls: 'amber' };
}

function compactCardChips(card: CardData) {
  const chips = [
    card.phone ? `Phone ${card.phone}` : null,
    card.assignedMemberName ? card.assignedMemberName : null,
    focusLabel(card.axis),
  ]
    .map((value) => personSafeText(value).trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(chips)].slice(0, 3);
}

function PrioritySegmentGroup({
  group,
  listLabel,
  customization,
  summary,
  segmentLabel,
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
  listLabel?: string;
  customization: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  segmentLabel?: string;
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
  const displayName = staffSegmentLabel(group.segmentName, (group as unknown as { displayName?: string }).displayName);
  const groupSummary = {
    ...(typeof summary === 'object' && summary && !Array.isArray(summary) ? summary as Record<string, unknown> : {}),
    groupName: displayName,
    groupCount: group.items.length,
    groupCap: cap,
  };
  return (
    <section className="segment-group" aria-label={displayName}>
      <button type="button" className={`segment-group-toggle${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className="chevron" />
        <span className="segment-group-dot" style={{ background: group.segmentColor }} />
        <span className="segment-group-title">{listLabel ?? displayName}</span>
        {listLabel ? <span className="segment-group-subname">{displayName}</span> : null}
        <span className="segment-group-priority">P{group.priority}</span>
        <span className="segment-group-meta">{group.items.length}/{cap} today - {group.totalCustomers} total</span>
      </button>
      <FrontendCustomizationSlotView customization={customization} slot="priority.group.header" context={{ summary: groupSummary }} />
      {!collapsed && (
        <div className="segment-group-items">
          {group.items.length === 0 ? (
            <div className="segment-group-empty">No customers in this assigned list.</div>
          ) : group.items.map((item) => (
            <SegmentCustomerCard
              key={item.id}
              item={item}
              customization={customization}
              summary={summary}
              segmentLabel={segmentLabel}
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
  segmentLabel,
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
  segmentLabel?: string;
  onTogglePin: () => void;
  onOpen: () => void;
  onAddNote: () => void;
  onCall: () => void;
  disabled: boolean;
  callDisabled: boolean;
}) {
  const override = frontendElementOverride(customization, 'priority.card', { priorityCustomer: item, summary });
  const latestOrder = personSafeText(item.displayCommerceSnapshot) || (item.latestOrder
    ? `${item.latestOrder.orderNumber ?? item.latestOrder.id} | ${formatCurrency(item.latestOrder.totalPrice, item.latestOrder.currency)}`
    : 'No linked order');
  const latestCall = personSafeText(item.displayCallSnapshot) || (item.latestCall
    ? `${relativeTime(item.latestCall.at)} | ${item.latestCall.phone ?? item.latestCall.email ?? 'linked call'}`
    : 'No linked call yet');
  const urgencyClass = priorityUrgencyClass(item.urgencyScore);
  const cardUrgencyClass = item.urgencyScore >= 12 ? 'urgency-high' : item.urgencyScore >= 6 ? 'urgency-med' : 'urgency-low';
  const safeName = personSafeText(item.displayTitle || item.customerName);
  const openWork = `${item.openTasksCount} follow-up${item.openTasksCount === 1 ? '' : 's'} - ${item.notesCount} note${item.notesCount === 1 ? '' : 's'}`;
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <article
      className={`daily-card segment-customer-card card-v2 ${cardUrgencyClass} ${frontendElementClassName(override, item.urgencyScore)}`}
      data-priority-customer-id={item.id}
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <span className="missed-avatar card-avatar" style={{ background: MISSED_AVATAR_COLORS[Math.abs(safeName.length + safeName.charCodeAt(0)) % MISSED_AVATAR_COLORS.length] }}>
        {initialsFor(safeName)}
      </span>
      <div className="card-body">
        <div className="row1">
          {frontendFieldVisible(override, 'customerName') ? <span className="title">{safeName}</span> : null}
          {(item.displayBadges ?? []).slice(0, 2).map((badge) => (
            <span key={badge.label} className="product-chip">{personSafeText(badge.label)}</span>
          ))}
          {frontendFieldVisible(override, 'segmentChip') ? <span className="chip" style={{ background: item.segment.color }}>{personSafeText(segmentLabel ?? item.segment.name)}</span> : null}
          {frontendFieldVisible(override, 'urgencyScore') ? <span className={`priority ${urgencyClass}`}>U{item.urgencyScore}</span> : null}
        </div>
        {frontendFieldVisible(override, 'reason') ? <div className="summary">{personSafeText(item.displayReason || item.reason)}</div> : null}
        <FrontendCustomizationSlotView customization={customization} slot="priority.card.after_summary" context={{ priorityCustomer: item, summary }} />
        <div className="card-foot">
          <div className="card-meta">
            {frontendFieldVisible(override, 'phone') ? <span title={frontendCopy(override, 'phoneLabel', 'Phone')}><span className="sig-ic green"><Phone size={11} /></span> {item.phone || 'No phone'}</span> : null}
            {frontendFieldVisible(override, 'latestOrder') ? <span title={frontendCopy(override, 'latestOrderLabel', 'Latest order')}><span className="sig-ic indigo"><ShoppingBag size={11} /></span> {latestOrder}</span> : null}
            {frontendFieldVisible(override, 'latestCall') ? <span title={frontendCopy(override, 'latestCallLabel', 'Latest call')}><span className="sig-ic amber"><Clock size={11} /></span> {latestCall}</span> : null}
            {frontendFieldVisible(override, 'openFollowUp') ? <span title={frontendCopy(override, 'openFollowUpLabel', 'Open follow-up')}><span className="sig-ic blue"><StickyNote size={11} /></span> {openWork}</span> : null}
          </div>
          {frontendFieldVisible(override, 'actionButtons') ? <div className="card-actions segment-customer-actions" aria-label={`${item.customerName} actions`}>
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
        </div>
        <FrontendCustomizationSlotView customization={customization} slot="priority.card.footer" context={{ priorityCustomer: item, summary }} />
      </div>
    </article>
  );
}

function displayNameForGroup(group: SegmentDailyGroup) {
  return staffSegmentLabel(group.segmentName, (group as unknown as { displayName?: string }).displayName);
}

function priorityCustomerBrief(item: DailyCallItem) {
  if (item.displayConcern) return item.displayConcern;
  const recentCall = item.latestCall ? `Last call ${relativeTime(item.latestCall.at)}` : 'No recent call captured';
  if (item.openRequestsCount > 0) return `${item.openRequestsCount} customer request${item.openRequestsCount === 1 ? '' : 's'} open - review before outreach.`;
  if (item.ordersCount > 0 && item.latestCall) return `${recentCall} - check order context before calling.`;
  if (item.ordersCount > 0) return `${item.ordersCount} previous orders - good purchase follow-up candidate.`;
  if (item.latestCall) return `${recentCall} - call history needs a human next step.`;
  return 'Assigned priority customer - review history and choose the next outreach.';
}

function priorityItemMainInfo(item: DailyCallItem): CustomerDetailMainInfo {
  const latestOrder = item.latestOrder
    ? `${item.latestOrder.orderNumber ?? item.latestOrder.id} | ${fmtMoney(item.latestOrder.totalPrice, item.latestOrder.currency)}`
    : item.ordersCount > 0
      ? `${item.ordersCount} orders | ${fmtMoney(item.totalSpent)}`
      : 'No linked order yet';
  const lastCallLabel = item.latestCall
    ? `${relativeTime(item.latestCall.at)} | ${item.latestCall.phone ?? item.latestCall.email ?? 'call captured'}`
    : personSafeText(item.displayCallSnapshot) || 'No recent call captured';
  return {
    reason: personSafeText(item.displayReason || item.reason || priorityCustomerBrief(item)),
    segmentLabel: personSafeText(item.segment.name),
    segmentColor: item.segment.color,
    urgencyScore: item.urgencyScore,
    churnRisk: item.customerRisk === 'lost' || item.customerRisk === 'at_risk' ? item.customerRisk : null,
    productTags: [item.displayBadges[0]?.label, item.displayCustomerSummary]
      .map((value) => personSafeText(value))
      .filter(Boolean)
      .slice(0, 3),
    phone: item.phone,
    email: item.email,
    orderLabel: latestOrder,
    ordersCount: item.ordersCount,
    totalSpent: item.totalSpent,
    lastCallLabel,
    lastCallSummary: personSafeText(item.latestCall?.summary ?? item.displayCallSnapshot) || null,
    lastContact: item.lastContact,
    owner: null,
    openTasksCount: item.openTasksCount,
    openRequestsCount: item.openRequestsCount,
    notesCount: item.notesCount,
    latestNote: item.latestNote,
  };
}

function cardMainInfo(card: CardData): CustomerDetailMainInfo {
  const latestOrder = card.miniOrder
    ? `${card.miniOrder.orderNumber ?? card.miniOrder.id} | ${fmtMoney(card.miniOrder.totalPrice, card.miniOrder.currency)}`
    : card.ordersCount
      ? `${card.ordersCount} orders | ${fmtMoney(card.totalSpent ?? 0)}`
      : personSafeText(card.displayCommerceSnapshot) || 'No linked order yet';
  return {
    reason: personSafeText(card.displayReason || card.displayOutcome || card.summary || 'Review this customer before outreach.'),
    segmentLabel: personSafeText(card.segment || card.displayCustomerSummary || 'Customer follow-up'),
    segmentColor: card.segmentColor || '#2563eb',
    urgencyScore: card.urgencyScore,
    churnRisk: card.customerRisk === 'lost' || card.customerRisk === 'at_risk' ? card.customerRisk : null,
    productTags: [card.displayBadges[0]?.label, card.displayCustomerSummary]
      .map((value) => personSafeText(value))
      .filter(Boolean)
      .slice(0, 3),
    phone: card.phone ?? null,
    email: card.email ?? null,
    orderLabel: latestOrder,
    ordersCount: card.ordersCount ?? 0,
    totalSpent: card.totalSpent ?? 0,
    lastCallLabel: personSafeText(card.displayCallSnapshot) || 'Recent call context',
    lastCallSummary: personSafeText(card.displayCallSnapshot || card.callExcerpt) || null,
    lastContact: card.createdAt ?? new Date(0).toISOString(),
    owner: card.assignedMemberName ?? null,
    openTasksCount: 1,
    openRequestsCount: 0,
    notesCount: 0,
    latestNote: null,
  };
}

function fmtMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
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
    upset: card.displayConcern,
    goal: card.displayOutcome,
    summary: card.displayReason,
    urgencyScore: card.urgencyScore,
  };
}

function filterDailyCards(cards: CardData[], filter: DailyFilter) {
  if (filter === 'all') return cards;
  if (filter === 'urgent') return cards.filter((card) => card.urgencyScore >= 12);
  if (filter === 'unreached') return cards.filter((card) => card.unreached);
  return cards.filter((card) => card.customerRisk === 'lost' || card.customerRisk === 'at_risk' || Boolean(card.customerRiskNote));
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
              <span className="chip" style={{ background: customer.segment.color }}>{personSafeText(customer.segment.name)}</span>
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
