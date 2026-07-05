import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCalEvents, type CalEvent } from '../api/live';
import { personSafeText } from '../lib/personTerminology';

const LOOKAHEAD_MINUTES = 15;

function eventStart(event: CalEvent) {
  const date = new Date(`${event.dayIso}T00:00:00`);
  date.setHours(Math.floor(event.startHour), Math.round((event.startHour % 1) * 60), 0, 0);
  return date;
}

function notificationBody(event: CalEvent) {
  return [event.customer, event.customerPhone]
    .map((part) => part?.trim())
    .filter(Boolean)
    .map((part) => personSafeText(part ?? ''))
    .join(' - ') || 'Scheduled follow-up';
}

export function FollowUpReminders() {
  const { data: events = [] } = useQuery({
    queryKey: ['person', 'cal', 'events'],
    queryFn: fetchCalEvents,
    refetchInterval: 60_000,
    retry: false,
  });
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    const request = () => { void Notification.requestPermission(); };
    window.addEventListener('pointerdown', request, { once: true });
    return () => window.removeEventListener('pointerdown', request);
  }, []);

  useEffect(() => {
    if (!events.length) return undefined;
    const check = () => {
      const now = Date.now();
      for (const event of events) {
        if (notifiedRef.current.has(event.id)) continue;
        const start = eventStart(event).getTime();
        const minutesAway = (start - now) / 60_000;
        if (minutesAway < 0 || minutesAway > LOOKAHEAD_MINUTES) continue;
        notifiedRef.current.add(event.id);
        if (!('Notification' in window) || Notification.permission !== 'granted') continue;
        const time = new Date(start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        new Notification(`${personSafeText(event.title)} at ${time}`, {
          body: notificationBody(event),
          tag: event.id,
        });
      }
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [events]);

  return null;
}
