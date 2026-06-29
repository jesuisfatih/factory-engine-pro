import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomerDetailPanelDto, CustomerDetailTab } from '@factory-engine-pro/contracts';
import {
  ClipboardList,
  DollarSign,
  Headphones,
  Mail,
  MessageSquare,
  NotebookText,
  Phone,
  RefreshCw,
  ShoppingBag,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface CustomerDetailPanelProps {
  open: boolean;
  detail?: CustomerDetailPanelDto;
  isLoading: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry: () => void;
}

const TAB_CONFIG: Record<CustomerDetailTab, { label: string; Icon: LucideIcon }> = {
  profile: { label: 'Profile', Icon: UserRound },
  shopify_orders: { label: 'Shopify Orders', Icon: ShoppingBag },
  aircall_calls: { label: 'Aircall Calls', Icon: Phone },
  support: { label: 'Customer Requests', Icon: Headphones },
  email: { label: 'Email', Icon: Mail },
  messages: { label: 'Messages', Icon: MessageSquare },
  notes: { label: 'Notes', Icon: NotebookText },
  tasks: { label: 'Tasks', Icon: ClipboardList },
  commission: { label: 'Commission', Icon: DollarSign },
};

export function CustomerDetailPanel({ open, detail, isLoading, error, onClose, onRetry }: CustomerDetailPanelProps) {
  const visibleKey = detail?.visibleTabs.join('|') ?? '';
  const visibleTabs = useMemo<CustomerDetailTab[]>(() => detail?.visibleTabs ?? ['profile'], [visibleKey, detail]);
  const [activeTab, setActiveTab] = useState<CustomerDetailTab>('profile');

  useEffect(() => {
    if (!open) return;
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'profile');
    }
  }, [activeTab, open, visibleTabs]);

  if (!open) return null;

  return (
    <div className="customer-detail-backdrop" role="presentation">
      <section className="customer-detail-panel" role="dialog" aria-modal="true" aria-label="Customer detail panel">
        <header className="customer-detail-header">
          <div className="customer-detail-title">
            <span className="customer-detail-kicker">Customer 360</span>
            <h2>{detail?.customer.name ?? 'Customer detail'}</h2>
            <div className="customer-detail-sub">
              <span>{detail?.customer.email ?? 'No email'}</span>
              <span>{detail?.customer.phone ? `Phone ${detail.customer.phone}` : 'No phone on file'}</span>
            </div>
          </div>
          {detail?.customer.phone ? (
            <a className="btn ghost" href={`tel:${cleanPhone(detail.customer.phone)}`} aria-label={`Call ${detail.customer.phone}`}>
              <Phone size={14} /> Call
            </a>
          ) : null}
          <button type="button" className="customer-detail-icon-btn" onClick={onClose} aria-label="Close customer detail">
            <X size={18} />
          </button>
        </header>

        {isLoading && <PanelState title="Loading customer file" body="Reading live Shopify, Aircall, customer request, mail, note, and task records." />}
        {!isLoading && error && (
          <PanelState
            title="Customer detail failed"
            body={error}
            action={<button type="button" className="btn primary" onClick={onRetry}><RefreshCw size={14} /> Retry</button>}
          />
        )}
        {!isLoading && !error && !detail && (
          <PanelState
            title="No customer selected"
            body="Choose a customer row to open the full customer file."
            action={<button type="button" className="btn" onClick={onRetry}><RefreshCw size={14} /> Refresh</button>}
          />
        )}
        {!isLoading && !error && detail && (
          <>
            <div className="customer-detail-summary">
              <Metric label="Revenue" value={money(detail.customer.metrics.lifetimeRevenue)} />
              <Metric label="Orders" value={String(detail.customer.metrics.ordersCount)} />
              <Metric label="Calls" value={String(detail.customer.metrics.callsCount)} />
              <Metric label="Open requests" value={String(detail.customer.metrics.openSupportCount)} />
              <Metric label="Open tasks" value={String(detail.customer.metrics.openTaskCount)} />
            </div>

            <nav className="customer-detail-tabs" aria-label="Customer detail tabs">
              {visibleTabs.map((tab) => {
                const config = TAB_CONFIG[tab];
                return (
                  <button
                    key={tab}
                    type="button"
                    className={tab === activeTab ? 'active' : ''}
                    onClick={() => setActiveTab(tab)}
                  >
                    <config.Icon size={14} /> {config.label}
                  </button>
                );
              })}
            </nav>

            <main className="customer-detail-body">
              {renderTab(detail, activeTab, onRetry)}
            </main>
          </>
        )}
      </section>
    </div>
  );
}

