import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomerDetailPanelDto, CustomerDetailTab } from '@factory-engine-pro/contracts';
import {
  ClipboardList,
  Headphones,
  LayoutDashboard,
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

export interface CustomerDetailMainInfo {
  reason: string;
  segmentLabel: string;
  segmentColor: string;
  urgencyScore: number;
  churnRisk: 'lost' | 'at_risk' | null;
  productTags: string[];
  phone: string | null;
  email: string | null;
  orderLabel: string;
  ordersCount: number;
  totalSpent: number;
  lastCallLabel: string;
  lastCallSummary: string | null;
  lastContact: string;
  owner: string | null;
  openTasksCount: number;
  openRequestsCount: number;
  notesCount: number;
  latestNote: { body: string; authorName: string; createdAt: string } | null;
}

export interface CustomerDetailPanelProps {
  open: boolean;
  detail?: CustomerDetailPanelDto;
  isLoading: boolean;
  error?: string | null;
  onClose: () => void;
  onRetry: () => void;
  onCallCustomer?: (phone: string, customerId: string) => void;
  isCallingCustomer?: boolean;
  callMessage?: string | null;
  staffTerminology?: boolean;
  main?: CustomerDetailMainInfo;
  mainContent?: ReactNode;
}

const TAB_CONFIG: Partial<Record<CustomerDetailTab, { label: string; Icon: LucideIcon }>> = {
  profile: { label: 'Profile', Icon: UserRound },
  shopify_orders: { label: 'Shopify Orders', Icon: ShoppingBag },
  aircall_calls: { label: 'Aircall Calls', Icon: Phone },
  support: { label: 'Customer Requests', Icon: Headphones },
  email: { label: 'Email', Icon: Mail },
  messages: { label: 'Messages', Icon: MessageSquare },
  notes: { label: 'Notes', Icon: NotebookText },
  tasks: { label: 'Follow-ups', Icon: ClipboardList },
};

type PanelTab = CustomerDetailTab | 'main';

export function CustomerDetailPanel({
  open,
  detail,
  isLoading,
  error,
  onClose,
  onRetry,
  onCallCustomer,
  isCallingCustomer = false,
  callMessage,
  staffTerminology = false,
  main,
  mainContent,
}: CustomerDetailPanelProps) {
  const visibleKey = detail?.visibleTabs.join('|') ?? '';
  const visibleTabs = useMemo<PanelTab[]>(
    () => {
      const tabs = (detail?.visibleTabs ?? ['profile']).filter((tab) => tab !== 'commission');
      return main ? ['main', ...tabs] : tabs;
    },
    [visibleKey, detail, main],
  );
  const [activeTab, setActiveTab] = useState<PanelTab>('profile');

  useEffect(() => {
    if (!open) return;
    setActiveTab(main ? 'main' : 'profile');
  }, [main, open]);

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
          <div className="customer-detail-header-actions">
            {detail?.customer.phone ? (
              onCallCustomer ? (
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={`Call ${detail.customer.phone}`}
                  disabled={isCallingCustomer}
                  onClick={() => onCallCustomer(detail.customer.phone ?? '', detail.customer.id)}
                >
                  <Phone size={14} /> {isCallingCustomer ? 'Calling' : 'Call'}
                </button>
              ) : (
                <a className="btn ghost" href={`tel:${cleanPhone(detail.customer.phone)}`} aria-label={`Call ${detail.customer.phone}`}>
                  <Phone size={14} /> Call
                </a>
              )
            ) : null}
            <button type="button" className="customer-detail-icon-btn" onClick={onClose} aria-label="Close customer detail">
              <X size={18} />
            </button>
          </div>
        </header>
        {callMessage ? <div className="customer-detail-call-status">{callMessage}</div> : null}

        {isLoading && <PanelState title="Loading customer file" body="Reading live Shopify, Aircall, customer request, mail, note, and follow-up records." />}
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
              <Metric label="Follow-ups" value={String(detail.customer.metrics.openTaskCount)} />
            </div>

            <nav className="customer-detail-tabs" aria-label="Customer detail tabs">
              {visibleTabs.map((tab) => {
                const config = tab === 'main' ? { label: 'Main', Icon: LayoutDashboard } : TAB_CONFIG[tab];
                if (!config) return null;
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
              {activeTab === 'main' && main
                ? <MainTab main={main} mainContent={mainContent} staffTerminology={staffTerminology} />
                : renderTab(detail, activeTab as CustomerDetailTab, onRetry, staffTerminology)}
            </main>
          </>
        )}
      </section>
    </div>
  );
}

function MainTab({ main, mainContent, staffTerminology }: { main: CustomerDetailMainInfo; mainContent?: ReactNode; staffTerminology: boolean }) {
  if (mainContent) {
    return <div className="customer-detail-main-card">{mainContent}</div>;
  }
  const productTags = main.productTags.map((tag) => staffPanelText(tag, staffTerminology)).filter(Boolean);
  return (
    <div className="customer-detail-grid">
      <section className="customer-detail-card customer-detail-main-reason">
        <h3>Why this customer is open</h3>
        <p>{staffPanelText(main.reason, staffTerminology)}</p>
        <div className="customer-detail-main-chips">
          {productTags.map((tag) => <span key={tag} className="cd-main-chip product">{tag}</span>)}
          {main.churnRisk ? (
            <span className={`churn-badge ${main.churnRisk === 'lost' ? 'lost' : 'risk'}`}>
              {main.churnRisk === 'lost' ? 'Lost risk' : 'At risk'}
            </span>
          ) : null}
          <span className="cd-main-chip segment" style={{ background: main.segmentColor }}>{staffPanelText(main.segmentLabel, staffTerminology)}</span>
          <span className="cd-main-chip urgency" title="Urgency score">U{main.urgencyScore}</span>
        </div>
      </section>
      <section className="customer-detail-card">
        <h3>Contact</h3>
        <KeyValue label="Phone" value={main.phone ?? 'No phone'} />
        <KeyValue label="Email" value={main.email ?? 'No email'} />
        <KeyValue label="Last contact" value={date(main.lastContact)} />
        <KeyValue label="Latest call" value={staffPanelText(main.lastCallLabel, staffTerminology)} />
        <KeyValue label="Owner" value={staffPanelText(main.owner ?? 'Unassigned', staffTerminology)} />
      </section>
      <section className="customer-detail-card">
        <h3>Orders</h3>
        <KeyValue label="Latest order" value={staffPanelText(main.orderLabel, staffTerminology)} />
        <KeyValue label="Total orders" value={String(main.ordersCount)} />
        <KeyValue label="Total spent" value={money(main.totalSpent)} />
      </section>
      <section className="customer-detail-card">
        <h3>Open work</h3>
        <KeyValue label="Follow-ups" value={String(main.openTasksCount)} />
        <KeyValue label="Customer requests" value={String(main.openRequestsCount)} />
        <KeyValue label="Notes" value={String(main.notesCount)} />
      </section>
      {main.lastCallSummary ? (
        <section className="customer-detail-card">
          <h3>Last call summary</h3>
          <p>{staffPanelText(main.lastCallSummary, staffTerminology)}</p>
        </section>
      ) : null}
      {main.latestNote ? (
        <section className="customer-detail-card">
          <h3>Latest note</h3>
          <p>{staffPanelText(main.latestNote.body, staffTerminology)}</p>
          <div className="customer-detail-muted">{staffPanelText(main.latestNote.authorName, staffTerminology)} - {date(main.latestNote.createdAt)}</div>
        </section>
      ) : null}
    </div>
  );
}

function renderTab(detail: CustomerDetailPanelDto, tab: CustomerDetailTab, onRetry: () => void, staffTerminology: boolean) {
  if (tab === 'profile') return <ProfileTab detail={detail} staffTerminology={staffTerminology} />;
  if (tab === 'shopify_orders') return <OrdersTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'aircall_calls') return <AircallTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'support') return <SupportTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'email') return <EmailTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'messages') return <MessagesTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'notes') return <NotesTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'tasks') return <TasksTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  return null;
}

