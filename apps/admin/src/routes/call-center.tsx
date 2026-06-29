import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarDays,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Rows3,
  StickyNote,
  Activity,
} from 'lucide-react';
import type { CallCenterMember, CallCenterOverview, CallCenterPriorityCustomer } from '@factory-engine-pro/contracts';
import { CustomerDetailPanel } from '@factory-engine-pro/ui';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import {
  createCallCenterCustomerTask,
  fetchCallCenterCustomerDetail,
  fetchCallCenterOverview,
  saveCallCenterCustomerNote,
  syncCallCenterTasks,
  transferCallCenterTask,
} from '@/lib/live-data';

type TabId = 'kanban' | 'calendar' | 'notes' | 'messages';
type NoteTarget = { customerId: string; customerName: string };
type TaskTransferTarget = { id: string; title: string; customerId: string | null; assignedMemberName?: string; axis?: string | null };
type TransferTarget =
  | { mode: 'task'; task: TaskTransferTarget }
  | { mode: 'customer'; customer: CallCenterPriorityCustomer; ownerName: string };

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'notes', label: 'Notes' },
  { id: 'messages', label: 'Messages' },
];

function CallCenterView() {
  const [tab, setTab] = useState<TabId>('kanban');
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['call-center', 'overview'],
    queryFn: fetchCallCenterOverview,
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ['call-center', 'customer-detail', detailCustomerId],
    queryFn: () => fetchCallCenterCustomerDetail(detailCustomerId ?? ''),
    enabled: Boolean(detailCustomerId),
  });
  const saveNote = useMutation({
    mutationFn: (input: { customerId: string; body: string }) => saveCallCenterCustomerNote(input.customerId, { body: input.body }),
    onSuccess: (_detail, input) => {
      setNoteTarget(null);
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ['call-center', 'customer-detail', input.customerId] });
    },
  });
  const transferWork = useMutation({
    mutationFn: (input: { target: TransferTarget; targetMemberId: string; targetAxis: 'sales' | 'account'; reason: string }) => {
      if (input.target.mode === 'task') {
        return transferCallCenterTask(input.target.task.id, {
          targetMemberId: input.targetMemberId,
          targetAxis: input.targetAxis,
          reason: input.reason,
        });
      }
      return createCallCenterCustomerTask(input.target.customer.customerId, {
        targetMemberId: input.targetMemberId,
        targetAxis: input.targetAxis,
        note: input.reason,
        priority: 'medium',
      });
    },
    onSuccess: (_result, input) => {
      setTransferTarget(null);
      void query.refetch();
      const customerId = input.target.mode === 'task' ? input.target.task.customerId : input.target.customer.customerId;
      if (customerId) void queryClient.invalidateQueries({ queryKey: ['call-center', 'customer-detail', customerId] });
    },
  });
  const syncTasks = useMutation({
    mutationFn: syncCallCenterTasks,
    onSuccess: () => {
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ['call-center'] });
    },
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        titleI18nKey="call_center.title"
        subtitleI18nKey="call_center.subtitle"
        actions={(
          <div className="call-center-header-actions">
            <button type="button" className="btn primary" onClick={() => syncTasks.mutate()} disabled={syncTasks.isPending}>
              {syncTasks.isPending ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Sync tasks
            </button>
            <button type="button" className="btn" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        )}
      />
      {syncTasks.isError && <div className="state-block error"><p>{apiErrorMessage(syncTasks.error)}</p></div>}
      {syncTasks.data && (
        <div className="call-center-sync-proof">
          Synced {syncTasks.data.backfill.ingested} calls, queued {syncTasks.data.resolver.queued} resolver jobs at {new Date(syncTasks.data.syncedAt).toLocaleTimeString()}.
        </div>
      )}

      {query.isLoading && <StateBlock title="Loading Call Center" body="Reading live personnel tasks, calls, notes, messages, rule activity, and mail activity." />}
      {query.isError && (
        <StateBlock
          title="Call Center could not be loaded"
          body={apiErrorMessage(query.error)}
          action={<button type="button" className="btn" onClick={() => query.refetch()}><RefreshCw size={14} /> Retry</button>}
        />
      )}

      {data && (
        <>
          <PreviewGrid data={data} />
          <div className="call-center-shell">
            <div className="call-center-tabs" role="tablist">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`call-center-tab${tab === item.id ? ' active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
              <span className="call-center-live">Live data, 30s fallback refresh</span>
            </div>
            {tab === 'kanban' && (
              <KanbanTab
                data={data}
                onOpenCustomer={(customerId) => setDetailCustomerId(customerId)}
                onNoteCustomer={(target) => setNoteTarget(target)}
                onTransfer={(target) => setTransferTarget(target)}
              />
            )}
            {tab === 'calendar' && <CalendarTab data={data} />}
            {tab === 'notes' && <NotesTab data={data} />}
            {tab === 'messages' && <MessagesTab data={data} />}
          </div>
          <CustomerDetailPanel
            open={Boolean(detailCustomerId)}
            detail={detail.data}
            isLoading={detail.isLoading}
            error={detail.error ? apiErrorMessage(detail.error) : null}
            onRetry={() => detail.refetch()}
            onClose={() => setDetailCustomerId(null)}
          />
          {noteTarget && (
            <NoteModal
              target={noteTarget}
              isSaving={saveNote.isPending}
              error={saveNote.error ? apiErrorMessage(saveNote.error) : null}
              onClose={() => setNoteTarget(null)}
              onSubmit={(body) => saveNote.mutate({ customerId: noteTarget.customerId, body })}
            />
          )}
          {transferTarget && (
            <TransferModal
              target={transferTarget}
              members={data.members}
              isSaving={transferWork.isPending}
              error={transferWork.error ? apiErrorMessage(transferWork.error) : null}
              onClose={() => setTransferTarget(null)}
              onSubmit={(payload) => transferWork.mutate({ target: transferTarget, ...payload })}
            />
          )}
        </>
      )}
    </>
  );
}

function PreviewGrid({ data }: { data: CallCenterOverview }) {
  const cards = [
    {
      icon: MessageSquareText,
      title: 'Latest messages',
      value: String(data.preview.latestMessages.length),
      body: data.preview.latestMessages.slice(0, 2).map((item) => `${item.fromName} -> ${item.toName ?? 'team'}: ${relative(item.createdAt)}`),
    },
    {
      icon: Mail,
      title: 'Sent mail',
      value: String(data.preview.sentMail.today),
      body: [`This week ${data.preview.sentMail.week}`, `Last ${data.preview.sentMail.lastSentAt ? relative(data.preview.sentMail.lastSentAt) : 'none'}`],
    },
    {
      icon: Phone,
      title: 'Recent calls',
      value: String(data.preview.recentCalls.length),
      body: data.preview.recentCalls.slice(0, 2).map((item) => `${item.customer} - ${item.memberName}`),
    },
    {
      icon: Rows3,
      title: 'Call stats',
      value: String(data.preview.callStats.todayTotal),
      body: [`Answered ${data.preview.callStats.answeredRate}%`, ...data.preview.callStats.byMember.slice(0, 2).map((item) => `${item.memberName}: ${item.count}`)],
    },
    {
      icon: StickyNote,
      title: 'Task activity',
      value: String(data.preview.taskActivity.length),
      body: data.preview.taskActivity.slice(0, 2).map((item) => `${item.memberName}: ${item.status}`),
    },
    {
      icon: Activity,
      title: 'Rule activity',
      value: String(data.preview.activeRuleFire.reduce((sum, item) => sum + item.fires, 0)),
      body: data.preview.activeRuleFire.slice(0, 2).map((item) => `${item.ruleName}: ${item.fires}/${item.matches}`),
    },
  ];
  return (
    <div className="call-center-preview-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <section key={card.title} className="call-center-preview-card">
            <div className="preview-card-head">
              <Icon size={16} />
              <span>{card.title}</span>
            </div>
            <strong>{card.value}</strong>
            {card.body.length ? card.body.map((line) => <p key={line}>{line}</p>) : <p>No live records yet.</p>}
          </section>
        );
      })}
    </div>
  );
}

function KanbanTab({
  data,
  onOpenCustomer,
  onNoteCustomer,
  onTransfer,
}: {
  data: CallCenterOverview;
  onOpenCustomer: (customerId: string) => void;
  onNoteCustomer: (target: NoteTarget) => void;
  onTransfer: (target: TransferTarget) => void;
}) {
  return (
    <div className="call-center-kanban">
      <section className="call-center-panel">
        <PanelHead title="Daily call list" meta={`${data.kanban.dailyCallList.length} tasks`} />
        {data.kanban.dailyCallList.length === 0 ? (
          <EmptyLine>No daily call tasks in the last 7 days.</EmptyLine>
        ) : data.kanban.dailyCallList.map((task) => (
          <article
            key={task.id}
            className="call-center-task-card"
            onClick={() => task.customerId && onOpenCustomer(task.customerId)}
          >
            {(task.callIntent || task.psychTags?.length) ? (
              <div className="call-center-task-badges" aria-label="Call context">
                {task.callIntent ? <span>intent: {task.callIntent}</span> : null}
                {(task.psychTags ?? []).slice(0, 3).map((tag) => <span key={tag}>tag: {tag}</span>)}
              </div>
            ) : null}
            <div>
              <strong>{task.title}</strong>
              <span>{task.summary}</span>
            </div>
            <div className="person-pill">{task.assignedMemberName} - {task.assignedMemberRole}</div>
            <div className="task-card-meta">
              <span>Owner: {task.assignedMemberName}</span>
              <span>Active: {task.activeMemberName}</span>
              <span>{task.axis ?? 'no axis'}</span>
              <span>{task.segment}</span>
              <span>{task.customerEmail ?? task.customerPhone ?? 'No customer contact'}</span>
            </div>
            <div className="task-card-actions">
              {task.customerPhone && (
                <a
                  className="btn ghost"
                  href={`tel:${cleanPhone(task.customerPhone)}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Phone size={13} /> Call
                </a>
              )}
              {task.customerId && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNoteCustomer({ customerId: task.customerId!, customerName: task.customerName ?? task.title });
                  }}
                >
                  <StickyNote size={13} /> Note
                </button>
              )}
              <button
                type="button"
                className="btn ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  onTransfer({ mode: 'task', task });
                }}
              >
                <ArrowRightLeft size={13} /> Transfer
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="call-center-panel">
        <PanelHead title="Priority kanban" meta={`${data.kanban.priorityGroups.length} segments`} />
        {data.kanban.priorityGroups.length === 0 ? (
          <EmptyLine>No assigned segment customers.</EmptyLine>
        ) : data.kanban.priorityGroups.map((group) => (
          <details key={`${group.segmentId}-${group.ownerMemberId}`} className="call-center-segment" open>
            <summary>
              <span className="segment-dot" style={{ background: group.segmentColor }} />
              <strong>{group.segmentName}</strong>
              <em>Owner: {group.ownerName} - {group.ownerRole}</em>
              <span>{group.customerCount}</span>
            </summary>
            <div className="segment-customer-list">
              {group.customers.map((customer) => (
                <article key={customer.id} className="segment-customer-row" onClick={() => onOpenCustomer(customer.customerId)}>
                  <div className="segment-customer-main">
                    <strong>{customer.customerName}</strong>
                    <span>{customer.phone ?? 'No phone on file'}{customer.email ? ` - ${customer.email}` : ''}</span>
                  </div>
                  <div className="segment-customer-signals">
                    <span>{customer.ordersCount} orders - {formatMoney(customer.totalSpent)}</span>
                    <span>{customer.latestOrder ? `Last order ${customer.latestOrder.orderNumber ?? customer.latestOrder.id} - ${formatMoney(customer.latestOrder.totalPrice)}` : 'No linked Shopify order'}</span>
                    <span>{customer.latestCall ? `Last call ${relative(customer.latestCall.at)}` : 'No matched call yet'}</span>
                    <span>{customer.openTasksCount} open tasks - {customer.openRequestsCount} customer requests - {customer.notesCount} notes</span>
                  </div>
                  <div className="segment-customer-note">
                    {customer.latestNote ? (
                      <>
                        <strong>{customer.latestNote.authorName}</strong>
                        <span>{customer.latestNote.body}</span>
                      </>
                    ) : (
                      <span>No personnel note yet</span>
                    )}
                  </div>
                  <div className="segment-customer-actions">
                    <span className="priority-pill">U{customer.urgencyScore}</span>
                    {customer.phone && (
                      <a
                        className="btn ghost"
                        href={`tel:${cleanPhone(customer.phone)}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Phone size={13} /> Call
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNoteCustomer({ customerId: customer.customerId, customerName: customer.customerName });
                      }}
                    >
                      <StickyNote size={13} /> Note
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        onTransfer({ mode: 'customer', customer, ownerName: group.ownerName });
                      }}
                    >
                      <ArrowRightLeft size={13} /> Send task
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </details>
        ))}
      </section>

      <section className="call-center-panel">
        <PanelHead title="Pin board" meta={`${data.kanban.pinBoard.length} pins`} />
        {data.kanban.pinBoard.length === 0 ? (
          <EmptyLine>No pinned tasks or customers.</EmptyLine>
        ) : data.kanban.pinBoard.map((pin) => (
          <div key={pin.id} className="pin-line" onClick={() => pin.customerId && onOpenCustomer(pin.customerId)}>
            <span>{pin.ownerName} to</span>
            <strong>{pin.customerName ?? pin.title}</strong>
            <em>{pin.kind}</em>
            {pin.serviceRequestId && (
              <button
                type="button"
                className="btn ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  onTransfer({
                    mode: 'task',
                    task: {
                      id: pin.serviceRequestId!,
                      title: pin.title,
                      customerId: pin.customerId,
                      assignedMemberName: pin.ownerName,
                    },
                  });
                }}
              >
                <ArrowRightLeft size={13} /> Transfer
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

function CalendarTab({ data }: { data: CallCenterOverview }) {
  return (
    <section className="call-center-panel">
      <PanelHead title="All personnel calendar" meta={`${data.calendar.length} events`} />
      {data.calendar.length === 0 ? <EmptyLine>No live calendar events.</EmptyLine> : (
        <div className="call-center-list">
          {data.calendar.map((event) => (
            <div key={event.id} className="call-center-list-row">
              <CalendarDays size={14} />
              <div>
                <strong>{event.dayIso} {String(event.startHour).padStart(2, '0')}:00 - {event.title}</strong>
                <span>{event.customerName ?? 'No customer'} - {event.memberName} - {event.memberRole}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NotesTab({ data }: { data: CallCenterOverview }) {
  return (
    <section className="call-center-panel">
      <PanelHead title="Customer notes" meta={`${data.notes.length} notes`} />
      {data.notes.length === 0 ? <EmptyLine>No personnel notes yet.</EmptyLine> : (
        <div className="call-center-list">
          {data.notes.map((note) => (
            <div key={note.id} className="call-center-list-row note-row">
              <StickyNote size={14} />
              <div>
                <strong>{note.customerName ?? 'No customer'} - {note.authorName} - {note.authorRole}</strong>
                <span>{note.body}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MessagesTab({ data }: { data: CallCenterOverview }) {
  return (
    <section className="call-center-panel">
      <PanelHead title="Internal messages" meta={`${data.messages.length} messages`} />
      {data.messages.length === 0 ? <EmptyLine>No internal messages yet.</EmptyLine> : (
        <div className="call-center-list">
          {data.messages.map((message) => (
            <div key={message.id} className="call-center-list-row">
              <MessageSquareText size={14} />
              <div>
                <strong>{message.fromName} to {message.toName ?? 'team'}</strong>
                <span>{message.body}</span>
              </div>
              <em>{relative(message.createdAt)}</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function NoteModal({
  target,
  isSaving,
  error,
  onClose,
  onSubmit,
}: {
  target: NoteTarget;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState('');
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="call-center-note-title" onMouseDown={onClose}>
      <section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2 id="call-center-note-title">Customer note</h2>
            <p>{target.customerName}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>x</button>
        </header>
        <div className="modal-body">
          <label className="field-label" htmlFor="call-center-note-body">Note</label>
          <textarea
            id="call-center-note-body"
            className="textarea"
            rows={6}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the customer-specific note"
          />
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!body.trim() || isSaving} onClick={() => onSubmit(body.trim())}>
            {isSaving ? <Loader2 size={13} className="spin" /> : <StickyNote size={13} />} Save note
          </button>
        </footer>
      </section>
    </div>
  );
}

function TransferModal({
  target,
  members,
  isSaving,
  error,
  onClose,
  onSubmit,
}: {
  target: TransferTarget;
  members: CallCenterMember[];
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: { targetMemberId: string; targetAxis: 'sales' | 'account'; reason: string }) => void;
}) {
  const [targetMemberId, setTargetMemberId] = useState(members[0]?.id ?? '');
  const [targetAxis, setTargetAxis] = useState<'sales' | 'account'>(target.mode === 'task' && isFollowUpAxis(target.task.axis) ? target.task.axis : 'sales');
  const [reason, setReason] = useState(target.mode === 'customer'
    ? `Follow up with ${target.customer.customerName} from ${target.ownerName}'s assigned segment.`
    : `Admin reassigned ${target.task.title}.`);
  const label = target.mode === 'customer' ? target.customer.customerName : target.task.title;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="call-center-transfer-title" onMouseDown={onClose}>
      <section className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h2 id="call-center-transfer-title">{target.mode === 'customer' ? 'Send customer task' : 'Transfer task'}</h2>
            <p>{label}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>x</button>
        </header>
        <div className="modal-body">
          <label className="field-label" htmlFor="call-center-transfer-member">Target staff member</label>
          <select id="call-center-transfer-member" value={targetMemberId} onChange={(event) => setTargetMemberId(event.target.value)}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name} - {member.role}</option>
            ))}
          </select>
          <label className="field-label" htmlFor="call-center-transfer-axis">Axis</label>
          <select id="call-center-transfer-axis" value={targetAxis} onChange={(event) => setTargetAxis(event.target.value as 'sales' | 'account')}>
            <option value="sales">Sales</option>
            <option value="account">Account</option>
          </select>
          <label className="field-label" htmlFor="call-center-transfer-reason">Reason</label>
          <textarea
            id="call-center-transfer-reason"
            className="textarea"
            rows={5}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <footer className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            disabled={!targetMemberId || !reason.trim() || isSaving}
            onClick={() => onSubmit({
              targetMemberId,
              targetAxis,
              reason: reason.trim(),
            })}
          >
            {isSaving ? <Loader2 size={13} className="spin" /> : <ArrowRightLeft size={13} />}
            {target.mode === 'customer' ? 'Create task' : 'Transfer'}
          </button>
        </footer>
      </section>
    </div>
  );
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return (
    <header className="call-center-panel-head">
      <h3>{title}</h3>
      <span>{meta}</span>
    </header>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <div className="call-center-empty">{children}</div>;
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state-block">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function isFollowUpAxis(value: unknown): value is 'sales' | 'account' {
  return value === 'sales' || value === 'account';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function relative(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const Route = createFileRoute('/call-center')({ component: CallCenterView });
