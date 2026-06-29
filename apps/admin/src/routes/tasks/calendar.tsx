import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CalendarEventModal } from '@/components/CalendarEventModal';
import { apiErrorMessage } from '@/lib/api';
import { fetchCalendarEvents, type EventSource } from '@/lib/live-data';

const SOURCE_KEY: Record<EventSource, string> = {
  manual: 'calendar_view.source_manual',
  ai_transcript: 'calendar_view.source_ai_transcript',
  ai_segment: 'calendar_view.source_ai_segment',
  ai_stale: 'calendar_view.source_ai_stale',
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

function CalendarView() {
  const { t } = useTranslation();
  const [weekStart, setWeekStart] = useState<number>(() => startOfWeek(new Date()).getTime());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const eventsQuery = useQuery({ queryKey: ['calendar', 'events'], queryFn: fetchCalendarEvents });
  const events = eventsQuery.data ?? [];

  const days = useMemo(() => weekDaysFrom(weekStart), [weekStart]);

  const cellFor = (iso: string, hour: number) =>
    events.filter((event) => event.dayIso === iso && event.startHour === hour);

  const weekLabel = useMemo(() => {
    const start = new Date(weekStart);
    const end = new Date(weekStart + 6 * 86_400_000);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)} ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <>
      <PageHeader titleI18nKey="calendar_view.title" subtitleI18nKey="calendar_view.subtitle" />

      {eventsQuery.isLoading && <div className="pricing-list-empty">{t('common.loading')}</div>}
      {eventsQuery.isError && <div className="error-state">{apiErrorMessage(eventsQuery.error)}</div>}
      {eventsQuery.isSuccess && events.length === 0 && (
        <div className="pricing-list-empty">{t('calendar_view.empty_state', { defaultValue: 'No live calendar events found.' })}</div>
      )}

      <div className="cal-shell">
        <div className="cal-toolbar">
          <button id="cal-prev" type="button" className="nav-btn" onClick={() => setWeekStart((value) => value - 7 * 86_400_000)}>
            <ChevronLeft size={14} />
          </button>
          <button id="cal-today" type="button" className="btn ghost" onClick={() => setWeekStart(startOfWeek(new Date()).getTime())}>
            {t('calendar_view.today')}
          </button>
          <button id="cal-next" type="button" className="nav-btn" onClick={() => setWeekStart((value) => value + 7 * 86_400_000)}>
            <ChevronRight size={14} />
          </button>
          <h3>{weekLabel}</h3>
          <span className="muted" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} style={{ color: '#7c3aed' }} /> {events.filter((event) => event.source !== 'manual').length} call-analysis
          </span>
        </div>

        <div className="cal-grid" id="cal-grid">
          {/* header row */}
          <div className="cal-col-head" />
          {days.map((day) => (
            <div key={day.iso} className={`cal-col-head${day.isToday ? ' today' : ''}`}>
              <div>{day.label}</div>
              <div className="day-num">{day.dayNum}</div>
            </div>
          ))}

          {/* hour rows */}
          {HOURS.map((hour) => (
            <div key={`row-${hour}`} style={{ display: 'contents' }}>
              <div className="cal-hour">{hour.toString().padStart(2, '0')}:00</div>
              {days.map((day) => {
                const eventsHere = cellFor(day.iso, hour);
                return (
                  <div key={`${day.iso}-${hour}`} className="cal-cell" id={`cell-${day.iso}-${hour}`}>
                    {eventsHere.map((event) => {
                      // 1 hour row = 72px; min event height = 56px (badge + title + who all fit)
                      const eventHeight = Math.max(56, Math.min(140, event.durationMinutes / 60 * 72 - 4));
                      return (
                        <button key={event.id} type="button"
                          className={`cal-event ${event.source}`}
                          id={`cal-event-${event.id}`}
                          onClick={() => setSelectedEventId(event.id)}
                          style={{ top: 2, height: eventHeight, zIndex: 1 }}>
                          <span className="src-badge">{t(SOURCE_KEY[event.source])}</span>
                          <div className="title">{event.title}</div>
                          <div className="who">{event.customer ?? event.assignee}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selectedEventId && (
        <CalendarEventModal eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
      )}
    </>
  );
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

export const Route = createFileRoute('/tasks/calendar')({ component: CalendarView });
