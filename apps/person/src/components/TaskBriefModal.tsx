import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FrontendCustomizationModalSection, FrontendCustomizationRuntimeDto, PersonCallDisposition } from '@factory-engine-pro/contracts';
import {
  X, Phone, Mail, ExternalLink, AlarmClockOff, CheckCircle2,
  Pencil, RotateCcw, ShoppingBag, DollarSign,
  Activity, CalendarClock, StickyNote, Loader2, AlertTriangle,
  UserPlus,
} from 'lucide-react';
import { dialAircall, fetchTaskBrief, friendlyError, linkTaskCustomer, recordTaskOutcome, saveTaskNote, scheduleTaskFollowUp } from '../api/live';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible, frontendModalSectionStyle, FrontendCustomizationSlotView } from './FrontendCustomization';
import { FollowUpScheduler, initialFollowUpValue } from './FollowUpScheduler';
import type { Card as CardData, TaskBriefDetail } from '../types';
import { humanize, personSafeText } from '../lib/personTerminology';

interface Props {
  card: CardData;
  customization?: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  contextTone?: TaskBriefContextTone;
  onClose: () => void;
}

export type TaskBriefContextTone = 'missed' | 'risk' | 'followup' | 'priority' | 'pinned';

type TaskBriefContentProps = Props & {
  embedded?: boolean;
  followUpNotesContent?: ReactNode;
};

const CALL_CONTEXT_SECTION_ORDER = [
  'callExcerpt',
  'noteForm',
  'purchaseHistory',
  'callSummary',
  'timeline',
  'customCustomerContext',
] as const satisfies readonly FrontendCustomizationModalSection[];

const CALL_OUTCOMES: Array<{ value: Exclude<PersonCallDisposition, 'not_selected'>; label: string }> = [
  { value: 'customer_reached', label: 'Customer reached - follow-up remains open' },
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Voicemail left' },
  { value: 'callback_requested', label: 'Customer requested a callback' },
  { value: 'follow_up_scheduled', label: 'Follow-up scheduled' },
  { value: 'quote_sent', label: 'Quote sent' },
  { value: 'order_placed', label: 'Order placed' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'do_not_call', label: 'Do not call' },
  { value: 'completed', label: 'Completed' },
];

function normalizeCallContextSectionOrder(sectionOrder: FrontendCustomizationModalSection[] | undefined) {
  if (!sectionOrder?.length) return sectionOrder;

  const groupedSections = new Set<FrontendCustomizationModalSection>(CALL_CONTEXT_SECTION_ORDER);
  const firstGroupedSection = sectionOrder.findIndex((section) => groupedSections.has(section));
  if (firstGroupedSection < 0) return sectionOrder;

  const callExcerptIndex = sectionOrder.indexOf('callExcerpt');
  const anchorIndex = callExcerptIndex >= 0 ? callExcerptIndex : firstGroupedSection;
  const anchor = sectionOrder
    .slice(0, anchorIndex)
    .filter((section) => !groupedSections.has(section)).length;
  const remaining = sectionOrder.filter((section) => !groupedSections.has(section));

  return [
    ...remaining.slice(0, anchor),
    ...CALL_CONTEXT_SECTION_ORDER,
    ...remaining.slice(anchor),
  ];
}

