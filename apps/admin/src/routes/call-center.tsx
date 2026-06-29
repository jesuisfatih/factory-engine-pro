import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Mail,
  MessageSquareText,
  Phone,
  RefreshCw,
  Rows3,
  StickyNote,
  Activity,
} from 'lucide-react';
import type { CallCenterOverview } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import { fetchCallCenterOverview } from '@/lib/live-data';

type TabId = 'kanban' | 'calendar' | 'notes' | 'messages';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'kanban', label: 'Kanban' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'notes', label: 'Notes' },
  { id: 'messages', label: 'Messages' },
];

function CallCenterView() {
  const [tab, setTab] = useState<TabId>('kanban');
  const query = useQuery({
    queryKey: ['call-center', 'overview'],
    queryFn: fetchCallCenterOverview,
    refetchInterval: 30_000,
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        titleI18nKey="call_center.title"
        subtitleI18nKey="call_center.subtitle"
        actions={(
          <button type="button" className="btn" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
      />

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
            {tab === 'kanban' && <KanbanTab data={data} />}
            {tab === 'calendar' && <CalendarTab data={data} />}
            {tab === 'notes' && <NotesTab data={data} />}
            {tab === 'messages' && <MessagesTab data={data} />}
          </div>
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

function KanbanTab({ data }: { data: CallCenterOverview }) {
  return (
    <div className="call-center-kanban">
      <section className="call-center-panel">
        <PanelHead title="Daily call list" meta={`${data.kanban.dailyCallList.length} tasks`} />
        {data.kanban.dailyCallList.length === 0 ? (
          <EmptyLine>No daily call tasks in the last 7 days.</EmptyLine>
        ) : data.kanban.dailyCallList.map((task) => (
          <article key={task.id} className="call-center-task-card">
            <div>
              <strong>{task.title}</strong>
              <span>{task.summary}</span>
            </div>
            <div className="person-pill">{task.assignedMemberName} - {task.assignedMemberRole}</div>
            <div className="task-card-meta">
              <span>{task.axis ?? 'no axis'}</span>
              <span>{task.segment}</span>
              <span>{task.customerEmail ?? task.customerPhone ?? 'No customer contact'}</span>
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
                <div key={customer.id} className="segment-customer-row">
                  <strong>{customer.customerName}</strong>
                  <span>{customer.phone ?? 'No phone on file'}</span>
                  <span>{customer.email ?? 'No email on file'}</span>
                  <span>{customer.ordersCount} orders - {formatMoney(customer.totalSpent)}</span>
                </div>
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
          <div key={pin.id} className="pin-line">
            <span>{pin.ownerName} to</span>
            <strong>{pin.customerName ?? pin.title}</strong>
            <em>{pin.kind}</em>
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

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
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