function ProfileTab({ detail, staffTerminology }: { detail: CustomerDetailPanelDto; staffTerminology: boolean }) {
  const customer = detail.customer;
  const customerListHeading = staffTerminology ? 'Customer lists' : 'Segments';
  const noCustomerListText = staffTerminology ? 'No live customer-list membership.' : 'No live segment membership.';
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
        {customer.assignments.length === 0 && (
          <div className="customer-detail-muted">No customer focus owner assigned.</div>
        )}
        {customer.assignments.map((assignment) => (
          <div key={assignment.id} className="customer-detail-row">
            <div>
              <strong>{staffTerminology ? customerFocusLabel(assignment.axis) : label(assignment.axis)}</strong>
              <span>{assignment.memberName}</span>
            </div>
            <small>{staffPanelText(label(assignment.source), staffTerminology)}</small>
          </div>
        ))}
      </section>
      <section className="customer-detail-card">
        <h3>{customerListHeading}</h3>
        {customer.segments.length === 0 && <div className="customer-detail-muted">{noCustomerListText}</div>}
        {customer.segments.map((segment) => (
          <div key={segment.id} className="customer-detail-row">
            <div>
              <strong><span className="customer-detail-dot" style={{ background: segment.color }} />{staffPanelText(segment.name, staffTerminology)}</strong>
              <span>{segment.owners.map((owner) => staffPanelText(owner.memberName, staffTerminology)).join(', ') || 'No owner'}</span>
            </div>
            <small>{date(segment.matchedAt)}</small>
          </div>
        ))}
      </section>
      <section className="customer-detail-card">
        <h3>Addresses</h3>
        <AddressBlock label="Billing" value={detail.tabs.profile.addresses.billing} />
        <AddressBlock label="Shipping" value={detail.tabs.profile.addresses.shipping} />
      </section>
    </div>
  );
}

function OrdersTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.shopifyOrders;
  if (rows.length === 0 && detail.customer.metrics.ordersCount > 0) {
    return (
      <EmptyTab
        title="Historical Shopify orders unavailable"
        body={`Shopify reports ${detail.customer.metrics.ordersCount} historical orders totaling ${money(detail.customer.metrics.lifetimeRevenue)}, but individual order rows are not available in this customer file yet.`}
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
              <span>{staffPanelText(`${label(order.financialStatus ?? 'unknown')} - ${label(order.fulfillmentStatus ?? order.fulfillmentMode)}`, staffTerminology)}</span>
            </div>
            <div className="customer-detail-amount">{money(order.totalPrice)}</div>
          </div>
          <div className="customer-detail-muted">{date(order.processedAt ?? order.createdAt)} - discounts {money(order.totalDiscounts)} - shipping {money(order.totalShipping)}</div>
        </article>
      ))}
    </div>
  );
}

function AircallTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
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
          <p>{staffPanelText(call.resolverSummary ?? call.transcriptPreview ?? 'Call notes or summary are not attached yet.', staffTerminology)}</p>
          {call.psychTags.length > 0 && <div className="customer-detail-tags">{call.psychTags.map((tag) => <span key={tag}>{staffPanelText(label(tag), staffTerminology)}</span>)}</div>}
        </article>
      ))}
    </div>
  );
}

function SupportTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.support;
  if (rows.length === 0) return <EmptyTab title="No customer request history" body="No customer-request record is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((request) => (
        <article key={request.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{staffPanelText(request.title, staffTerminology)}</strong>
              <span>{staffPanelText(`${label(request.status)} - ${label(request.priority)} - ${request.assignedMemberName ?? 'Unassigned'}`, staffTerminology)}</span>
            </div>
            <small>{dateTime(request.updatedAt)}</small>
          </div>
          <p>{staffPanelText(request.description ?? 'No description captured.', staffTerminology)}</p>
          {request.comments.slice(0, 3).map((comment) => <blockquote key={comment.id}>{staffPanelText(comment.body, staffTerminology)}</blockquote>)}
        </article>
      ))}
    </div>
  );
}

function EmailTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.email;
  if (rows.length === 0) return <EmptyTab title="No email deliveries" body="No transactional or marketing email delivery matches this customer email." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((mail) => (
        <article key={mail.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{staffPanelText(mail.subject, staffTerminology)}</strong>
              <span>{staffPanelText(`${label(mail.category)} - ${label(mail.status)} - attempts ${mail.attemptCount}`, staffTerminology)}</span>
            </div>
            <small>{dateTime(mail.sentAt ?? mail.createdAt)}</small>
          </div>
          <p>{staffPanelText(mail.preview ?? mail.errorMessage ?? 'No delivery body preview.', staffTerminology)}</p>
        </article>
      ))}
    </div>
  );
}

function MessagesTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.messages;
  if (rows.length === 0) return <EmptyTab title="No linked internal messages" body="Internal person messages can appear here when a thread is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((thread) => (
        <article key={thread.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{staffPanelText(thread.title, staffTerminology)}</strong>
              <span>{thread.participants.length} participants</span>
            </div>
            <small>{dateTime(thread.updatedAt)}</small>
          </div>
          {thread.messages.slice(-4).map((message) => <blockquote key={message.id}>{staffPanelText(message.body, staffTerminology)}</blockquote>)}
        </article>
      ))}
    </div>
  );
}

function NotesTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.notes;
  if (rows.length === 0) return <EmptyTab title="No internal notes" body="Notes saved from call plans or person workspace will appear here." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((note) => (
        <article key={note.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{staffPanelText(note.title, staffTerminology)}</strong>
              <span>
                {staffPanelText(label(note.kind), staffTerminology)}
                {note.authorMemberName ? ` - ${note.authorMemberName}` : ''}
                {note.linkedQueueId ? ` - follow-up ${note.linkedQueueId}` : ''}
              </span>
            </div>
            <small>{dateTime(note.updatedAt)}</small>
          </div>
          <p>{staffPanelText(note.body, staffTerminology)}</p>
        </article>
      ))}
    </div>
  );
}

