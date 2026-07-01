import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, FileText, X, Phone, ExternalLink,
  Clock, AlarmClockOff, Loader2, StickyNote,
} from 'lucide-react';
import { dialAircall, fetchCalEvents, friendlyError, saveTaskNote, scheduleTaskFollowUp, type EventSource, type CalEvent } from '../api/live';
import { QueryState } from '../components/QueryState';
import { personSafeText, taskSourceLabel } from '../lib/personTerminology';

const SOURCE_LABEL: Record<EventSource, string> = {
  manual: taskSourceLabel('manual'),
  call_analysis: taskSourceLabel('call_analysis'),
  segment_priority: taskSourceLabel('segment_priority'),
  stale_follow_up: taskSourceLabel('stale_follow_up'),
  admin_transfer: taskSourceLabel('admin_transfer'),
};

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function weekDaysFrom(startMs: number) {
  const days: { iso: string; label: string; dayNum: number; isToday: boolean }[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(startMs + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      iso,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      isToday: iso === todayIso,
    });
  }
  return days;
}

export function CalendarView() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<number>(() => startOfWeek(new Date()).getTime());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [scheduleAt, setScheduleAt] = useState(() => dateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [scheduleNote, setScheduleNote] = useState('');

  const { data: events = [], isLoading, error } = useQuery({ queryKey: ['person', 'cal', 'events'], queryFn: fetchCalEvents });

  const days = useMemo(() => weekDaysFrom(weekStart), [weekStart]);

  const cellFor = (iso: string, hour: number) =>
    events.filter((event) => event.dayIso === iso && event.startHour === hour);

  const weekLabel = useMemo(() => {
    const start = new Date(weekStart);
    const end = new Date(weekStart + 6 * 86_400_000);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)} ${end.getFullYear()}`;
  }, [weekStart]);

  const assistedCount = events.filter((event) => event.source !== 'manual').length;
  const selected: CalEvent | null = events.find((event) => event.id === selectedId) ?? null;
  const selectedTaskId = selected ? taskIdFromEvent(selected) : null;
  const selectedCustomerUrl = selected?.customerId ? `/staff/customers?customerId=${encodeURIComponent(selected.customerId)}` : null;
  const selectedTaskUrl = selectedTaskId ? `/staff/queue?taskId=${encodeURIComponent(selectedTaskId)}` : null;
  const noteMutation = useMutation({
    mutationFn: () => {
      if (!selectedTaskId) throw new Error('This calendar event is not linked to a task.');
      return saveTaskNote(selectedTaskId, { body: note.trim() });
    },
    onSuccess: () => {
      setNote('');
      void qc.invalidateQueries({ queryKey: ['person', 'notes'] });
      void qc.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
    },
  });
  const scheduleMutation = useMutation({
    mutationFn: () => {
      if (!selectedTaskId) throw new Error('This calendar event is not linked to a task.');
      return scheduleTaskFollowUp(selectedTaskId, {
        scheduledAt: new Date(scheduleAt).toISOString(),
        note: scheduleNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      setScheduleNote('');
      void qc.invalidateQueries({ queryKey: ['person', 'cal', 'events'] });
      void qc.invalidateQueries({ queryKey: ['person', 'daily-operations'] });
    },
  });
  const dialCustomer = useMutation({
    mutationFn: dialAircall,
    onSuccess: (result) => {
      if (result.mode === 'tel_fallback') window.location.assign(result.telHref);
    },
  });

  useEffect(() => {
    setNote('');
    setScheduleNote('');
    setScheduleAt(dateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  }, [selectedId]);

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTaskId || !note.trim()) return;
    noteMutation.mutate();
  };

  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedTaskId || !scheduleAt) return;
    scheduleMutation.mutate();
  };

  return (
    <>
      <div className="page-head">
        <h2>Calendar</h2>
        <div className="sub">Your week - customer calls and follow-ups open their brief on click</div>
      </div>

      <div className="cal-shell">
        <div className="cal-toolbar">
          <button type="button" className="nav-btn" onClick={() => setWeekStart((value) => value - 7 * 86_400_000)}>
            <ChevronLeft size={14} />
          </button>
          <button type="button" className="today-btn" onClick={() => setWeekStart(startOfWeek(new Date()).getTime())}>
            Today
          </button>
          <button type="button" className="nav-btn" onClick={() => setWeekStart((value) => value + 7 * 86_400_000)}>
            <ChevronRight size={14} />
          </button>
          <h3>{weekLabel}</h3>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FileText size={12} style={{ color: '#1d4ed8' }} /> {assistedCount} call context
          </span>
        </div>

        <QueryState
          isLoading={isLoading}
          error={error ? new Error(friendlyError(error)) : null}
          empty={events.length === 0}
          emptyTitle="No calendar items"
          emptyBody="Customer follow-ups, Aircall activity and failed delivery items will appear here."
        >
        <div className="cal-grid">
          <div className="cal-col-head" />
          {days.map((day) => (
            <div key={day.iso} className={`cal-col-head${day.isToday ? ' today' : ''}`}>
              <div>{day.label}</div>
              <div className="day-num">{day.dayNum}</div>
            </div>
          ))}

          {HOURS.map((hour) => (
            <div key={`row-${hour}`} style={{ display: 'contents' }}>
              <div className="cal-hour">{hour.toString().padStart(2, '0')}:00</div>
              {days.map((day) => {
                const eventsHere = cellFor(day.iso, hour);
                return (
                  <div key={`${day.iso}-${hour}`} className="cal-cell">
                    {eventsHere.map((event) => {
                      const eventHeight = Math.max(52, Math.min(132, event.durationMinutes / 60 * 64 - 4));
                      return (
                        <button key={event.id} type="button"
                          className={`cal-event ${event.source}`}
                          onClick={() => setSelectedId(event.id)}
                          style={{ top: 2, height: eventHeight, zIndex: 1 }}>
                          <span className="src-badge">{SOURCE_LABEL[event.source]}</span>
                          <div className="title">{personSafeText(event.title)}</div>
                          <div className="who">{event.customer ?? ''}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </QueryState>
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }} role="dialog" aria-modal="true">
          <div className="modal-card" role="document">
            <header className="modal-head">
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4 }}>Event details</div>
                <h2 style={{ marginTop: 4 }}>{personSafeText(selected.title)}</h2>
                  <div className="sub">
                  <span style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>
                    <FileText size={10} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {SOURCE_LABEL[selected.source]}
                  </span>
                  <span style={{ background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{selected.kind}</span>
                  <span><Clock size={10} style={{ verticalAlign: 'text-top', marginRight: 3 }} />
                    {selected.dayIso} - {selected.startHour.toString().padStart(2, '0')}:00 - {selected.durationMinutes} min
                  </span>
                </div>
              </div>
              <button type="button" className="close" onClick={() => setSelectedId(null)}><X size={16} /></button>
            </header>

            <div className="modal-body">
              <div>
                <section className="event-summary">
                  <h4>{selected.customer ?? 'N/A'}</h4>
                  <div className="meta">{selected.customerEmail}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {selected.customerPhone && (
                      <span style={{ background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 6, fontSize: 11, color: 'var(--text)' }}>
                        <Phone size={10} style={{ verticalAlign: 'text-top', marginRight: 3 }} /> {selected.customerPhone}
                      </span>
                    )}
                    {selected.customerPhone ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={dialCustomer.isPending}
                        onClick={() => dialCustomer.mutate({
                          phone: selected.customerPhone ?? '',
                          customerId: selected.customerId ?? undefined,
                          source: 'calendar',
                        })}
                      >
                        <Phone size={12} /> Dial
                      </button>
                    ) : null}
                    {dialCustomer.data?.message || dialCustomer.error ? (
                      <span className="meta">{dialCustomer.data?.message ?? friendlyError(dialCustomer.error)}</span>
                    ) : null}
                    {selectedCustomerUrl ? <a className="btn" href={selectedCustomerUrl}><ExternalLink size={12} /> View customer</a> : null}
                    {selectedTaskUrl ? <a className="btn" href={selectedTaskUrl}><FileText size={12} /> Open task</a> : null}
                  </div>
                </section>
                {selectedTaskId ? (
                  <>
                    <form style={{ marginTop: 12 }} onSubmit={submitNote}>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4, display: 'block', marginBottom: 6 }}>
                        Follow-up note
                      </label>
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Save notes to this task history..."
                        style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, resize: 'none', fontFamily: 'inherit' }}
                      />
                      {noteMutation.isError ? <div className="danger-text">{friendlyError(noteMutation.error)}</div> : null}
                      <button type="submit" className="btn primary" style={{ marginTop: 8 }} disabled={!note.trim() || noteMutation.isPending}>
                        {noteMutation.isPending ? <Loader2 size={12} className="spin" /> : <StickyNote size={12} />} Save note
                      </button>
                    </form>
                    <form style={{ marginTop: 12 }} onSubmit={submitSchedule}>
                      <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4, display: 'block', marginBottom: 6 }}>
                        Follow-up
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(160px, 1fr)', gap: 8 }}>
                        <input className="brief-edit" type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} />
                        <input className="brief-edit" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Follow-up note" />
                      </div>
                      {scheduleMutation.isError ? <div className="danger-text">{friendlyError(scheduleMutation.error)}</div> : null}
                      <button type="submit" className="btn" style={{ marginTop: 8 }} disabled={!scheduleAt || scheduleMutation.isPending}>
                        {scheduleMutation.isPending ? <Loader2 size={12} className="spin" /> : <AlarmClockOff size={12} />} Schedule follow-up
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="meta" style={{ marginTop: 12 }}>This event is not linked to a task, so notes and follow-up changes are read-only here.</div>
                )}
              </div>

              {selected.aiBrief ? (
                <div className="generated-brief">
                  <div className="head">
                    <FileText size={14} style={{ color: '#1d4ed8' }} />
                    <h4>Call plan</h4>
                    <span className="badge">live</span>
                  </div>
                  <div className="row">
                    <div className="lbl">Why calling</div>
                    <div className="val">{personSafeText(selected.aiBrief.whyCalling)}</div>
                  </div>
                  <div className="row">
                    <div className="lbl">Concern</div>
                    <div className="val">{personSafeText(selected.aiBrief.upsetAbout)}</div>
                  </div>
                  <div className="row">
                    <div className="lbl">Goal</div>
                    <div className="val"><strong>{personSafeText(selected.aiBrief.callGoal)}</strong></div>
                  </div>
                  {selected.aiBrief.transcriptSnippet && (
                    <div className="row">
                      <div className="lbl">Call excerpt</div>
                      <div className="transcript">{selected.aiBrief.transcriptSnippet}</div>
                    </div>
                  )}
                  <div className="row">
                    <div className="lbl">Suggested actions</div>
                    <ul>{selected.aiBrief.suggestedActions.map((action) => <li key={action}>{personSafeText(action)}</li>)}</ul>
                  </div>
                </div>
              ) : (
                <section className="event-summary">
                  <h4>Manual event</h4>
                  <div className="meta">No call plan for manually-created events. Add notes during the call to improve future context.</div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function taskIdFromEvent(event: CalEvent) {
  if (event.serviceRequestId) return event.serviceRequestId;
  return event.id.startsWith('sr-') ? event.id.slice(3) : null;
}


function dateTimeLocal(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