function labelize(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return humanize(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function fmtMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function fmtDate(value: string | null | undefined) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function riskTier(priority: number) {
  if (priority >= 9) return { label: 'High priority', tone: 'danger' as const };
  if (priority >= 7) return { label: 'Needs attention', tone: 'warn' as const };
  if (priority >= 5) return { label: 'Customer follow-up', tone: 'success' as const };
  return { label: 'Routine', tone: 'info' as const };
}

function sourceLabel(source: CardData['source']) {
  const map: Record<CardData['source'], string> = {
    manual: 'Manual',
    call_analysis: 'Call summary',
    segment_priority: 'Customer list',
    stale_follow_up: 'Follow-up',
    admin_transfer: 'Team transfer',
  };
  return map[source] ?? 'Follow-up';
}

interface NarrativeFieldProps {
  label: string;
  suggestedValue: string;
  value: string;
  onChange: (next: string) => void;
  multiLine?: boolean;
}

function NarrativeField({ label, suggestedValue, value, onChange, multiLine }: NarrativeFieldProps) {
  const [editing, setEditing] = useState(false);
  const dirty = value !== suggestedValue;
  return (
    <div className="brief-block">
      <div className="brief-block-head">
        <span className="lbl">{label}</span>
        <div className="brief-actions">
          {dirty && (
            <button type="button" className="brief-icon-btn" title="Reset suggestion" onClick={() => onChange(suggestedValue)}>
              <RotateCcw size={11} />
            </button>
          )}
          <button
            type="button"
            className={`brief-icon-btn${editing ? ' active' : ''}`}
            title={editing ? 'Done' : 'Edit'}
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil size={11} />
          </button>
        </div>
      </div>
      {editing ? (
        multiLine ? (
          <textarea className="brief-edit" rows={3} value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        ) : (
          <input className="brief-edit" value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
        )
      ) : (
        <div className="brief-val">{value || 'Not captured'}{dirty && <span className="brief-dirty">edited</span>}</div>
      )}
    </div>
  );
}

export function TaskBriefModal(props: Props) {
  return <TaskBriefContent {...props} />;
}

export function TaskBriefContent({ card, customization, summary, contextTone = 'followup', onClose, embedded = false, followUpNotesContent }: TaskBriefContentProps) {
  const queryClient = useQueryClient();
  const queryKey = ['person', 'task-brief', card.id] as const;
  const isTaskCard = card.kind === 'task';
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchTaskBrief(card.id),
    enabled: isTaskCard,
  });

  const detail = data as TaskBriefDetail | undefined;
  const liveCard = detail?.card ?? card;
  const customizationContext = { dailyCall: liveCard, taskBrief: detail, summary };
  const override = frontendElementOverride(customization, 'task.modal', customizationContext);
  const normalizedOverride = override?.sectionOrder
    ? { ...override, sectionOrder: normalizeCallContextSectionOrder(override.sectionOrder) }
    : override;
  const sectionStyle = (section: Parameters<typeof frontendModalSectionStyle>[1], fallbackOrder: number) => frontendModalSectionStyle(normalizedOverride, section, fallbackOrder);
  const showField = (field: Parameters<typeof frontendFieldVisible>[1], defaultVisible = true) => frontendFieldVisible(override, field, defaultVisible);
  const loadingTaskBrief = isTaskCard && isLoading;
  const taskBriefError = isTaskCard && isError;
  const hasBrief = liveCard.source !== 'manual';
  const customerDetailUrl = detail?.customerDetailUrl ?? (liveCard.customerId ? `/staff/customers?customerId=${encodeURIComponent(liveCard.customerId)}` : '#');
  const initial = useMemo(() => ({
    why: personSafeText(liveCard.displayReason || 'Verified call analysis is not available yet.'),
    upset: personSafeText(liveCard.displayConcern || 'Analysis unavailable.'),
    goal: personSafeText(liveCard.displayOutcome || 'Analysis unavailable.'),
  }), [liveCard.displayConcern, liveCard.displayOutcome, liveCard.displayReason]);
  const [why, setWhy] = useState(initial.why);
  const [upset, setUpset] = useState(initial.upset);
  const [goal, setGoal] = useState(initial.goal);
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => initialFollowUpValue());
  const [scheduleNote, setScheduleNote] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(isTaskCard ? card.id : null);
  const [outcomeRequired, setOutcomeRequired] = useState(Boolean(card.outcomeRequired));
  const [disposition, setDisposition] = useState<PersonCallDisposition>('not_selected');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkEmail, setLinkEmail] = useState(liveCard.email ?? '');
  const [linkPhone, setLinkPhone] = useState(liveCard.phone ?? '');
  const dialCustomer = useMutation({
    mutationFn: dialAircall,
    onSuccess: (result) => {
      if (result.mode === 'tel_fallback') window.location.assign(result.telHref);
      if (result.ok && result.mode === 'aircall_dial' && result.staffWorkItemId) {
        setActiveTaskId(result.staffWorkItemId);
        setOutcomeRequired(true);
        setDisposition('not_selected');
      }
      void queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
    },
  });
  const latestOrder = liveCard.miniOrder ?? detail?.recentOrders[0];
  const performance = detail?.performance30d ?? liveCard.performance30d;
  const callCustomer = () => {
    if (!liveCard.phone) return;
    dialCustomer.mutate({
      phone: liveCard.phone,
      customerId: liveCard.customerId ?? undefined,
      staffWorkItemId: isTaskCard ? liveCard.id : undefined,
      idempotencyKey: clientActionId('staff-dial'),
      source: !isTaskCard && contextTone === 'priority' ? 'priority_board' : 'task_brief',
    });
  };

  useEffect(() => {
    setWhy(initial.why);
    setUpset(initial.upset);
    setGoal(initial.goal);
  }, [initial]);

  useEffect(() => {
    if (isTaskCard) setActiveTaskId(liveCard.id);
    if (liveCard.outcomeRequired) setOutcomeRequired(true);
  }, [isTaskCard, liveCard.id, liveCard.outcomeRequired]);

  useEffect(() => {
    if (embedded) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !outcomeRequired) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [embedded, onClose, outcomeRequired]);

  const noteMutation = useMutation({
    mutationFn: () => saveTaskNote(card.id, { body: note }),
    onSuccess: (next) => {
      setNote('');
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
      queryClient.invalidateQueries({ queryKey: ['person', 'notes'] });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => scheduleTaskFollowUp(card.id, {
      scheduledAt: new Date(scheduleAt).toISOString(),
      note: scheduleNote || undefined,
    }),
    onSuccess: (next) => {
      setScheduleNote('');
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
      queryClient.invalidateQueries({ queryKey: ['person', 'cal', 'events'] });
    },
  });

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    noteMutation.mutate();
  };

  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleAt) return;
    scheduleMutation.mutate();
  };

  const snoozeMutation = useMutation({
    mutationFn: () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
      return scheduleTaskFollowUp(card.id, {
        scheduledAt: next.toISOString(),
        note: 'Snoozed: follow up tomorrow morning',
      });
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
      queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
      queryClient.invalidateQueries({ queryKey: ['person', 'cal', 'events'] });
      onClose();
    },
  });

  const outcomeNeedsSchedule = disposition === 'callback_requested' || disposition === 'follow_up_scheduled';
  const outcomeMutation = useMutation({
    mutationFn: () => recordTaskOutcome(activeTaskId!, {
      disposition,
      note: outcomeNote.trim() || undefined,
      scheduledAt: outcomeNeedsSchedule && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
      phone: liveCard.phone,
      providerResult: dialCustomer.data?.mode,
      idempotencyKey: clientActionId('call-outcome'),
    }),
    onSuccess: () => {
      setOutcomeRequired(false);
      void queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
      void queryClient.invalidateQueries({ queryKey: ['person', 'notes'] });
      void queryClient.invalidateQueries({ queryKey: ['person', 'cal', 'events'] });
      onClose();
    },
  });

  const submitOutcome = (event?: FormEvent) => {
    event?.preventDefault();
    if (!activeTaskId || disposition === 'not_selected' || outcomeMutation.isPending) return;
    outcomeMutation.mutate();
  };
  const primaryBrief = personSafeText(liveCard.displayOutcome) || 'Verified call analysis is not available yet.';
  const modalActionOrder = liveCard.modalActionOrder ?? [];
  const safeDisplayActions = liveCard.displayActions.map((action) => personSafeText(action)).filter(Boolean);
  const directActions = orderedDisplayActions(safeDisplayActions, modalActionOrder);
  const callSignal = callSignalText(detail);
  const customerMatched = Boolean(liveCard.customerId || detail?.shopifyCustomer.customerId || detail?.shopifyCustomer.phoneMatched || detail?.shopifyCustomer.emailMatched);
  const purchaseSummary = personSafeText(liveCard.displayCommerceSnapshot) || (latestOrder
    ? `${latestOrder.orderNumber ?? latestOrder.id} - ${fmtMoney(latestOrder.totalPrice, latestOrder.currency)}`
    : liveCard.ordersCount
      ? `${liveCard.ordersCount} orders - ${fmtMoney(liveCard.totalSpent ?? 0)}`
      : 'No linked Shopify order yet');
  const matchLabel = customerMatched ? 'Matched customer' : 'Caller not matched yet';
  const matchHint = customerMatched
    ? 'Use order and note history before calling.'
    : 'Confirm phone or email before promising order, refund, or pricing details.';
  const summarySignals = detail?.callSummary?.motivators.map(personSafeText).filter(Boolean) ?? [];
  const summaryFriction = detail?.callSummary?.objections.map(personSafeText).filter(Boolean) ?? [];
  const summaryChecks = safeDisplayActions;
  const callExcerpt = personSafeText(liveCard.callExcerpt);
  const tier = riskTier(liveCard.priority);
  const safeTitle = personSafeText(liveCard.displayTitle || liveCard.title);
  const safeSource = sourceLabel(liveCard.source);
  const customerSummaryOrder = Math.min(
    ...(showField('purchaseHistory') ? [sectionStyle('purchaseHistory', 90).order] : []),
    ...(showField('callSummary') ? [sectionStyle('callSummary', 100).order] : []),
  );

  const linkCustomerMutation = useMutation({
    mutationFn: () => linkTaskCustomer(card.id, {
      mode: 'create',
      companyName: linkName.trim() || undefined,
      email: linkEmail.trim() || undefined,
      phone: linkPhone.trim() || undefined,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
      await queryClient.invalidateQueries({ queryKey: ['person', 'customers'] });
    },
  });

  const noteSection = isTaskCard && showField('noteForm') ? (
    <form className="brief-block" style={sectionStyle('noteForm', 82)} onSubmit={submitNote}>
      <div className="brief-block-head">
        <span className="lbl">{frontendCopy(override, 'noteLabel', 'Follow-up notes')}</span>
        {detail ? <span className="brief-count-pill">{detail.notes.length} saved</span> : null}
      </div>
      <textarea
        id="task-note-input"
        className="brief-edit"
        rows={3}
        placeholder="Save a follow-up note to customer history..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="brief-form-actions">
        <span className={noteMutation.isError ? 'danger-text' : ''}>{noteMutation.isError ? friendlyError(noteMutation.error) : 'Persisted to this customer follow-up thread.'}</span>
        <button type="submit" className="btn primary" disabled={!note.trim() || noteMutation.isPending}>
          <StickyNote size={12} /> {noteMutation.isPending ? 'Saving' : 'Save note'}
        </button>
      </div>
      {detail?.notes.length ? (
        <div className="brief-mini-list">
          {detail.notes.slice(0, 3).map((item) => (
            <div key={item.id} className="brief-note-row">
              <span>{fmtDate(item.createdAt)}</span>
              <p>{personSafeText(item.body)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </form>
  ) : null;
  const followUpNotesSection = followUpNotesContent ? (
    <div style={sectionStyle('noteForm', 82)}>{followUpNotesContent}</div>
  ) : noteSection;
  const outcomePanel = outcomeRequired && activeTaskId ? (
    <form className="brief-block brief-outcome" style={{ order: 70 }} onSubmit={submitOutcome}>
      <div className="brief-block-head">
        <span className="lbl">Save call outcome</span>
        <span className="brief-count-pill required">Required</span>
      </div>
      <p className="brief-outcome-help">Choose what happened before leaving this customer follow-up.</p>
      <select
        className="brief-edit"
        value={disposition}
        onChange={(event) => setDisposition(event.target.value as PersonCallDisposition)}
        aria-label="Call outcome"
      >
        <option value="not_selected" disabled>Select an outcome</option>
        {CALL_OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {outcomeNeedsSchedule ? (
        <div className="brief-outcome-schedule">
          <span className="lbl">Next call date</span>
          <FollowUpScheduler value={scheduleAt} onChange={setScheduleAt} disabled={outcomeMutation.isPending} compact />
        </div>
      ) : null}
      <textarea
        className="brief-edit"
        rows={2}
        value={outcomeNote}
        onChange={(event) => setOutcomeNote(event.target.value)}
        placeholder="Add the useful result or next step to customer history"
      />
      <div className="brief-form-actions">
        <span className={outcomeMutation.isError ? 'danger-text' : ''}>
          {outcomeMutation.isError ? friendlyError(outcomeMutation.error) : 'This result updates the follow-up list and customer history.'}
        </span>
        <button type="submit" className="btn primary" disabled={disposition === 'not_selected' || outcomeMutation.isPending}>
          <CheckCircle2 size={12} /> {outcomeMutation.isPending ? 'Saving' : 'Save outcome'}
        </button>
      </div>
    </form>
  ) : null;

  const modalContent = (
      <div className={`modal-card brief-modal brief-context-${contextTone} ${embedded ? 'brief-modal-embedded' : ''} ${frontendElementClassName(override, liveCard.urgencyScore)}`} role="document">
        <header className="modal-head">
          <div>
            <div className="brief-eyebrow">
              <span className={`brief-source brief-source-${liveCard.source}`}>
                <Activity size={10} /> {safeSource}
              </span>
              <span className={`brief-tier tier-${tier.tone}`}>{tier.label} - P{liveCard.priority}</span>
              {showField('segmentChip') ? <span className="chip" style={{ background: liveCard.segmentColor }}>{personSafeText(liveCard.segment)}</span> : null}
              <span className="brief-urgency">U{liveCard.urgencyScore}</span>
            </div>
            {showField('title') ? <h2 id="task-brief-title" style={{ marginTop: 6 }}>{safeTitle}</h2> : null}
            <div className="brief-identity">
              {liveCard.phone && showField('phone') ? <span><Phone size={11} /> {liveCard.phone}</span> : null}
              {liveCard.email && showField('email') ? <span><Mail size={11} /> {liveCard.email}</span> : null}
              {latestOrder && <span><ShoppingBag size={11} /> {latestOrder.orderNumber ?? latestOrder.id} {fmtMoney(latestOrder.totalPrice, latestOrder.currency)}</span>}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close" disabled={outcomeRequired} title={outcomeRequired ? 'Save the call outcome before closing' : 'Close'}>
            <X size={16} />
          </button>
        </header>

        <div className="modal-body brief-body">
          <div className="brief-main">
            {loadingTaskBrief && (
              <div className="brief-state" style={sectionStyle('loadingState', 1)}>
                <Loader2 size={16} className="spin" />
                <strong>{frontendCopy(override, 'loadingTitle', 'Loading live call plan')}</strong>
                <span>Customer orders, call notes, and timeline are being read from the API.</span>
              </div>
            )}

            {taskBriefError && (
              <div className="brief-state danger-text" style={sectionStyle('errorState', 2)}>
                <AlertTriangle size={16} />
                <strong>{frontendCopy(override, 'errorTitle', 'Call plan could not be loaded')}</strong>
                <span>{friendlyError(error)}</span>
              </div>
            )}

            {isTaskCard && !isLoading && !isError && !detail && (
              <div className="brief-state" style={sectionStyle('emptyState', 3)}>
                <StickyNote size={16} />
                <strong>{frontendCopy(override, 'emptyTitle', 'No call plan data')}</strong>
                <span>This follow-up exists on the board, but the live detail endpoint returned no context payload.</span>
              </div>
            )}

            {!taskBriefError && (
              <>
                {hasBrief ? (
                  <>
                    {showField('reasonField') ? <div style={sectionStyle('reasonField', 10)}><NarrativeField label={frontendCopy(override, 'reasonLabel', "Why you're calling")} suggestedValue={initial.why} value={why} onChange={setWhy} multiLine /></div> : null}
                    {showField('moodField') ? <div style={sectionStyle('moodField', 20)}><NarrativeField label={frontendCopy(override, 'moodLabel', "What they're upset about")} suggestedValue={initial.upset} value={upset} onChange={setUpset} multiLine /></div> : null}
                    {showField('outcomeField') ? <div style={sectionStyle('outcomeField', 30)}><NarrativeField label={frontendCopy(override, 'outcomeRequiredLabel', 'Your goal')} suggestedValue={initial.goal} value={goal} onChange={setGoal} multiLine /></div> : null}

                    {directActions.length && showField('extraChecks') ? (
                      <div className="brief-block" style={sectionStyle('extraChecks', 70)}>
                        <div className="brief-block-head">
                          <span className="lbl">{frontendCopy(override, 'extraChecksLabel', 'Suggested actions')}</span>
                        </div>
                        <ul className="brief-actions-list">
                          {directActions.map((action) => <li key={action}>{personSafeText(action)}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {!directActions.length && showField('extraChecks') ? (
                      <div className="brief-block brief-analysis-unavailable" style={sectionStyle('extraChecks', 70)}>
                        <div className="brief-block-head"><span className="lbl">Suggested actions</span></div>
                        <div className="brief-val brief-val-muted">Analysis unavailable. Review the call excerpt before contacting the customer.</div>
                      </div>
                    ) : null}

                    {(callExcerpt || liveCard.source === 'call_analysis') && showField('callExcerpt') ? (
                      <div className="brief-block" style={sectionStyle('callExcerpt', 80)}>
                        <div className="brief-block-head">
                          <span className="lbl">{frontendCopy(override, 'callExcerptLabel', 'Call excerpt')}</span>
                        </div>
                        <div className={callExcerpt ? 'brief-transcript' : 'brief-val brief-val-muted'}>
                          {callExcerpt || 'No call excerpt is available. Review the original call before contacting the customer.'}
                        </div>
                      </div>
                    ) : null}
                    {outcomePanel}
                    {followUpNotesSection}
                  </>
                ) : (
                  <>
                    <div className="brief-block">
                      <div className="brief-block-head">
                        <span className="lbl">Manual follow-up</span>
                      </div>
                      <div className="brief-val brief-val-muted">
                        Created by an operator. Add a follow-up note or schedule the next outreach to enrich the customer history.
                      </div>
                    </div>
                    {outcomePanel}
                    {followUpNotesSection}
                  </>
                )}

                {(showField('purchaseHistory') || showField('callSummary')) ? <div className="brief-grid-two" style={{ order: customerSummaryOrder }}>
                  {showField('purchaseHistory') ? <div className="brief-block" style={sectionStyle('purchaseHistory', 90)}>
                    <div className="brief-block-head">
                      <span className="lbl">{frontendCopy(override, 'purchaseHistoryBlockLabel', 'Customer purchase history')}</span>
                      {detail?.shopifyCustomer.emailMatched || detail?.shopifyCustomer.phoneMatched ? <span className="brief-count-pill">linked</span> : null}
                    </div>
                    {detail ? (
                      <>
                        <div className="brief-card-row"><span className="lbl">Customer record</span><span className="val">{detail.shopifyCustomer.customerId ?? 'Not linked'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Shopify customer</span><span className="val">{detail.shopifyCustomer.shopifyCustomerId ?? 'Not synced'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Phone linked</span><span className="val">{detail.shopifyCustomer.phoneMatched ? 'Yes' : 'No'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Email linked</span><span className="val">{detail.shopifyCustomer.emailMatched ? 'Yes' : 'No'}</span></div>
                        {detail.recentOrders.length === 0 ? (
                          <div className="brief-val brief-val-muted">No Shopify orders are linked to this customer.</div>
                        ) : (
                          <div className="brief-mini-list">
                            {detail.recentOrders.map((order) => (
                              <div key={order.id} className="brief-mini-row">
                                <span>{order.orderNumber ?? order.id}</span>
                                <strong>{fmtMoney(order.totalPrice, order.currency)}</strong>
                                <em>{order.financialStatus ?? 'unknown'}</em>
                              </div>
                            ))}
                          </div>
                        )}
                        {!customerMatched && isTaskCard ? (
                          <form
                            className="brief-customer-link"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (!linkName.trim() && !linkEmail.trim() && !linkPhone.trim()) return;
                              linkCustomerMutation.mutate();
                            }}
                          >
                            <div className="brief-block-head"><span className="lbl">Link this caller</span></div>
                            <input className="brief-edit" value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Customer or company name" />
                            <div className="brief-link-grid">
                              <input className="brief-edit" type="email" value={linkEmail} onChange={(event) => setLinkEmail(event.target.value)} placeholder="Email" />
                              <input className="brief-edit" value={linkPhone} onChange={(event) => setLinkPhone(event.target.value)} placeholder="Phone" />
                            </div>
                            {linkCustomerMutation.isError ? <div className="danger-text">{friendlyError(linkCustomerMutation.error)}</div> : null}
                            <button className="btn" type="submit" disabled={linkCustomerMutation.isPending || (!linkName.trim() && !linkEmail.trim() && !linkPhone.trim())}>
                              <UserPlus size={12} /> {linkCustomerMutation.isPending ? 'Linking' : 'Create or link customer'}
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <div className="brief-val brief-val-muted">Open the live brief to see Shopify match data.</div>
                    )}
                  </div> : null}

                  {showField('callSummary') ? <div className="brief-block" style={sectionStyle('callSummary', 100)}>
                    <div className="brief-block-head"><span className="lbl">{frontendCopy(override, 'callSummaryLabel', 'Call summary')}</span></div>
                    {liveCard.displayReason || liveCard.displayConcern || liveCard.displayOutcome || detail?.callSummary ? (
                      <div className="brief-psych">
                        <div><span>Issue</span><strong>{personSafeText(liveCard.displayConcern || detail?.callSummary?.communicationStyle || 'Not captured')}</strong></div>
                        <div><span>Next step</span><strong>{personSafeText(liveCard.displayOutcome || primaryBrief || 'Analysis unavailable')}</strong></div>
                        <div><span>Checks</span><strong>{summaryChecks.slice(0, 3).map(personSafeText).join(', ') || 'Analysis unavailable'}</strong></div>
                        <div><span>Signals</span><strong>{summarySignals.join(', ') || 'None captured'}</strong></div>
                        <div><span>Friction</span><strong>{summaryFriction.join(', ') || 'None captured'}</strong></div>
                        <p>{personSafeText(liveCard.displayReason || callSignal)}</p>
                      </div>
                    ) : (
                      <div className="brief-val brief-val-muted">No call summary is attached to this customer yet.</div>
                    )}
                  </div> : null}
                </div> : null}
                {showField('timeline') ? <div className="brief-block" style={sectionStyle('timeline', 110)}>
                  <div className="brief-block-head">
                    <span className="lbl">{frontendCopy(override, 'timelineLabel', 'Customer history before calling')}</span>
                    {detail ? <span className="brief-count-pill">{detail.timeline.length}</span> : null}
                  </div>
                  {detail?.timeline.length ? (
                    <div className="brief-timeline">
                      {detail.timeline.map((item) => (
                            <div key={item.id} className={`brief-timeline-row kind-${item.kind}`}>
                              <span>{labelize(item.kind)}</span>
                              <div>
                                <strong>{personSafeText(item.title)}</strong>
                                <p>{personSafeText(item.summary) || 'No summary'}</p>
                                <em>{fmtDate(item.at)}</em>
                              </div>
                            </div>
                      ))}
                    </div>
                  ) : (
                    <div className="brief-val brief-val-muted">No customer history entries yet.</div>
                  )}
                </div> : null}
                {isTaskCard && showField('scheduleForm') ? (
                  <form className="brief-block brief-main-schedule" style={sectionStyle('scheduleForm', 115)} onSubmit={submitSchedule}>
                    <div className="brief-block-head"><span className="lbl">{frontendCopy(override, 'calendarLabel', 'Calendar action')}</span></div>
                    <div className="brief-schedule-grid">
                      <FollowUpScheduler value={scheduleAt} onChange={setScheduleAt} disabled={scheduleMutation.isPending} compact />
                      <input className="brief-edit" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Follow-up note" />
                      <button type="submit" className="btn" disabled={!scheduleAt || scheduleMutation.isPending}>
                        <CalendarClock size={12} /> {scheduleMutation.isPending ? 'Scheduling' : 'Schedule'}
                      </button>
                    </div>
                    {scheduleMutation.isError ? <div className="danger-text">{friendlyError(scheduleMutation.error)}</div> : null}
                  </form>
                ) : null}
                <div className="brief-section-shell" style={sectionStyle('customCustomerContext', 120)}>
                  <FrontendCustomizationSlotView customization={customization} slot="modal.customer_context" context={customizationContext} />
                </div>

              </>
            )}
          </div>

          {showField('customerSidePanel', false) ? <aside className="brief-side" style={sectionStyle('customerSidePanel', 140)}>
            <div className="brief-stats">
              <div className="brief-stat">
                <ShoppingBag size={11} />
                <div><div className="lbl">{frontendCopy(override, 'ordersLabel', 'Orders')}</div><div className="val">{liveCard.ordersCount ?? 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <DollarSign size={11} />
                <div><div className="lbl">{frontendCopy(override, 'ltvLabel', 'LTV')}</div><div className="val">{liveCard.totalSpent ? fmtMoney(liveCard.totalSpent) : 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <Activity size={11} />
                <div><div className="lbl">{frontendCopy(override, 'revenue30dLabel', '30d revenue')}</div><div className="val">{performance ? fmtMoney(performance.revenue) : 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <Phone size={11} />
                <div><div className="lbl">{frontendCopy(override, 'calls30dLabel', '30d calls')}</div><div className="val">{performance?.calls ?? 'N/A'}</div></div>
              </div>
            </div>

            {showField('snapshotGrid') ? (
              <div className="brief-card brief-card-meta" style={sectionStyle('snapshotGrid', 141)}>
                <div className="brief-card-head"><Activity size={12} /> {frontendCopy(override, 'whatHappenedLabel', 'Live customer context')}</div>
                <div className="brief-card-row"><span className="lbl">{frontendCopy(override, 'customerMatchLabel', 'Customer match')}</span><span className="val">{matchLabel}</span></div>
                <div className="brief-card-row"><span className="lbl">{frontendCopy(override, 'purchaseHistoryLabel', 'Purchase history')}</span><span className="val">{purchaseSummary}</span></div>
                <div className="brief-card-row"><span className="lbl">{frontendCopy(override, 'outcomeLabel', 'Outcome')}</span><span className="val">{goal || primaryBrief}</span></div>
                <div className="brief-val brief-val-muted">{matchHint}</div>
              </div>
            ) : null}

            <div className="brief-quick-actions">
              <button type="button" className="btn" onClick={callCustomer} disabled={!liveCard.phone || dialCustomer.isPending}><Phone size={12} /> {dialCustomer.isPending ? 'Calling' : frontendCopy(override, 'callButton', 'Call')}</button>
              <a className="btn" href={liveCard.email ? `mailto:${liveCard.email}` : undefined}><Mail size={12} /> {frontendCopy(override, 'emailButton', 'Email')}</a>
            </div>
            {dialCustomer.data?.message || dialCustomer.error ? (
              <div className="brief-call-status">{dialCustomer.data?.message ?? friendlyError(dialCustomer.error)}</div>
            ) : null}
            <div className="brief-quick-actions">
              <a className="btn" href={customerDetailUrl}><ExternalLink size={12} /> {frontendCopy(override, 'customerDetailButton', 'Customer detail')}</a>
            </div>
          </aside> : null}
        </div>

        {showField('footer') ? <footer className="modal-foot" style={sectionStyle('footer', 150)}>
          {snoozeMutation.isError ? <span className="danger-text modal-foot-error">{friendlyError(snoozeMutation.error)}</span> : null}
          <button
            type="button"
            className="btn"
            onClick={() => snoozeMutation.mutate()}
            disabled={!isTaskCard || snoozeMutation.isPending || outcomeRequired}
            title="Move this follow-up to tomorrow 09:00"
          >
            <AlarmClockOff size={13} /> {snoozeMutation.isPending ? 'Snoozing' : frontendCopy(override, 'snoozeButton', 'Snooze to tomorrow')}
          </button>
          <button type="button" className="btn" onClick={callCustomer} disabled={!liveCard.phone || dialCustomer.isPending}>
            <Phone size={13} /> {dialCustomer.isPending ? 'Calling' : frontendCopy(override, 'callNowButton', 'Call now')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => outcomeRequired ? submitOutcome() : onClose()}
            disabled={outcomeMutation.isPending || (outcomeRequired && disposition === 'not_selected')}
          >
            <CheckCircle2 size={13} /> {outcomeRequired ? (disposition === 'not_selected' ? 'Select outcome' : 'Save and close') : frontendCopy(override, 'doneButton', 'Done')}
          </button>
        </footer> : null}
      </div>
  );

  if (embedded) return modalContent;

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget && !outcomeRequired) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-brief-title"
    >
      {modalContent}
    </div>
  );
}

function orderedDisplayActions(actions: string[], modalActionOrder: string[] = []) {
  const cleaned = actions.map((action) => personSafeText(action).trim()).filter(Boolean);
  if (modalActionOrder.length === 0) return uniqueActions(cleaned).slice(0, 3);
  const keyed = new Map(cleaned.map((action) => [actionKey(action), action] as const));
  const ordered = modalActionOrder
    .map((action) => keyed.get(actionKey(action)))
    .filter((action): action is string => Boolean(action));
  return uniqueActions([...ordered, ...cleaned]).slice(0, 3);
}

function actionKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clientActionId(prefix: string) {
  const value = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${value}`;
}

function uniqueActions(actions: string[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function callSignalText(detail: TaskBriefDetail | undefined) {
  const analysis = detail?.callSummary;
  if (!analysis) return 'Verified call analysis is not available yet.';
  const parts = [
    analysis.motivators.length ? `Motivators: ${analysis.motivators.map(personSafeText).join(', ')}.` : null,
    analysis.objections.length ? `Objections: ${analysis.objections.map(personSafeText).join(', ')}.` : null,
  ].filter(Boolean);
  return parts.join(' ') || 'No verified motivator or objection was captured.';
}