function TasksTab({ detail, onRetry, staffTerminology }: { detail: CustomerDetailPanelDto; onRetry: () => void; staffTerminology: boolean }) {
  const rows = detail.tabs.tasks;
  if (rows.length === 0) return <EmptyTab title="No follow-ups" body="No call or manual follow-up is linked to this customer." onRetry={onRetry} />;
  return (
    <div className="customer-detail-list">
      {rows.map((task) => (
        <article key={task.id} className="customer-detail-card">
          <div className="customer-detail-row">
            <div>
              <strong>{staffPanelText(task.title, staffTerminology)}</strong>
              <span>{staffPanelText(`${label(task.status)} - ${label(task.priority)} - ${task.assignedMemberName ?? 'Unassigned'}`, staffTerminology)}</span>
            </div>
            <small>{dateTime(task.dueAt ?? task.updatedAt)}</small>
          </div>
          <p>{staffPanelText(task.description ?? 'No follow-up description captured.', staffTerminology)}</p>
        </article>
      ))}
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

function AddressBlock({ label: addressLabel, value }: { label: string; value: unknown }) {
  const address = normalizeAddress(value);
  if (address.empty) {
    return (
      <div className="customer-detail-address-block empty">
        <span>{addressLabel}</span>
        <strong>No address on file</strong>
      </div>
    );
  }
  return (
    <div className="customer-detail-address-block">
      <span>{addressLabel}</span>
      {address.name ? <strong>{address.name}</strong> : null}
      {address.company ? <div>{address.company}</div> : null}
      {address.lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
      {address.cityLine ? <div>{address.cityLine}</div> : null}
      {address.country ? <div>{address.country}</div> : null}
      {address.phone ? <div className="customer-detail-address-phone">Phone {address.phone}</div> : null}
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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dateTime(value: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function duration(seconds: number | null) {
  if (!seconds) return '0m';
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}m`;
}

function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

function label(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function customerFocusLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sales' || normalized === 'sale') return 'Purchase intent';
  if (normalized === 'account') return 'Customer care';
  if (normalized === 'support') return 'Customer request';
  return label(value);
}

function staffPanelText(value: string, staffTerminology: boolean) {
  if (!staffTerminology) return value;
  return value
    .replace(/\bAI\b/gi, 'call')
    .replace(/\bworkflow\s+rules?\b/gi, 'call routing')
    .replace(/\bworkflow\b/gi, 'follow-up')
    .replace(/\brule\s+engine\b/gi, 'call routing')
    .replace(/\brules?\b/gi, 'routing')
    .replace(/\baxis\b/gi, 'focus')
    .replace(/\bsales\b/gi, 'purchase intent')
    .replace(/\bsale\b/gi, 'purchase intent')
    .replace(/\bsupport\s+case\b/gi, 'customer request')
    .replace(/\bsupport\b/gi, 'customer request')
    .replace(/\btranscript\s+resolver\b/gi, 'call summary')
    .replace(/\btranscripts?\b/gi, 'call summary')
    .replace(/\bresolver\b/gi, 'summary')
    .replace(/\bdebug\b/gi, 'review')
    .replace(/\bcommission\b/gi, 'request');
}

function normalizeAddress(value: unknown) {
  const record = addressRecord(value);
  if (!record) {
    const text = typeof value === 'string' ? value.trim() : '';
    return {
      empty: !text,
      name: null,
      company: null,
      lines: text ? [text] : [],
      cityLine: null,
      country: null,
      phone: null,
    };
  }

  const firstName = stringField(record, 'first_name');
  const lastName = stringField(record, 'last_name');
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const city = stringField(record, 'city');
  const province = stringField(record, 'province') ?? stringField(record, 'province_code');
  const zip = stringField(record, 'zip');
  const cityLine = [
    city,
    [province, zip].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const lines = [stringField(record, 'address1'), stringField(record, 'address2')].filter(Boolean) as string[];
  return {
    empty: ![
      stringField(record, 'name'),
      combinedName,
      stringField(record, 'company'),
      ...lines,
      cityLine,
      stringField(record, 'country_name') ?? stringField(record, 'country') ?? stringField(record, 'country_code'),
      stringField(record, 'phone'),
    ].some(Boolean),
    name: stringField(record, 'name') ?? (combinedName || null),
    company: stringField(record, 'company'),
    lines,
    cityLine: cityLine || null,
    country: stringField(record, 'country_name') ?? stringField(record, 'country') ?? stringField(record, 'country_code'),
    phone: stringField(record, 'phone'),
  };
}

function addressRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}
