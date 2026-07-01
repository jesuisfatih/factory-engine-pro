import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Phone, Mail, ExternalLink, FileText, AlarmClockOff, CheckCircle2,
  Pencil, RotateCcw, MoreHorizontal, ShoppingBag, DollarSign, Tags,
  GitBranch, XCircle, Activity, CalendarClock, StickyNote, Loader2, AlertTriangle,
} from 'lucide-react';
import { dialAircall, fetchTaskBrief, friendlyError, saveTaskNote, scheduleTaskFollowUp } from '../api/live';
import type { Card as CardData, TaskBriefDetail, TaskSource } from '../types';

interface Props {
  card: CardData;
  onClose: () => void;
}

const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: 'Manual',
  call_analysis: 'Transcript',
  segment_priority: 'Segment',
  stale_follow_up: 'Stale follow-up',
  admin_transfer: 'Admin transfer',
};

function riskTier(priority: number) {
  if (priority >= 9) return { label: 'High risk', tone: 'danger' as const };
  if (priority >= 7) return { label: 'Watch', tone: 'warn' as const };
  if (priority >= 5) return { label: 'Steady', tone: 'success' as const };
  return { label: 'Routine', tone: 'info' as const };
}

function labelize(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function workflowSourceLabel(value: string | null | undefined) {
  if (!value) return 'Automation';
  const normalized = value.toLowerCase();
  if (normalized.includes('transcript') || normalized.includes('resolver')) return 'Transcript resolver';
  if (normalized.includes('aircall')) return 'Aircall';
  if (normalized.includes('workflow') || normalized.includes('rule')) return 'Rule engine';
  return labelize(value.replace(/\bai\b/gi, 'resolver'));
}

function traceValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'empty';
  if (Array.isArray(value)) return value.length ? value.map((item) => traceValue(item)).join(', ') : '[]';
  if (typeof value === 'object') {
    try {
      const serialized = JSON.stringify(value);
      return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
    } catch {
      return 'object';
    }
  }
  const text = String(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function snapshotSegmentName(snapshot: Record<string, unknown>) {
  const segment = asRecord(snapshot.segment);
  if (typeof segment.name === 'string' && segment.name.trim()) return segment.name;
  const first = asRecord(asArray(snapshot.segments)[0]);
  return typeof first.name === 'string' && first.name.trim() ? first.name : 'None';
}

function snapshotCustomerId(snapshot: Record<string, unknown>) {
  const customer = asRecord(snapshot.customer);
  return typeof customer.id === 'string' ? customer.id : 'Not captured';
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

function briefSourceLabel(promptKey: string, promptVersion: string) {
  if (promptKey.includes('transcript')) return `Transcript resolver v${promptVersion}`;
  if (promptKey.includes('segment')) return `Segment context v${promptVersion}`;
  return `Live context v${promptVersion}`;
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
    why: liveCard.aiBrief?.whyCalling ?? '',
    upset: liveCard.aiBrief?.upsetAbout ?? '',
    goal: liveCard.aiBrief?.callGoal ?? '',
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
  const tier = riskTier(liveCard.priority);
  const workflowTrace = liveCard.workflowTrace;
  const traceItems = workflowTrace?.conditionTrace?.length
    ? workflowTrace.conditionTrace
    : workflowTrace?.whenTrace.flatMap((group) => group.conditionTrace) ?? [];
  const matchedCount = traceItems.filter((item) => item.matched).length;
  const taskStateSnapshot = asRecord(liveCard.taskStateSnapshot);
  const hasTaskStateSnapshot = Object.keys(taskStateSnapshot).length > 0;
  const snapshotOrders = asArray(taskStateSnapshot.recent_orders);
  const snapshotSegments = asArray(taskStateSnapshot.segments);
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
            <div className="brief-eyebrow">
              <span className={`brief-source brief-source-${liveCard.source}`}>
                {liveCard.source === 'manual' ? null : liveCard.source === 'admin_transfer' ? <Activity size={10} /> : <FileText size={10} />} {SOURCE_LABEL[liveCard.source]}
              </span>
              <span className={`brief-tier tier-${tier.tone}`}>{tier.label} - P{liveCard.priority}</span>
              <span className="chip" style={{ background: liveCard.segmentColor }}>{liveCard.segment}</span>
              <span className="brief-urgency">U{liveCard.urgencyScore}</span>
            </div>
            <h2 id="task-brief-title" style={{ marginTop: 6 }}>{liveCard.title}</h2>
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
                <strong>Loading live task brief</strong>
                <span>Shopify orders, call resolver output, timeline, and rule trace are being read from the API.</span>
              </div>
            )}

            {taskBriefError && (
              <div className="brief-state danger-text">
                <AlertTriangle size={16} />
                <strong>Task brief could not be loaded</strong>
                <span>{friendlyError(error)}</span>
              </div>
            )}

            {isTaskCard && !isLoading && !isError && !detail && (
              <div className="brief-state">
                <StickyNote size={16} />
                <strong>No task brief data</strong>
                <span>This task exists on the board, but the live brief endpoint returned no detail payload.</span>
              </div>
            )}

            {!taskBriefError && (
              <>
                {hasBrief ? (
                  <>
                    <NarrativeField label="Why you're calling" suggestedValue={initial.why} value={why} onChange={setWhy} multiLine />
                    <NarrativeField label="What they're upset about" suggestedValue={initial.upset} value={upset} onChange={setUpset} multiLine />
                    <NarrativeField label="Your goal" suggestedValue={initial.goal} value={goal} onChange={setGoal} multiLine />

                    {liveCard.aiBrief?.suggestedActions?.length ? (
                      <div className="brief-block">
                        <div className="brief-block-head">
                          <span className="lbl">Suggested actions</span>
                        </div>
                        <ul className="brief-actions-list">
                          {liveCard.aiBrief.suggestedActions.map((action) => <li key={action}>{action}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {liveCard.aiBrief?.transcriptSnippet ? (
                      <div className="brief-block">
                        <div className="brief-block-head">
                          <span className="lbl">Transcript snippet</span>
                        </div>
                        <div className="brief-transcript">{liveCard.aiBrief.transcriptSnippet}</div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Manual task</span>
                    </div>
                    <div className="brief-val brief-val-muted">
                      Created by an operator. Add a task note or schedule a follow-up to enrich the customer history.
                    </div>
                  </div>
                )}

                <RuleTraceBlock
                  workflowTrace={workflowTrace}
                  traceItems={traceItems}
                  matchedCount={matchedCount}
                  rule={detail?.rule ?? null}
                />

                <div className="brief-grid-two">
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Shopify detail</span>
                      {detail?.shopifyCustomer.emailMatched || detail?.shopifyCustomer.phoneMatched ? <span className="rule-trace-count">matched</span> : null}
                    </div>
                    {detail ? (
                      <>
                        <div className="brief-card-row"><span className="lbl">Customer id</span><span className="val">{detail.shopifyCustomer.customerId ?? 'Not matched'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Shopify id</span><span className="val">{detail.shopifyCustomer.shopifyCustomerId ?? 'Not synced'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Phone match</span><span className="val">{detail.shopifyCustomer.phoneMatched ? 'Yes' : 'No'}</span></div>
                        <div className="brief-card-row"><span className="lbl">Email match</span><span className="val">{detail.shopifyCustomer.emailMatched ? 'Yes' : 'No'}</span></div>
                        {detail.recentOrders.length === 0 ? (
                          <div className="brief-val brief-val-muted">No Shopify orders for this matched customer.</div>
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
                    <div className="brief-block-head">
                      <span className="lbl">Call analysis</span>
                    </div>
                    {detail?.aiPsychAnalysis ? (
                      <div className="brief-psych">
                        <div><span>Intent</span><strong>{labelize(detail.aiPsychAnalysis.communicationStyle)}</strong></div>
                        <div><span>Urgency</span><strong>{labelize(detail.aiPsychAnalysis.decisionMakingStyle)}</strong></div>
                        <div><span>Motivators</span><strong>{detail.aiPsychAnalysis.motivators.join(', ') || 'None'}</strong></div>
                        <div><span>Objections</span><strong>{detail.aiPsychAnalysis.objections.join(', ') || 'None'}</strong></div>
                        {detail.aiPsychAnalysis.talkTrack && <p>{detail.aiPsychAnalysis.talkTrack}</p>}
                      </div>
                    ) : (
                      <div className="brief-val brief-val-muted">No resolved Aircall psych analysis is attached to this customer yet.</div>
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
                            <strong>{item.title}</strong>
                            <p>{item.summary ?? 'No summary'}</p>
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
                        <span className="lbl">Task note</span>
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
                              <p>{item.body}</p>
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
              <div className="brief-card-row"><span className="lbl">Name</span><span className="val">{liveCard.title}</span></div>
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

            {hasTaskStateSnapshot && (
              <div className="brief-card brief-card-meta">
                <div className="brief-card-head"><GitBranch size={12} /> Fire-time snapshot</div>
                <div className="brief-card-row"><span className="lbl">Customer</span><span className="val">{snapshotCustomerId(taskStateSnapshot)}</span></div>
                <div className="brief-card-row"><span className="lbl">Segment</span><span className="val">{snapshotSegmentName(taskStateSnapshot)}</span></div>
                <div className="brief-card-row"><span className="lbl">Segments</span><span className="val">{snapshotSegments.length}</span></div>
                <div className="brief-card-row"><span className="lbl">Recent orders</span><span className="val">{snapshotOrders.length}</span></div>
              </div>
            )}

            {hasBrief && liveCard.aiBrief && (
              <div className="brief-card brief-card-meta">
                <div className="brief-card-head"><FileText size={12} /> Brief metadata</div>
                <div className="brief-card-row"><span className="lbl">Source</span><span className="val">{briefSourceLabel(liveCard.aiBrief.promptKey, liveCard.aiBrief.promptVersion)}</span></div>
                <div className="brief-card-row"><span className="lbl">Confidence</span><span className="val">{Math.round(liveCard.aiBrief.confidence * 100)}%</span></div>
              </div>
            )}

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

function RuleTraceBlock({
  workflowTrace,
  traceItems,
  matchedCount,
  rule,
}: {
  workflowTrace: CardData['workflowTrace'];
  traceItems: NonNullable<CardData['workflowTrace']>['conditionTrace'];
  matchedCount: number;
  rule: TaskBriefDetail['rule'];
}) {
  return (
    <div className="brief-block rule-trace-block">
      <div className="brief-block-head">
        <span className="lbl">Why this task</span>
        {workflowTrace ? <span className="rule-trace-count">{matchedCount}/{traceItems.length} matched</span> : null}
      </div>
      {workflowTrace ? (
        <>
          <div className="rule-trace-meta">
            <span><GitBranch size={11} /> {rule?.name ?? workflowTrace.ruleName ?? workflowTrace.matchedRuleId ?? workflowTrace.ruleId}</span>
            <span>{labelize(workflowTrace.trigger)}</span>
            <span>{workflowSourceLabel(workflowTrace.source)}</span>
            {rule ? (
              <a href={rule.canvasUrl} className="rule-canvas-link">
                <ExternalLink size={11} /> Open rule canvas
              </a>
            ) : null}
          </div>
          {traceItems.length ? (
            <div className="rule-trace-list">
              {traceItems.map((trace, index) => (
                <div className={`rule-trace-row${trace.matched ? ' matched' : ' missed'}`} key={`${trace.id}-${index}`}>
                  <div className="rule-trace-status" title={trace.matched ? 'Matched' : 'Not matched'}>
                    {trace.matched ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  </div>
                  <div className="rule-trace-content">
                    <div className="rule-trace-condition">
                      <strong>{labelize(trace.condition)}</strong>
                      <span>{trace.operator}</span>
                    </div>
                    <div className="rule-trace-values">
                      <span>Expected <strong>{traceValue(trace.expected)}</strong></span>
                      <span>Actual <strong>{traceValue(trace.actual)}</strong></span>
                    </div>
                    <div className="rule-trace-source">{workflowSourceLabel(trace.source)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="brief-val brief-val-muted">Rule metadata is present, but condition-level trace entries are not saved.</div>
          )}
        </>
      ) : (
        <div className="brief-val brief-val-muted">No rule trace is saved for this task.</div>
      )}
    </div>
  );
}
