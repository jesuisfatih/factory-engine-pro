import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { X, Sparkles, Phone, Mail, Clock, User, AlarmClockOff, RefreshCw, CheckCircle2, ExternalLink } from 'lucide-react';
import { Dialog, DialogTitle, DialogClose } from '@/components/Dialog';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { fetchCalendarEventById, type EventSource } from '@/lib/live-data';
import { useCan } from '@/lib/permissions';

interface Props { eventId: string; onClose: () => void; }

const SOURCE_BG: Record<EventSource, string> = {
  manual: 'var(--surface-3)',
  ai_transcript: '#DBEAFE',
  ai_segment: '#DCFCE7',
  ai_stale: '#FEF3C7',
};
const SOURCE_KEY: Record<EventSource, string> = {
  manual: 'calendar_view.source_manual',
  ai_transcript: 'calendar_view.source_ai_transcript',
  ai_segment: 'calendar_view.source_ai_segment',
  ai_stale: 'calendar_view.source_ai_stale',
};

export function CalendarEventModal({ eventId, onClose }: Props) {
  const { t } = useTranslation();
  const canWrite = useCan('calendar.write');

  const { data: event } = useQuery({
    queryKey: ['calendar', 'event', eventId],
    queryFn: () => fetchCalendarEventById(eventId),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      if (!id.startsWith('sr-')) throw new Error('Only service request calendar events can be completed from this view.');
      await adminApi.changeSupportStatus(id.slice(3), { status: 'resolved' });
      return id;
    },
    onSuccess: () => toast.success('Event completed', { description: 'Service request marked resolved.' }),
    onError: (error) => toast.error('Complete failed', { description: apiErrorMessage(error) }),
  });

  const form = useForm({
    defaultValues: { dialNotes: '' },
    onSubmit: () => undefined,
  });

  if (!event) return null;

  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }} cardClassName="modal-card event-modal-card" labelledBy={`event-title-${event.id}`}>
      <header className="modal-head">
        <div>
          <div data-i18n-key="calendar_view.event_modal_title" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4 }}>
            {t('calendar_view.event_modal_title')}
          </div>
          <DialogTitle asChild>
            <h2 id={`event-title-${event.id}`} style={{ marginTop: 4 }}>{event.title}</h2>
          </DialogTitle>
          <div className="sub" style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="pill" style={{ background: SOURCE_BG[event.source], color: 'var(--text)' }}>
              <Sparkles size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
              {t(SOURCE_KEY[event.source])}
            </span>
            <span className="pill accent">{t(`calendar_view.event_kind_${event.kind}`)}</span>
            <span><Clock size={11} style={{ verticalAlign: 'text-top', marginRight: 3 }} />
              {event.dayIso} · {event.startHour.toString().padStart(2, '0')}:00 · {t('calendar_view.duration_min', { n: event.durationMinutes })}
            </span>
            <span><User size={11} style={{ verticalAlign: 'text-top', marginRight: 3 }} />{t('calendar_view.assignee')} {event.assignee}</span>
          </div>
        </div>
        <DialogClose asChild>
          <button id="event-modal-close" type="button" className="close"><X size={16} /></button>
        </DialogClose>
      </header>

        <div className="event-modal-body">
          <div>
            <section className="event-summary" id="event-customer-card">
              <h4>{event.customer ?? '—'}</h4>
              <div className="meta">{event.customerEmail}</div>
              <div className="src-row">
                {event.customerPhone && (
                  <span className="pill">
                    <Phone size={10} style={{ marginRight: 3, verticalAlign: 'text-top' }} /> {event.customerPhone}
                  </span>
                )}
                <button id={`btn-dial-${event.id}`} type="button" className="btn" disabled={!canWrite}>
                  <Phone size={12} /> {t('calendar_view.modal_actions.dial')}
                </button>
                <button id={`btn-view-customer-${event.id}`} type="button" className="btn ghost">
                  <ExternalLink size={12} /> {t('calendar_view.modal_actions.view_customer')}
                </button>
              </div>
            </section>

            <form id={`event-notes-${event.id}`}
              onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}
              style={{ marginTop: 12 }}>
              <form.Field name="dialNotes">
                {(field) => (
                  <div className="field">
                    <label htmlFor="event-notes-input" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: .4 }}>
                      Dial notes
                    </label>
                    <textarea id="event-notes-input" rows={3}
                      placeholder="Notes during the call (saved to customer history)…"
                      value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}
                      disabled={!canWrite}
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, resize: 'none', fontFamily: 'inherit' }} />
                  </div>
                )}
              </form.Field>
            </form>
          </div>

          {/* AI Brief (only for AI-sourced events) */}
          {event.aiBrief ? (
            <div className="ai-brief" id={`ai-brief-${event.id}`}>
              <div className="head">
                <Sparkles size={14} style={{ color: '#7c3aed' }} />
                <h4 data-i18n-key="calendar_view.ai_brief_title">{t('calendar_view.ai_brief_title')}</h4>
                <span className="badge" data-i18n-key="calendar_view.ai_brief_badge">{t('calendar_view.ai_brief_badge')}</span>
              </div>

              <div className="row">
                <div className="lbl" data-i18n-key="calendar_view.ai_why_calling">{t('calendar_view.ai_why_calling')}</div>
                <div className="val">{event.aiBrief.whyCalling}</div>
              </div>

              <div className="row">
                <div className="lbl" data-i18n-key="calendar_view.ai_pain_points">{t('calendar_view.ai_pain_points')}</div>
                <ul>
                  {event.aiBrief.painPoints.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>

              <div className="row">
                <div className="lbl" data-i18n-key="calendar_view.ai_call_goal">{t('calendar_view.ai_call_goal')}</div>
                <div className="val"><strong>{event.aiBrief.callGoal}</strong></div>
              </div>

              {event.aiBrief.transcriptSnippet && (
                <div className="row">
                  <div className="lbl" data-i18n-key="calendar_view.ai_transcript_snippet">{t('calendar_view.ai_transcript_snippet')}</div>
                  <div className="transcript">{event.aiBrief.transcriptSnippet}</div>
                </div>
              )}

              <div className="row">
                <div className="lbl" data-i18n-key="calendar_view.ai_suggested_actions">{t('calendar_view.ai_suggested_actions')}</div>
                <ul>
                  {event.aiBrief.suggestedActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>

              <div className="footer-meta">
                <span>{t('calendar_view.ai_meta_prompt', { key: event.aiBrief.promptKey, version: event.aiBrief.promptVersion })}</span>
                <span>{t('calendar_view.ai_meta_model', { model: event.aiBrief.modelUsed })}</span>
                <span>{t('calendar_view.ai_meta_confidence', { pct: Math.round(event.aiBrief.confidence * 100) })}</span>
              </div>
            </div>
          ) : (
            <section className="event-summary">
              <h4>Manual event</h4>
              <div className="meta">No AI brief for manually-created events. Add notes during the call to feed future intelligence.</div>
            </section>
          )}
        </div>

        <footer className="modal-foot">
          <button id={`btn-snooze-${event.id}`} type="button" className="btn ghost"
            disabled title="No live snooze endpoint is available yet">
            <AlarmClockOff size={13} /> {t('calendar_view.modal_actions.snooze')}
          </button>
          <button id={`btn-reassign-${event.id}`} type="button" className="btn ghost"
            disabled title="Use the support detail page to change assignee">
            <RefreshCw size={13} /> {t('calendar_view.modal_actions.reassign')}
          </button>
          <button id={`btn-complete-${event.id}`} type="button" className="save-btn"
            disabled={!canWrite || complete.isPending} onClick={() => { complete.mutate(event.id, { onSuccess: onClose }); }}>
            <CheckCircle2 size={13} /> {t('calendar_view.modal_actions.complete')}
          </button>
        </footer>
    </Dialog>
  );
}