function renderTab(detail: CustomerDetailPanelDto, tab: CustomerDetailTab, onRetry: () => void) {
  if (tab === 'profile') return <ProfileTab detail={detail} />;
  if (tab === 'shopify_orders') return <OrdersTab detail={detail} onRetry={onRetry} />;
  if (tab === 'aircall_calls') return <AircallTab detail={detail} onRetry={onRetry} />;
  if (tab === 'support') return <SupportTab detail={detail} onRetry={onRetry} />;
  if (tab === 'email') return <EmailTab detail={detail} onRetry={onRetry} />;
  if (tab === 'messages') return <MessagesTab detail={detail} onRetry={onRetry} />;
  if (tab === 'notes') return <NotesTab detail={detail} onRetry={onRetry} />;
  if (tab === 'tasks') return <TasksTab detail={detail} onRetry={onRetry} />;
  if (tab === 'commission') return <CommissionTab detail={detail} />;
  return null;
}

function ProfileTab({ detail }: { detail: CustomerDetailPanelDto }) {
  const customer = detail.customer;
  return (
    <div className="customer-detail-grid">
      <section className="customer-detail-card">
        <h3>Profile</h3>
        <KeyValue label="Status" value={label(customer.status)} />
        <KeyValue label="Lifecycle" value={label(customer.insight.lifecycle)} />
        <KeyValue label="CLV tier" value={label(customer.insight.clvTier)} />
        <KeyValue label="Health score" value={customer.insight.healthScore === null ? '-' : String(customer.insight.healthScore)} />
        <KeyValue label="Churn risk" value={label(customer.insight.churnRisk)} />
        <KeyValue label="Shopify customer" value={customer.shopifyCustomerId ?? '-'} />
      </section>
      <section className="customer-detail-card">
        <h3>Ownership</h3>
        {customer.assignments.length === 0 && <div className="customer-detail-muted">No axis owner assigned.</div>}
        {customer.assignments.map((assignment) => (
          <div key={assignment.id} className="customer-detail-row">
            <div>
              <strong>{label(assignment.axis)}</strong>
              <span>{assignment.memberName}</span>
            </div>
            <small>{label(assignment.source)}</small>
          </div>
        ))}
      </section>
      <section className="customer-detail-card">
        <h3>Segments</h3>
        {customer.segments.length === 0 && <div className="customer-detail-muted">No live segment membership.</div>}
        {customer.segments.map((segment) => (
          <div key={segment.id} className="customer-detail-row">
            <div>
              <strong><span className="customer-detail-dot" style={{ background: segment.color }} />{segment.name}</strong>
              <span>{segment.owners.map((owner) => owner.memberName).join(', ') || 'No owner'}</span>
            </div>
            <small>{date(segment.matchedAt)}</small>
          </div>
        ))}
      </section>
      <section className="customer-detail-card">
        <h3>Addresses</h3>
        <KeyValue label="Billing" value={formatJson(detail.tabs.profile.addresses.billing)} />
        <KeyValue label="Shipping" value={formatJson(detail.tabs.profile.addresses.shipping)} />
      </section>
    </div>
  );
}

function OrdersTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.shopifyOrders;
  if (rows.length === 0 && detail.customer.metrics.ordersCount > 0) {
    return (
      <EmptyTab
        title="Historical Shopify orders unavailable"
        body={`Shopify reports ${detail.customer.metrics.ordersCount} historical orders totaling ${money(detail.customer.metrics.lifetimeRevenue)}, but the current Admin token exposes no individual order rows.`}
        onRetry={onRetry}
      />
    );
  }
  if (rows.length === 0) return <EmptyTab title="No Shopify orders" body="No Shopify order rows are linked to this customer yet." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((order) => (
        <article key={order.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{order.orderNumber ?? order.shopifyOrderId ?? order.id}</strong>
              <span>{label(order.financialStatus ?? 'unknown')} - {label(order.fulfillmentStatus ?? order.fulfillmentMode)}</span>
            </div>
            <div className="customer-detail-amount">{money(order.totalPrice)}</div>
          </div>
          <div className="customer-detail-muted">{date(order.processedAt ?? order.createdAt)} - discounts {money(order.totalDiscounts)} - shipping {money(order.totalShipping)}</div>
        </article>
      ))}
    </div>
  );
}

function AircallTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.aircallCalls;
  if (rows.length === 0) return <EmptyTab title="No Aircall calls" body="No Aircall event currently matches this customer email or phone." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((call) => (
        <article key={call.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{label(call.eventType)} {label(call.direction ?? 'call')}</strong>
              <span>{call.contactPhone ?? call.contactEmail ?? 'Unknown contact'} - {duration(call.durationSeconds)}</span>
            </div>
            <small>{dateTime(call.eventTimestamp)}</small>
          </div>
          <p>{call.resolverSummary ?? call.transcriptPreview ?? 'Transcript or resolver output is not attached yet.'}</p>
          {call.psychTags.length > 0 && <div className="customer-detail-tags">{call.psychTags.map((tag) => <span key={tag}>{label(tag)}</span>)}</div>}
        </article>
      ))}
    </div>
  );
}

function SupportTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.support;
  if (rows.length === 0) return <EmptyTab title="No customer request history" body="No customer-request record is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((request) => (
        <article key={request.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{request.title}</strong>
              <span>{label(request.status)} - {label(request.priority)} - {request.assignedMemberName ?? 'Unassigned'}</span>
            </div>
            <small>{dateTime(request.updatedAt)}</small>
          </div>
          <p>{request.description ?? 'No description captured.'}</p>
          {request.comments.slice(0, 3).map((comment) => <blockquote key={comment.id}>{comment.body}</blockquote>)}
        </article>
      ))}
    </div>
  );
}

function EmailTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.email;
  if (rows.length === 0) return <EmptyTab title="No email deliveries" body="No transactional or marketing email delivery matches this customer email." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((mail) => (
        <article key={mail.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{mail.subject}</strong>
              <span>{label(mail.category)} - {label(mail.status)} - attempts {mail.attemptCount}</span>
            </div>
            <small>{dateTime(mail.sentAt ?? mail.createdAt)}</small>
          </div>
          <p>{mail.preview ?? mail.errorMessage ?? 'No delivery body preview.'}</p>
        </article>
      ))}
    </div>
  );
}

function MessagesTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.messages;
  if (rows.length === 0) return <EmptyTab title="No linked internal messages" body="Internal person messages can appear here when a thread is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((thread) => (
        <article key={thread.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{thread.title}</strong>
              <span>{thread.participants.length} participants</span>
            </div>
            <small>{dateTime(thread.updatedAt)}</small>
          </div>
          {thread.messages.slice(-4).map((message) => <blockquote key={message.id}>{message.body}</blockquote>)}
        </article>
      ))}
    </div>
  );
}

function NotesTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.notes;
  if (rows.length === 0) return <EmptyTab title="No internal notes" body="Notes saved from task brief or person workspace will appear here." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((note) => (
        <article key={note.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{note.title}</strong>
              <span>
                {label(note.kind)}
                {note.authorMemberName ? ` - ${note.authorMemberName}` : ''}
                {note.linkedQueueId ? ` - task ${note.linkedQueueId}` : ''}
              </span>
            </div>
            <small>{dateTime(note.updatedAt)}</small>
          </div>
          <p>{note.body}</p>
        </article>
      ))}
    </div>
  );
}

function TasksTab({ detail, onRetry }: { detail: CustomerDetailPanelDto; onRetry: () => void }) {
  const rows = detail.tabs.tasks;
  if (rows.length === 0) return <EmptyTab title="No tasks" body="No call or manual task is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((task) => (
        <article key={task.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{task.title}</strong>
              <span>{label(task.status)} - {label(task.priority)} - {task.assignedMemberName ?? 'Unassigned'}</span>
            </div>
            <small>{dateTime(task.dueAt ?? task.updatedAt)}</small>
          </div>
          <p>{task.description ?? 'No task description captured.'}</p>
          {task.matchedRuleName && <div className="customer-detail-muted">Rule: {task.matchedRuleName}</div>}
        </article>
      ))}
    </div>
  );
}

function CommissionTab({ detail }: { detail: CustomerDetailPanelDto }) {
  const commission = detail.tabs.commission;
  if (!commission) return <PanelState title="Commission hidden" body="Your role does not expose commission context for this customer." />;
  return (
    <div className="customer-detail-grid">
      <section className="customer-detail-card">
        <h3>Commission Basis</h3>
        <KeyValue label="Lifetime revenue" value={money(commission.lifetimeRevenue)} />
        <KeyValue label="Last 30d revenue" value={money(commission.revenue30d)} />
        <KeyValue label="Last 30d orders" value={String(commission.orders30d)} />
        <KeyValue label="Projected commission" value={money(commission.projectedCommission)} />
      </section>
      <section className="customer-detail-card">
        <h3>Status</h3>
        <p>{commission.note}</p>
      </section>
    </div>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{metricLabel}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KeyValue({ label: keyLabel, value }: { label: string; value: string }) {
  return (
    <div className="customer-detail-kv">
      <span>{keyLabel}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function EmptyTab({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <PanelState
      title={title}
      body={body}
      action={<button type="button" className="btn" onClick={onRetry}><RefreshCw size={14} /> Refresh</button>}
    />
  );
}

function PanelState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="customer-detail-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function date(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function duration(seconds: number | null) {
  if (!seconds) return '0m';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}m`;
}

function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function label(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatJson(value: unknown) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '-';
  }
}
