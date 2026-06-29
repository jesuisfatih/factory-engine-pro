import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, FileText, X, Phone, ExternalLink,
  Clock, AlarmClockOff, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { fetchCalEvents, friendlyError, type EventSource, type CalEvent } from '../api/live';
import { QueryState } from '../components/QueryState';

const SOURCE_LABEL: Record<EventSource, string> = {
  manual: 'Manual',
  call_analysis: 'Transcript',
  segment_priority: 'Segment',
  stale_follow_up: 'Stale follow-up',
  admin_transfer: 'Admin transfer',
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
  const [weekStart, setWeekStart] = useState<number>(() => startOfWeek(new Date()).getTime());
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <>
      <div className="page-head">
        <h2>Calendar</h2>
        <div className="sub">Your week - call context items open their brief on click</div>
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
          emptyBody="Open customer tasks, Aircall activity and failed delivery tasks will appear here."
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
                          <div className="title">{event.title}</div>
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
                <h2 style={{ marginTop: 4 }}>{selected.title}</h2>
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
                    <button type="button" className="btn"><Phone size={12} /> Dial</button>
                    <button type="button" className="btn"><ExternalLink size={12} /> View customer</button>
                  </div>
                </section>
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4, display: 'block', marginBottom: 6 }}>
                    Dial notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Notes during the call (saved to customer history)..."
                    style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, resize: 'none', fontFamily: 'inherit' }} />
                </div>
              </div>

              {selected.aiBrief ? (
                <div className="generated-brief">
                  <div className="head">
                    <FileText size={14} style={{ color: '#1d4ed8' }} />
                    <h4>Task Brief</h4>
                    <span className="badge">live</span>
                  </div>
                  <div className="row">
                    <div className="lbl">Why calling</div>
                    <div className="val">{selected.aiBrief.whyCalling}</div>
                  </div>
                  <div className="row">
                    <div className="lbl">Pain points</div>
                    <ul>{selected.aiBrief.painPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                  </div>
                  <div className="row">
                    <div className="lbl">Goal</div>
                    <div className="val"><strong>{selected.aiBrief.callGoal}</strong></div>
                  </div>
                  {selected.aiBrief.transcriptSnippet && (
                    <div className="row">
                      <div className="lbl">Transcript snippet</div>
                      <div className="transcript">{selected.aiBrief.transcriptSnippet}</div>
                    </div>
                  )}
                  <div className="row">
                    <div className="lbl">Suggested actions</div>
                    <ul>{selected.aiBrief.suggestedActions.map((action) => <li key={action}>{action}</li>)}</ul>
                  </div>
                  <div className="footer-meta">
                    <span>Source: call context v{selected.aiBrief.promptVersion}</span>
                    <span>Confidence: {Math.round(selected.aiBrief.confidence * 100)}%</span>
                  </div>
                </div>
              ) : (
                <section className="event-summary">
                  <h4>Manual event</h4>
                  <div className="meta">No generated brief for manually-created events. Add notes during the call to feed future context.</div>
                </section>
              )}
            </div>

            <footer className="modal-foot">
              <button type="button" className="btn"><AlarmClockOff size={13} /> Snooze</button>
              <button type="button" className="btn"><RefreshCw size={13} /> Reassign</button>
              <button type="button" className="btn primary" onClick={() => setSelectedId(null)}>
                <CheckCircle2 size={13} /> Complete
              </button>
            </footer>
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
