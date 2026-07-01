import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Phone, Mail, ExternalLink, AlarmClockOff, CheckCircle2,
  Pencil, RotateCcw, MoreHorizontal, ShoppingBag, DollarSign, Tags,
  Activity, CalendarClock, StickyNote, Loader2, AlertTriangle,
} from 'lucide-react';
import { dialAircall, fetchTaskBrief, friendlyError, saveTaskNote, scheduleTaskFollowUp } from '../api/live';
import type { Card as CardData, TaskBriefDetail } from '../types';
import { humanize, personSafeText, staffActionLabel, staffActionTone, staffBriefLine } from '../lib/personTerminology';

interface Props {
  card: CardData;
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

export function TaskBriefModal({ card, onClose }: Props) {
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
  const loadingTaskBrief = isTaskCard && isLoading;
  const taskBriefError = isTaskCard && isError;
  const hasBrief = liveCard.source !== 'manual' && liveCard.aiBrief;
  const customerDetailUrl = detail?.customerDetailUrl ?? (liveCard.customerId ? `/staff/customers?customerId=${encodeURIComponent(liveCard.customerId)}` : '#');
  const initial = useMemo(() => ({
    why: personSafeText(liveCard.aiBrief?.whyCalling),
    upset: personSafeText(liveCard.aiBrief?.upsetAbout),
    goal: personSafeText(liveCard.aiBrief?.callGoal),
  }), [liveCard.aiBrief]);
  const [why, setWhy] = useState(initial.why);
  const [upset, setUpset] = useState(initial.upset);
  const [goal, setGoal] = useState(initial.goal);
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => initialScheduleValue());
  const [scheduleNote, setScheduleNote] = useState('');
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
  const actionTone = staffActionTone(actionInput);
  const actionLabel = staffActionLabel(actionInput);
  const primaryBrief = staffBriefLine(actionInput);
  const directActions = directiveActions(actionLabel, liveCard.phone, liveCard.aiBrief?.suggestedActions);
  const callSignal = callSignalText(detail);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-brief-title"
    >
      <div className="modal-card brief-modal" role="document">
        <header className="modal-head">
          <div>
            <h2 id="task-brief-title">{personSafeText(liveCard.title)}</h2>
            <div className="brief-identity">
              {liveCard.phone && <span><Phone size={11} /> {liveCard.phone}</span>}
              {liveCard.email && <span><Mail size={11} /> {liveCard.email}</span>}
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
              <div className="brief-state">
                <Loader2 size={16} className="spin" />
                <strong>Loading live call plan</strong>
                <span>Customer orders, call notes, and timeline are being read from the API.</span>
              </div>
            )}

            {taskBriefError && (
              <div className="brief-state danger-text">
                <AlertTriangle size={16} />
                <strong>Call plan could not be loaded</strong>
                <span>{friendlyError(error)}</span>
              </div>
            )}

            {isTaskCard && !isLoading && !isError && !detail && (
              <div className="brief-state">
                <StickyNote size={16} />
                <strong>No call plan data</strong>
                <span>This follow-up exists on the board, but the live detail endpoint returned no context payload.</span>
              </div>
            )}

            {!taskBriefError && (
              <>
                {hasBrief ? (
                  <>
                    <section className={`brief-command tone-${actionTone}`}>
                      <div className="brief-command-main">
                        <span>Do this now</span>
                        <strong>{actionLabel}</strong>
                        <p>{primaryBrief}</p>
                      </div>
                      <div className="brief-command-score">U{liveCard.urgencyScore}</div>
                    </section>

                    <div className="brief-directives">
                      {directActions.map((action, index) => (
                        <div key={`${action}-${index}`} className="brief-directive">
                          <span>{index + 1}</span>
                          <strong>{action}</strong>
                        </div>
                      ))}
                    </div>

                    <NarrativeField label="Reason for this call" suggestedValue={initial.why} value={why} onChange={setWhy} multiLine />
                    <NarrativeField label="Customer mood or issue" suggestedValue={initial.upset} value={upset} onChange={setUpset} multiLine />
                    <NarrativeField label="Outcome required" suggestedValue={initial.goal} value={goal} onChange={setGoal} multiLine />

                    {liveCard.aiBrief?.suggestedActions?.length ? (
                      <div className="brief-block">
                        <div className="brief-block-head">
                          <span className="lbl">Extra checks</span>
                        </div>
                        <ul className="brief-actions-list">
                          {liveCard.aiBrief.suggestedActions.map((action) => <li key={action}>{personSafeText(action)}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {liveCard.aiBrief?.transcriptSnippet ? (
                      <div className="brief-block">
                        <div className="brief-block-head">
                          <span className="lbl">Call excerpt</span>
                        </div>
                        <div className="brief-transcript">{liveCard.aiBrief.transcriptSnippet}</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Manual follow-up</span>
                    </div>
                    <div className="brief-val brief-val-muted">
                      Created by an operator. Add a task note or schedule a follow-up to enrich the customer history.
                    </div>
                  </div>
                )}

                <div className="brief-grid-two">
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Customer purchase history</span>
                      {detail?.shopifyCustomer.emailMatched || detail?.shopifyCustomer.phoneMatched ? <span className="rule-trace-count">linked</span> : null}
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
                  </div>

                  <div className="brief-block">
                    <div className="brief-block-head"><span className="lbl">Call summary</span></div>
                    {detail?.aiPsychAnalysis ? (
                      <div className="brief-psych">
                        <div><span>Intent</span><strong>{labelize(detail.aiPsychAnalysis.communicationStyle)}</strong></div>
                        <div><span>Urgency</span><strong>{labelize(detail.aiPsychAnalysis.decisionMakingStyle)}</strong></div>
                        <div><span>Motivators</span><strong>{detail.aiPsychAnalysis.motivators.join(', ') || 'None'}</strong></div>
                        <div><span>Objections</span><strong>{detail.aiPsychAnalysis.objections.join(', ') || 'None'}</strong></div>
                        <p>{callSignal}</p>
                      </div>
                    ) : (
                      <div className="brief-val brief-val-muted">No call summary is attached to this customer yet.</div>
                    )}
                  </div>
                </div>

                <div className="brief-block">
                  <div className="brief-block-head">
                    <span className="lbl">Order, call, and task history</span>
                    {detail ? <span className="rule-trace-count">{detail.timeline.length}</span> : null}
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
                </div>

                {isTaskCard ? (
                  <>
                    <form className="brief-block" onSubmit={submitNote}>
                      <div className="brief-block-head">
                        <span className="lbl">Follow-up note</span>
                        {detail ? <span className="rule-trace-count">{detail.notes.length} saved</span> : null}
                      </div>
                      <textarea
                        className="brief-edit"
                        rows={3}
                        placeholder="Save a task note to customer history..."
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <div className="brief-form-actions">
                        <span className={noteMutation.isError ? 'danger-text' : ''}>{noteMutation.isError ? friendlyError(noteMutation.error) : 'Persisted to this customer task thread.'}</span>
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

                    <form className="brief-block" onSubmit={submitSchedule}>
                      <div className="brief-block-head">
                        <span className="lbl">Calendar action</span>
                      </div>
                      <div className="brief-schedule-grid">
                        <input className="brief-edit" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                        <input className="brief-edit" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Follow-up note" />
                        <button type="submit" className="btn" disabled={!scheduleAt || scheduleMutation.isPending}>
                          <CalendarClock size={12} /> {scheduleMutation.isPending ? 'Scheduling' : 'Schedule'}
                        </button>
                      </div>
                      {scheduleMutation.isError ? <div className="danger-text">{friendlyError(scheduleMutation.error)}</div> : null}
                    </form>
                  </>
                ) : null}
              </>
            )}
          </div>

          <aside className="brief-side">
            <div className="brief-card">
              <div className="brief-card-head"><Tags size={12} /> Customer</div>
              <div className="brief-card-row"><span className="lbl">Name</span><span className="val">{personSafeText(liveCard.title)}</span></div>
              {liveCard.email && <div className="brief-card-row"><span className="lbl">Email</span><span className="val">{liveCard.email}</span></div>}
              {liveCard.phone && <div className="brief-card-row"><span className="lbl">Phone</span><span className="val">{liveCard.phone}</span></div>}
              <div className="brief-card-row"><span className="lbl">Segment</span><span className="val">{liveCard.segment}</span></div>
            </div>

            <div className="brief-stats">
              <div className="brief-stat">
                <ShoppingBag size={11} />
                <div><div className="lbl">Orders</div><div className="val">{liveCard.ordersCount ?? 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <DollarSign size={11} />
                <div><div className="lbl">LTV</div><div className="val">{liveCard.totalSpent ? fmtMoney(liveCard.totalSpent) : 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <Activity size={11} />
                <div><div className="lbl">30d revenue</div><div className="val">{performance ? fmtMoney(performance.revenue) : 'N/A'}</div></div>
              </div>
              <div className="brief-stat">
                <Phone size={11} />
                <div><div className="lbl">30d calls</div><div className="val">{performance?.calls ?? 'N/A'}</div></div>
              </div>
            </div>

            <div className="brief-quick-actions">
              <button type="button" className="btn" onClick={callCustomer} disabled={!liveCard.phone || dialCustomer.isPending}><Phone size={12} /> {dialCustomer.isPending ? 'Calling' : 'Call'}</button>
              <a className="btn" href={liveCard.email ? `mailto:${liveCard.email}` : undefined}><Mail size={12} /> Email</a>
            </div>
            {dialCustomer.data?.message || dialCustomer.error ? (
              <div className="brief-call-status">{dialCustomer.data?.message ?? friendlyError(dialCustomer.error)}</div>
            ) : null}
            <div className="brief-quick-actions">
              <a className="btn" href={customerDetailUrl}><ExternalLink size={12} /> Customer detail</a>
            </div>
          </aside>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn"><MoreHorizontal size={13} /> More</button>
          <button type="button" className="btn"><AlarmClockOff size={13} /> Snooze</button>
          <button type="button" className="btn" onClick={callCustomer} disabled={!liveCard.phone || dialCustomer.isPending}><Phone size={13} /> Call now</button>
          <button type="button" className="btn primary" onClick={onClose}>
            <CheckCircle2 size={13} /> Done
          </button>
        </footer>
      </div>
    </div>
  );
}

function directiveActions(actionLabel: string, phone: string | undefined, suggestedActions: string[] | undefined) {
  const normalized = actionLabel.toLowerCase();
  const callStep = phone ? `Call ${phone} now.` : 'Find a valid phone number before closing this follow-up.';
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
  const cleaned = (suggestedActions ?? []).map((action) => personSafeText(action).trim()).filter(Boolean);
  return [callStep, ...cleaned, 'Save the result before leaving this screen.'].slice(0, 4);
}

function callSignalText(detail: TaskBriefDetail | undefined) {
  const analysis = detail?.aiPsychAnalysis;
  if (!analysis) return 'No call signal is attached yet. Use the action plan above and save the result.';
  const parts = [
    analysis.motivators.length ? `Motivators: ${analysis.motivators.map(personSafeText).join(', ')}.` : null,
    analysis.objections.length ? `Objections: ${analysis.objections.map(personSafeText).join(', ')}.` : null,
  ].filter(Boolean);
  return parts.join(' ') || 'No strong motivator or objection was captured. Use the action plan above.';
}
