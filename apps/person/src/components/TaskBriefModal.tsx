import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FrontendCustomizationRuntimeDto } from '@factory-engine-pro/contracts';
import {
  X, Phone, Mail, ExternalLink, AlarmClockOff, CheckCircle2,
  Pencil, RotateCcw, MoreHorizontal, ShoppingBag, DollarSign, Tags,
  Activity, CalendarClock, StickyNote, Loader2, AlertTriangle,
} from 'lucide-react';
import { dialAircall, fetchTaskBrief, friendlyError, saveTaskNote, scheduleTaskFollowUp } from '../api/live';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible, frontendModalSectionStyle, FrontendCustomizationSlotView } from './FrontendCustomization';
import type { Card as CardData, TaskBriefDetail } from '../types';
import { humanize, personSafeText, staffActionLabel, staffActionTone, staffBriefLine } from '../lib/personTerminology';

interface Props {
  card: CardData;
  customization?: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
  onClose: () => void;
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

function dateTimeLocal(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function initialScheduleValue() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setMinutes(0, 0, 0);
  if (value.getHours() < 9) value.setHours(9);
  if (value.getHours() > 17) value.setHours(17);
  return dateTimeLocal(value);
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

export function TaskBriefModal({ card, customization, summary, onClose }: Props) {
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
  const sectionStyle = (section: Parameters<typeof frontendModalSectionStyle>[1], fallbackOrder: number) => frontendModalSectionStyle(override, section, fallbackOrder);
  const showField = (field: Parameters<typeof frontendFieldVisible>[1], defaultVisible = true) => frontendFieldVisible(override, field, defaultVisible);
  const loadingTaskBrief = isTaskCard && isLoading;
  const taskBriefError = isTaskCard && isError;
  const hasBrief = liveCard.source !== 'manual' && Boolean(liveCard.displayReason || liveCard.displayOutcome || liveCard.displayActions.length > 0);
  const customerDetailUrl = detail?.customerDetailUrl ?? (liveCard.customerId ? `/staff/customers?customerId=${encodeURIComponent(liveCard.customerId)}` : '#');
  const initial = useMemo(() => ({
    why: personSafeText(liveCard.displayReason || 'Review the customer context before calling.'),
    upset: personSafeText(liveCard.displayConcern || 'No customer concern captured yet.'),
    goal: personSafeText(liveCard.displayOutcome || 'Save the next customer outcome.'),
  }), [liveCard.displayConcern, liveCard.displayOutcome, liveCard.displayReason]);
  const [why, setWhy] = useState(initial.why);
  const [upset, setUpset] = useState(initial.upset);
  const [goal, setGoal] = useState(initial.goal);
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => initialScheduleValue());
  const [scheduleNote, setScheduleNote] = useState('');
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const scheduleRef = useRef<HTMLInputElement | null>(null);
  const dialCustomer = useMutation({
    mutationFn: dialAircall,
    onSuccess: (result) => {
      if (result.mode === 'tel_fallback') window.location.assign(result.telHref);
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
      source: 'task_brief',
    });
  };

  useEffect(() => {
    setWhy(initial.why);
    setUpset(initial.upset);
    setGoal(initial.goal);
  }, [initial]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

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
      queryClient.invalidateQueries({ queryKey: ['person', 'calendar'] });
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
  const actionInput = {
    intent: liveCard.callIntent ?? liveCard.urgencyBreakdown.intent,
    tags: liveCard.psychTags,
    upset,
    goal,
    summary: why || liveCard.summary,
    urgencyScore: liveCard.urgencyScore,
  };
  const primaryBadge = liveCard.displayBadges[0];
  const actionTone = displayToneClass(primaryBadge?.tone ?? staffActionTone(actionInput));
  const actionLabel = primaryBadge?.label ?? staffActionLabel(actionInput);
  const primaryBrief = liveCard.displayOutcome || staffBriefLine(actionInput);
  const ctaPriority = liveCard.ctaPriority ?? [];
  const modalActionOrder = liveCard.modalActionOrder ?? [];
  const directActions = liveCard.displayActions.length > 0
    ? orderedDisplayActions(liveCard.displayActions, modalActionOrder)
    : directiveActions(actionLabel, liveCard.phone, undefined, modalActionOrder);
  const footerActions = orderedFooterActions(ctaPriority);
  const callSignal = callSignalText(detail);
  const customerMatched = Boolean(liveCard.customerId || detail?.shopifyCustomer.customerId || detail?.shopifyCustomer.phoneMatched || detail?.shopifyCustomer.emailMatched);
  const purchaseSummary = liveCard.displayCommerceSnapshot || (latestOrder
    ? `${latestOrder.orderNumber ?? latestOrder.id} - ${fmtMoney(latestOrder.totalPrice, latestOrder.currency)}`
    : liveCard.ordersCount
      ? `${liveCard.ordersCount} orders - ${fmtMoney(liveCard.totalSpent ?? 0)}`
      : 'No linked Shopify order yet');
  const confidenceLabel = 'Live data';
  const matchLabel = customerMatched ? 'Matched customer' : 'Caller not matched yet';
  const matchHint = customerMatched
    ? 'Use order and note history before calling.'
    : 'Confirm phone or email before promising order, refund, or pricing details.';
  const summarySignals = detail?.callSummary?.motivators.map(personSafeText).filter(Boolean) ?? [];
  const summaryFriction = detail?.callSummary?.objections.map(personSafeText).filter(Boolean) ?? [];
  const summaryChecks = liveCard.displayActions.length > 0 ? liveCard.displayActions : directActions;
  const callExcerpt = personSafeText(liveCard.callExcerpt);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-brief-title"
    >
      <div className={`modal-card brief-modal ${frontendElementClassName(override, liveCard.urgencyScore)}`} role="document">
        <header className="modal-head">
          <div>
            {showField('title') ? <h2 id="task-brief-title">{personSafeText(liveCard.displayTitle || liveCard.title)}</h2> : null}
            <div className="brief-identity">
              {liveCard.phone && showField('phone') ? <span><Phone size={11} /> {liveCard.phone}</span> : null}
              {liveCard.email && showField('email') ? <span><Mail size={11} /> {liveCard.email}</span> : null}
              {latestOrder && <span><ShoppingBag size={11} /> {latestOrder.orderNumber ?? latestOrder.id} {fmtMoney(latestOrder.totalPrice, latestOrder.currency)}</span>}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
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
                    <section className={`brief-showcase tone-${actionTone}`} style={sectionStyle('hero', 10)}>
                      <div className="brief-showcase-main">
                        <span className="brief-showcase-kicker">{frontendCopy(override, 'heroKicker', 'Do this now')}</span>
                        <h3>{frontendCopy(override, 'actionLabel', actionLabel)}</h3>
                        <p>{frontendCopy(override, 'requiredAction', primaryBrief)}</p>
                        {showField('steps') ? (
                          <div className="brief-showcase-actions">
                            {directActions.slice(0, 3).map((action, index) => (
                              <div key={`${action}-${index}`} className="brief-showcase-step">
                                <span>{index + 1}</span>
                                <strong>{action}</strong>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="brief-showcase-score">
                        <span>{frontendCopy(override, 'urgencyLabel', 'Urgency')}</span>
                        <strong>U{liveCard.urgencyScore}</strong>
                        <em>{confidenceLabel}</em>
                      </div>
                    </section>
                    <div className="brief-section-shell" style={sectionStyle('customHero', 20)}>
                      <FrontendCustomizationSlotView customization={customization} slot="modal.hero" context={customizationContext} />
                    </div>

                    {showField('snapshotGrid') ? <div className="brief-snapshot-grid" style={sectionStyle('snapshotGrid', 30)}>
                      <div className="brief-snapshot-card snapshot-call">
                        <span>{frontendCopy(override, 'whatHappenedLabel', 'What happened')}</span>
                        <strong>{why || primaryBrief}</strong>
                      </div>
                      <div className="brief-snapshot-card snapshot-match">
                        <span>{frontendCopy(override, 'customerMatchLabel', 'Customer match')}</span>
                        <strong>{matchLabel}</strong>
                        <em>{matchHint}</em>
                      </div>
                      <div className="brief-snapshot-card snapshot-order">
                        <span>{frontendCopy(override, 'purchaseHistoryLabel', 'Purchase history')}</span>
                        <strong>{purchaseSummary}</strong>
                      </div>
                      <div className="brief-snapshot-card snapshot-outcome">
                        <span>{frontendCopy(override, 'outcomeLabel', 'Outcome to save')}</span>
                        <strong>{goal || 'Save the next accountable result.'}</strong>
                      </div>
                    </div> : null}
                    <div className="brief-section-shell" style={sectionStyle('customAfterSteps', 35)}>
                      <FrontendCustomizationSlotView customization={customization} slot="modal.after_steps" context={customizationContext} />
                    </div>

                    {showField('reasonField') ? <div style={sectionStyle('reasonField', 40)}><NarrativeField label={frontendCopy(override, 'reasonLabel', 'Reason for this call')} suggestedValue={initial.why} value={why} onChange={setWhy} multiLine /></div> : null}
                    {showField('moodField') ? <div style={sectionStyle('moodField', 50)}><NarrativeField label={frontendCopy(override, 'moodLabel', 'Customer mood or issue')} suggestedValue={initial.upset} value={upset} onChange={setUpset} multiLine /></div> : null}
                    {showField('outcomeField') ? <div style={sectionStyle('outcomeField', 60)}><NarrativeField label={frontendCopy(override, 'outcomeRequiredLabel', 'Outcome required')} suggestedValue={initial.goal} value={goal} onChange={setGoal} multiLine /></div> : null}

                    {directActions.length && showField('extraChecks') ? (
                      <div className="brief-block" style={sectionStyle('extraChecks', 70)}>
                        <div className="brief-block-head">
                          <span className="lbl">{frontendCopy(override, 'extraChecksLabel', 'Extra checks')}</span>
                        </div>
                        <ul className="brief-actions-list">
                          {directActions.map((action) => <li key={action}>{personSafeText(action)}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {callExcerpt && showField('callExcerpt') ? (
                      <div className="brief-block" style={sectionStyle('callExcerpt', 80)}>
                        <div className="brief-block-head">
                          <span className="lbl">{frontendCopy(override, 'callExcerptLabel', 'Call excerpt')}</span>
                        </div>
                        <div className="brief-transcript">{callExcerpt}</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Manual follow-up</span>
                    </div>
                    <div className="brief-val brief-val-muted">
                      Created by an operator. Add a follow-up note or schedule the next outreach to enrich the customer history.
                    </div>
                  </div>
                )}

                {(showField('purchaseHistory') || showField('callSummary')) ? <div className="brief-grid-two">
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
                        <div><span>Next step</span><strong>{personSafeText(liveCard.displayOutcome || primaryBrief || 'Save the next customer outcome')}</strong></div>
                        <div><span>Checks</span><strong>{summaryChecks.slice(0, 3).map(personSafeText).join(', ') || 'Review order and call context'}</strong></div>
                        <div><span>Signals</span><strong>{summarySignals.join(', ') || 'None captured'}</strong></div>
                        <div><span>Friction</span><strong>{summaryFriction.join(', ') || 'None captured'}</strong></div>
                        <p>{personSafeText(liveCard.displayReason || callSignal)}</p>
                      </div>
                    ) : (
                      <div className="brief-val brief-val-muted">No call summary is attached to this customer yet.</div>
                    )}
                  </div> : null}
                </div> : null}
                <div className="brief-section-shell" style={sectionStyle('customCustomerContext', 105)}>
                  <FrontendCustomizationSlotView customization={customization} slot="modal.customer_context" context={customizationContext} />
                </div>

                {showField('timeline') ? <div className="brief-block" style={sectionStyle('timeline', 110)}>
                  <div className="brief-block-head">
                    <span className="lbl">{frontendCopy(override, 'timelineLabel', 'Order, call, and follow-up history')}</span>
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

                {isTaskCard ? (
                  <>
                    {showField('noteForm') ? <form className="brief-block" style={sectionStyle('noteForm', 120)} onSubmit={submitNote}>
                      <div className="brief-block-head">
                        <span className="lbl">{frontendCopy(override, 'noteLabel', 'Follow-up note')}</span>
                        {detail ? <span className="brief-count-pill">{detail.notes.length} saved</span> : null}
                      </div>
                      <textarea
                        ref={noteRef}
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
                    </form> : null}

                    {showField('scheduleForm') ? <form className="brief-block" style={sectionStyle('scheduleForm', 130)} onSubmit={submitSchedule}>
                      <div className="brief-block-head">
                        <span className="lbl">{frontendCopy(override, 'calendarLabel', 'Calendar action')}</span>
                      </div>
                      <div className="brief-schedule-grid">
                        <input ref={scheduleRef} id="task-schedule-input" className="brief-edit" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                        <input className="brief-edit" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Follow-up note" />
                        <button type="submit" className="btn" disabled={!scheduleAt || scheduleMutation.isPending}>
                          <CalendarClock size={12} /> {scheduleMutation.isPending ? 'Scheduling' : 'Schedule'}
                        </button>
                      </div>
                      {scheduleMutation.isError ? <div className="danger-text">{friendlyError(scheduleMutation.error)}</div> : null}
                    </form> : null}
                  </>
                ) : null}
              </>
            )}
          </div>

          {showField('customerSidePanel') ? <aside className="brief-side" style={sectionStyle('customerSidePanel', 140)}>
            <div className="brief-card">
              <div className="brief-card-head"><Tags size={12} /> {frontendCopy(override, 'customerLabel', 'Customer')}</div>
              <div className="brief-card-row"><span className="lbl">Name</span><span className="val">{personSafeText(liveCard.displayTitle || liveCard.title)}</span></div>
              {liveCard.email && <div className="brief-card-row"><span className="lbl">Email</span><span className="val">{liveCard.email}</span></div>}
              {liveCard.phone && <div className="brief-card-row"><span className="lbl">Phone</span><span className="val">{liveCard.phone}</span></div>}
              <div className="brief-card-row"><span className="lbl">Context</span><span className="val">{personSafeText(liveCard.displayCustomerSummary || liveCard.segment)}</span></div>
            </div>

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
          {footerActions.map((action) => {
            if (action === 'call') {
              return <button key={action} type="button" className="btn" onClick={callCustomer} disabled={!liveCard.phone || dialCustomer.isPending}><Phone size={13} /> {frontendCopy(override, 'callNowButton', 'Call now')}</button>;
            }
            if (action === 'note') {
              return <button key={action} type="button" className="btn" onClick={() => noteRef.current?.focus()}><StickyNote size={13} /> {frontendCopy(override, 'noteButton', 'Note')}</button>;
            }
            if (action === 'schedule') {
              return <button key={action} type="button" className="btn" onClick={() => scheduleRef.current?.focus()}><CalendarClock size={13} /> {frontendCopy(override, 'scheduleButton', 'Schedule')}</button>;
            }
            if (action === 'email') {
              return <a key={action} className="btn" href={liveCard.email ? `mailto:${liveCard.email}` : undefined}><Mail size={13} /> {frontendCopy(override, 'emailButton', 'Email')}</a>;
            }
            if (action === 'customer_detail') {
              return <a key={action} className="btn" href={customerDetailUrl}><ExternalLink size={13} /> {frontendCopy(override, 'customerDetailButton', 'Customer detail')}</a>;
            }
            if (action === 'snooze') {
              return <button key={action} type="button" className="btn"><AlarmClockOff size={13} /> Snooze</button>;
            }
            if (action === 'done') {
              return <button key={action} type="button" className="btn primary" onClick={onClose}><CheckCircle2 size={13} /> {frontendCopy(override, 'doneButton', 'Done')}</button>;
            }
            return <button key={action} type="button" className="btn"><MoreHorizontal size={13} /> More</button>;
          })}
        </footer> : null}
      </div>
    </div>
  );
}

function displayToneClass(tone: string | undefined) {
  if (tone === 'warning') return 'warn';
  if (tone === 'danger' || tone === 'success' || tone === 'info') return tone;
  return 'info';
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

function directiveActions(actionLabel: string, phone: string | undefined, suggestedActions: string[] | undefined, modalActionOrder: string[] = []) {
  const normalized = actionLabel.toLowerCase();
  const callStep = phone ? `Call ${phone} now.` : 'Find a valid phone number before closing this follow-up.';
  const cleaned = (suggestedActions ?? []).map((action) => personSafeText(action).trim()).filter(Boolean);
  const ordered = modalActionOrder
    .map((action) => modalActionText(action, callStep, cleaned))
    .filter((action): action is string => Boolean(action));
  if (ordered.length >= 2) return uniqueActions(ordered).slice(0, 3);
  if (cleaned.length >= 2) return [callStep, ...cleaned].slice(0, 3);
  if (normalized.includes('payment') || normalized.includes('refund')) {
    return [
      callStep,
      'Ask for the order number and the exact refund, payment, or pricing issue.',
      'Tell the customer the next accountable step and save the outcome note.',
    ];
  }
  if (normalized.includes('delivery')) {
    return [
      callStep,
      'Ask for the order or tracking number first.',
      'Give one clear shipping update path, then save what you promised.',
    ];
  }
  if (normalized.includes('callback')) {
    return [
      callStep,
      'Ask what decision, order, or question is still pending.',
      'Do not close this until the answer or next callback time is saved.',
    ];
  }
  if (normalized.includes('purchase')) {
    return [
      callStep,
      'Ask product need, quantity, timing, and budget.',
      'Set the next purchase step: quote, order, sample, or scheduled follow-up.',
    ];
  }
  if (normalized.includes('concern')) {
    return [
      callStep,
      'Let the customer explain the issue without arguing.',
      'Repeat the issue back, assign the next owner, and save the exact promise.',
    ];
  }
  return [callStep, ...cleaned, 'Save the result before leaving this screen.'].slice(0, 4);
}

function modalActionText(action: string, callStep: string, suggestedActions: string[]) {
  const firstSuggested = suggestedActions[0] ?? 'Review the customer context before calling.';
  const secondSuggested = suggestedActions[1] ?? 'Ask the customer what is still pending.';
  const map: Record<string, string> = {
    call_customer: callStep,
    confirm_need: secondSuggested,
    capture_outcome: 'Save the exact result before leaving this follow-up.',
    check_order: 'Check the latest Shopify order before promising a next step.',
    schedule_follow_up: 'Schedule the next follow-up time if the customer is not ready now.',
    add_note: 'Add a clear internal note with the promise, owner, and next date.',
    review_context: firstSuggested,
    review_shopify_orders: 'Review Shopify order history before discussing price, refund, or reorder details.',
    open_customer_history: 'Open the customer history and scan recent calls, notes, and orders.',
    ask_specific_question: secondSuggested,
    state_reason: firstSuggested,
    confirm_next_step: 'Confirm the single next accountable step with the customer.',
    save_outcome: 'Save the outcome so the next person sees exactly what happened.',
    archive_if_not_needed: 'Archive only if the call has no real customer follow-up need.',
  };
  return map[action];
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

function orderedFooterActions(ctaPriority: string[]) {
  const supported = ['call', 'note', 'schedule', 'email', 'customer_detail', 'snooze', 'done', 'more'];
  const defaults = ['more', 'snooze', 'call', 'done'];
  const ordered = [...ctaPriority, ...defaults].filter((action) => supported.includes(action));
  const seen = new Set<string>();
  return ordered.filter((action) => {
    if (seen.has(action)) return false;
    seen.add(action);
    return true;
  }).slice(0, 5);
}

function callSignalText(detail: TaskBriefDetail | undefined) {
  const analysis = detail?.callSummary;
  if (!analysis) return 'No call signal is attached yet. Use the action plan above and save the result.';
  const parts = [
    analysis.motivators.length ? `Motivators: ${analysis.motivators.map(personSafeText).join(', ')}.` : null,
    analysis.objections.length ? `Objections: ${analysis.objections.map(personSafeText).join(', ')}.` : null,
  ].filter(Boolean);
  return parts.join(' ') || 'No strong motivator or objection was captured. Use the action plan above.';
}
