import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Search, Send, ChevronDown, ChevronUp, MessageCircle,
  CreditCard, Truck, Package, UserCog, HelpCircle, Star,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { apiErrorMessage } from '@/lib/api';
import {
  fetchSupportTickets, createSupportTicket, replySupportTicket, closeSupportTicket, reopenSupportTicket,
  type SupportTicket, type TicketStatus, type TicketPriority, type TicketCategory,
} from '@/lib/portal';

const QK_TICKETS = ['support', 'tickets'] as const;

const STATUS_TONE: Record<TicketStatus, string> = {
  open: 'info', in_progress: 'warn', resolved: 'success', closed: '',
};

const CATEGORY_ICON: Record<TicketCategory, typeof CreditCard> = {
  billing: CreditCard, shipping: Truck, product: Package, account: UserCog, other: HelpCircle,
};

const CATEGORIES: TicketCategory[] = ['billing', 'shipping', 'product', 'account', 'other'];
const PRIORITIES: TicketPriority[] = ['low', 'normal', 'high', 'urgent'];
const FILTER_VALUES: ('all' | TicketStatus)[] = ['all', 'open', 'in_progress', 'resolved', 'closed'];

function TicketRow({
  ticket,
  expanded,
  busy,
  onToggle,
  onReply,
  onClose,
  onReopen,
}: {
  ticket: SupportTicket;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onReply: (id: string, body: string) => void;
  onClose: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [replyBody, setReplyBody] = useState('');
  const Icon = CATEGORY_ICON[ticket.category];
  const canReply = ticket.status !== 'closed';
  const canClose = ticket.status !== 'closed';
  const canReopen = ticket.status === 'resolved' || ticket.status === 'closed';
  return (
    <div className={`support-ticket${expanded ? ' expanded' : ''}`} id={`ticket-${ticket.id}`}>
      <button type="button" className="support-ticket-head" onClick={onToggle} aria-expanded={expanded}>
        <div className="support-ticket-title">
          <span className="support-ticket-icon"><Icon size={14} /></span>
          <div>
            <div className="name">{ticket.subject}</div>
            <div className="muted">
              {ticket.ticketNumber} · {t(`support.categories.${ticket.category}`)}
              {ticket.relatedTo && <> · {ticket.relatedTo}</>}
            </div>
          </div>
        </div>
        <div className="support-ticket-meta">
          <span className={`pill ${ticket.priority === 'urgent' ? 'danger' : ticket.priority === 'high' ? 'warn' : ''}`}>
            {t(`support.priority.${ticket.priority}`)}
          </span>
          <span className={`pill ${STATUS_TONE[ticket.status]}`}>
            {t(`support.status.${ticket.status}`)}
          </span>
          <span className="muted">{ticket.updatedAt}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="support-ticket-body">
          <p className="ticket-description">{ticket.description}</p>

          {ticket.responses.length > 0 && (
            <div className="ticket-thread">
              {ticket.responses.map((response) => (
                <div key={response.id} className={`ticket-reply${response.fromMe ? ' from-me' : ''}`}>
                  <div className="ticket-reply-head">
                    <strong>{response.author}</strong>
                    <span className="muted">{response.at}</span>
                  </div>
                  <p>{response.body}</p>
                </div>
              ))}
            </div>
          )}

          {ticket.satisfactionRating != null && (
            <div className="ticket-satisfaction">
              {t('support.ticket_satisfaction')}:
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={12} style={{ color: index < ticket.satisfactionRating! ? '#F59E0B' : 'var(--border-strong)', fill: index < ticket.satisfactionRating! ? '#F59E0B' : 'transparent' }} />
              ))}
            </div>
          )}

          <div className="ticket-actions">
            {canReply && (
              <div className="ticket-reply-box">
                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={t('support.reply_placeholder')}
                  rows={3}
                />
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !replyBody.trim()}
                  onClick={() => {
                    onReply(ticket.id, replyBody);
                    setReplyBody('');
                  }}
                >
                  <Send size={12} /> {t('support.ticket_reply')}
                </button>
              </div>
            )}
            {canReopen && (
              <button type="button" className="btn" disabled={busy} onClick={() => onReopen(ticket.id)}>
                {t('support.ticket_reopen')}
              </button>
            )}
            {canClose && (
              <button type="button" className="btn ghost" disabled={busy} onClick={() => onClose(ticket.id)}>
                {t('support.ticket_close')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SupportView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: tickets = [], isLoading, isError, error, refetch } = useQuery({ queryKey: QK_TICKETS, queryFn: fetchSupportTickets });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    category: 'shipping' as TicketCategory,
    subject: '',
    priority: 'normal' as TicketPriority,
    relatedTo: '',
    description: '',
  });

  const create = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: () => {
      toast.success('Service request submitted', { description: form.subject });
      qc.invalidateQueries({ queryKey: QK_TICKETS });
      setForm({ category: 'shipping', subject: '', priority: 'normal', relatedTo: '', description: '' });
    },
    onError: (error) => toast.error('Submit failed', { description: apiErrorMessage(error) }),
  });

  const reply = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => replySupportTicket(id, { body }),
    onSuccess: (ticket) => {
      toast.success('Reply saved', { description: ticket.subject });
      qc.invalidateQueries({ queryKey: QK_TICKETS });
    },
    onError: (error) => toast.error('Reply failed', { description: apiErrorMessage(error) }),
  });

  const close = useMutation({
    mutationFn: (id: string) => closeSupportTicket(id),
    onSuccess: (ticket) => {
      toast.success('Request closed', { description: ticket.subject });
      qc.invalidateQueries({ queryKey: QK_TICKETS });
    },
    onError: (error) => toast.error('Close failed', { description: apiErrorMessage(error) }),
  });

  const reopen = useMutation({
    mutationFn: (id: string) => reopenSupportTicket(id),
    onSuccess: (ticket) => {
      toast.success('Request reopened', { description: ticket.subject });
      qc.invalidateQueries({ queryKey: QK_TICKETS });
    },
    onError: (error) => toast.error('Reopen failed', { description: apiErrorMessage(error) }),
  });

  const filtered = tickets
    .filter((ticket) => statusFilter === 'all' || ticket.status === statusFilter)
    .filter((ticket) => {
      const text = search.toLowerCase().trim();
      if (!text) return true;
      return ticket.subject.toLowerCase().includes(text) || ticket.ticketNumber.toLowerCase().includes(text);
    });

  const open = tickets.filter((t) => t.status === 'open').length;
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
  const resolved = tickets.filter((t) => t.status === 'resolved').length;
  const avgResponse = formatAverageResponse(tickets.map((ticket) => ticket.firstResponseMinutes).filter((value): value is number => typeof value === 'number'));
  const busyTicketId = reply.isPending
    ? reply.variables?.id ?? null
    : close.isPending
      ? close.variables ?? null
      : reopen.isPending
        ? reopen.variables ?? null
        : null;

  const toggleTicket = (id: string) => setExpandedTickets((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageHeader titleI18nKey="support.title" subtitleI18nKey="support.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('support.kpi_open')}</div><div className="val">{open}</div><div className="sub">awaiting reply</div></div>
        <div className="kpi"><div className="label">{t('support.kpi_in_progress')}</div><div className="val">{inProgress}</div><div className="sub">being handled</div></div>
        <div className="kpi"><div className="label">{t('support.kpi_resolved')}</div><div className="val">{resolved}</div><div className="sub">closed loop</div></div>
        <div className="kpi"><div className="label">{t('support.kpi_avg_response')}</div><div className="val">{avgResponse}</div><div className="sub">{avgResponse === 'N/A' ? 'no staff replies yet' : 'from ticket thread'}</div></div>
      </div>

      <div className="support-shell">
        <aside className="support-form">
          <h3>
            <MessageCircle size={14} /> {t('support.form_title')}
          </h3>
          <p className="muted">{t('support.form_subtitle')}</p>

          <form onSubmit={(event) => { event.preventDefault(); create.mutate(form); }}>
            <div className="field">
              <label>{t('support.field_category')}</label>
              <div className="support-cat-grid">
                {CATEGORIES.map((category) => {
                  const Icon = CATEGORY_ICON[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      className={`support-cat-tile${form.category === category ? ' active' : ''}`}
                      onClick={() => setForm((current) => ({ ...current, category }))}
                    >
                      <Icon size={16} />
                      <span>{t(`support.categories.${category}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field">
              <label htmlFor="ticket-subject">{t('support.field_subject')}</label>
              <input id="ticket-subject" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="ticket-priority">{t('support.field_priority')}</label>
                <select id="ticket-priority" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TicketPriority }))}>
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>{t(`support.priority.${priority}`)}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ticket-related">{t('support.field_related')}</label>
                <input id="ticket-related" value={form.relatedTo} onChange={(event) => setForm((current) => ({ ...current, relatedTo: event.target.value }))} placeholder="Order #48201 / Invoice INV-2030" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="ticket-message">{t('support.field_message')}</label>
              <textarea id="ticket-message" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} required />
            </div>

            <button
              type="submit"
              className="save-btn"
              disabled={!form.subject.trim() || !form.description.trim() || create.isPending}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Send size={13} /> {t('support.submit')}
            </button>
          </form>
        </aside>

        <main className="support-list">
          <div className="orders-toolbar">
            <div className="orders-search" style={{ flex: 1 }}>
              <Search size={14} />
              <input
                placeholder={t('support.search_placeholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | TicketStatus)}>
              {FILTER_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? t('support.list_filter_all') : t(`support.status.${value}`)}
                </option>
              ))}
            </select>
          </div>

          {isError ? (
            <ErrorState title="Could not load support tickets" error={error} retry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
              {isLoading ? t('common.loading') : t('support.empty_state')}
            </div>
          ) : (
            <div className="support-ticket-list">
              {filtered.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  expanded={expandedTickets.has(ticket.id)}
                  busy={busyTicketId === ticket.id}
                  onToggle={() => toggleTicket(ticket.id)}
                  onReply={(id, body) => reply.mutate({ id, body })}
                  onClose={(id) => close.mutate(id)}
                  onReopen={(id) => reopen.mutate(id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function formatAverageResponse(values: number[]) {
  if (values.length === 0) return 'N/A';
  const minutes = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export const Route = createFileRoute('/support')({ component: SupportView });
