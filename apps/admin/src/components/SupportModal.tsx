import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { X, Send, ShieldAlert, User, Clock } from 'lucide-react';
import { Dialog, DialogTitle, DialogClose } from '@/components/Dialog';
import { fetchServiceRequestTimeline, replyServiceRequest, type ServiceRequestRow } from '@/lib/mock';
import { useCan } from '@/lib/permissions';

const ReplySchema = z.object({
  body: z.string().min(3, 'Reply too short').max(4000, 'Reply too long'),
});

interface Props { sr: ServiceRequestRow; onClose: () => void; }

const KIND_LABEL: Record<string, string> = {
  reply_customer: 'Customer reply',
  reply_staff: 'Staff reply',
  status_changed: 'Status change',
  assigned: 'Assignment',
  note: 'Internal note',
  sla_warning: 'SLA warning',
};

export function SupportModal({ sr, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('support.write');

  const { data: timeline = [] } = useQuery({
    queryKey: ['support', 'timeline', sr.id],
    queryFn: () => fetchServiceRequestTimeline(sr.id),
  });

  const reply = useMutation({
    mutationFn: replyServiceRequest,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support', 'timeline', sr.id] });
      toast.success('Reply sent', { description: `Customer notified on ${sr.number}.` });
    },
    onError: (error) => toast.error('Send failed', { description: (error as Error).message }),
  });

  const form = useForm({
    defaultValues: { body: '' },
    validators: {
      onChange: ({ value }) => {
        const result = ReplySchema.safeParse(value);
        if (result.success) return undefined;
        return result.error.flatten().fieldErrors;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      await reply.mutateAsync({ srId: sr.id, body: value.body });
      formApi.reset();
    },
  });

  return (
    <Dialog open onOpenChange={(value) => { if (!value) onClose(); }} cardClassName="modal-card sr-modal-card" labelledBy={`sr-title-${sr.id}`}>
      <header className="modal-head">
        <div>
          <DialogTitle asChild>
            <h2 id={`sr-title-${sr.id}`}>
              <span className="pill accent" style={{ marginRight: 8 }}>{sr.number}</span>
              {sr.title}
            </h2>
          </DialogTitle>
          <div className="sub" style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><User size={11} style={{ verticalAlign: 'text-top', marginRight: 3 }} />{sr.customer}</span>
            <span className={`sr-status-pill ${sr.status}`}>{t(`support.status_${sr.status}`)}</span>
            <span className={`pill ${sr.priority === 'critical' ? 'danger' : sr.priority === 'high' ? 'warn' : sr.priority === 'medium' ? 'info' : ''}`}>{sr.priority}</span>
            {sr.slaBreachAt && (
              <span style={{ color: 'var(--warn)' }}>
                <ShieldAlert size={11} style={{ verticalAlign: 'text-top', marginRight: 3 }} /> SLA {sr.slaBreachAt}
              </span>
            )}
          </div>
        </div>
        <DialogClose asChild>
          <button id="sr-modal-close" type="button" className="close"><X size={16} /></button>
        </DialogClose>
      </header>

        <div style={{ padding: '16px 20px', overflowY: 'auto', minHeight: 0 }}>
          <div className="timeline" id="sr-timeline">
            {timeline.map((entry) => (
              <div key={entry.id} className={`timeline-row ${entry.kind}`} id={`tl-${entry.id}`}>
                <div className="marker" />
                <div className="body">
                  <div className="head">
                    <span className="actor">{entry.actor} · {KIND_LABEL[entry.kind] ?? entry.kind}</span>
                    <span><Clock size={10} style={{ verticalAlign: 'text-top', marginRight: 3 }} />{entry.at}</span>
                  </div>
                  <p>{entry.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="modal-foot" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <form id="sr-reply-form" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end', width: '100%' }}>
            <form.Field name="body">
              {(field) => (
                <textarea id="sr-reply-input" rows={2} value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder={t('support.reply_placeholder')}
                  disabled={!canWrite}
                  style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, resize: 'none', fontFamily: 'inherit' }} />
              )}
            </form.Field>
            <form.Subscribe selector={(state) => [state.values.body.trim().length > 0, state.isSubmitting] as const}>
              {([hasText, isSubmitting]) => (
                <button id="btn-sr-send" type="submit" className="save-btn" disabled={!canWrite || !hasText || isSubmitting}>
                  <Send size={13} /> {t('support.reply_send')}
                </button>
              )}
            </form.Subscribe>
          </form>
        </footer>
    </Dialog>
  );
}
