import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CustomerDetailPanelDto, CustomerDetailTab } from '@factory-engine-pro/contracts';
import { staffSafeDisplayText } from '@factory-engine-pro/contracts';
import {
  ChevronLeft,
  ClipboardList,
  ExternalLink,
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
  customization?: CustomerDetailPanelCustomization | null;
  onOpenOrder?: (orderId: string) => void;
  shopifyAdminCustomerUrl?: string | null;
  ownershipEditor?: CustomerOwnershipEditor | null;
}

export interface CustomerOwnershipEditor {
  options: Array<{ id: string; label: string; email: string }>;
  isSaving: boolean;
  onAssign: (axis: string, memberId: string) => void;
}

export interface CustomerDetailPanelCustomization {
  visibleFields?: string[];
  hiddenFields?: string[];
  copyOverrides?: Record<string, string>;
  className?: string;
}

const TAB_CONFIG: Partial<Record<CustomerDetailTab, { label: string; Icon: LucideIcon }>> = {
  profile: { label: 'Profile', Icon: UserRound },
  shopify_orders: { label: 'Shopify Orders', Icon: ShoppingBag },
  aircall_calls: { label: 'Aircall Calls', Icon: Phone },
  support: { label: 'Customer Requests', Icon: Headphones },
  email: { label: 'Email', Icon: Mail },
  messages: { label: 'Messages', Icon: MessageSquare },
  notes: { label: 'Notes', Icon: NotebookText },
  tasks: { label: 'Tasks', Icon: ClipboardList },
};

type PanelTab = CustomerDetailTab | 'main';
type CustomerDetailOrder = CustomerDetailPanelDto['tabs']['shopifyOrders'][number];

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
  customization,
  onOpenOrder,
  shopifyAdminCustomerUrl,
  ownershipEditor,
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
  const [selectedOrder, setSelectedOrder] = useState<CustomerDetailOrder | null>(null);
  const showCustomerName = customerDetailFieldVisible(customization, 'customerName', true, true);
  const showPhone = customerDetailFieldVisible(customization, 'phone', true, true);
  const showEmail = customerDetailFieldVisible(customization, 'email');
  const showLatestOrder = customerDetailFieldVisible(customization, 'latestOrder');
  const showLatestCall = customerDetailFieldVisible(customization, 'latestCall');
  const showOpenFollowUp = customerDetailFieldVisible(customization, 'openFollowUp');

  useEffect(() => {
    if (!open) return;
    setActiveTab(main ? 'main' : 'profile');
    setSelectedOrder(null);
  }, [detail?.customer.id, main, open]);

  useEffect(() => {
    if (!open) return;
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0] ?? 'profile');
    }
  }, [activeTab, open, visibleTabs]);

  if (!open) return null;

  return (
    <div className="customer-detail-backdrop" role="presentation">
      <section className={`customer-detail-panel${customization?.className ? ` ${customization.className}` : ''}`} role="dialog" aria-modal="true" aria-label="Customer detail panel">
        <header className="customer-detail-header">
          <div className="customer-detail-title">
            <span className="customer-detail-kicker">{customerDetailCopy(customization, 'kicker', 'Customer 360')}</span>
            <h2>{showCustomerName ? detail?.customer.name ?? 'Customer detail' : 'Customer detail'}</h2>
            <div className="customer-detail-sub">
              {showEmail ? <span>{detail?.customer.email ?? 'No email'}</span> : null}
              {showPhone ? <span>{detail?.customer.phone ? `Phone ${detail.customer.phone}` : 'No phone on file'}</span> : null}
            </div>
          </div>
          <div className="customer-detail-header-actions">
            {showPhone && detail?.customer.phone ? (
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
            {detail?.customer.email ? (
              <a className="btn ghost" href={`mailto:${detail.customer.email}`} aria-label={`Email ${detail.customer.email}`}>
                <Mail size={14} /> Email
              </a>
            ) : null}
            {shopifyAdminCustomerUrl ? (
              <a className="btn ghost" href={shopifyAdminCustomerUrl} target="_blank" rel="noreferrer" aria-label="Open customer in Shopify">
                <ExternalLink size={14} /> Shopify
              </a>
            ) : null}
            <button type="button" className="customer-detail-icon-btn" onClick={onClose} aria-label="Close customer detail">
              <X size={18} />
            </button>
          </div>
        </header>
        {callMessage ? <div className="customer-detail-call-status">{callMessage}</div> : null}

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
              {showLatestOrder ? <Metric label={customerDetailCopy(customization, 'revenueMetric', 'Revenue')} value={money(detail.customer.metrics.lifetimeRevenue)} /> : null}
              {showLatestOrder ? <Metric label={customerDetailCopy(customization, 'ordersMetric', 'Orders')} value={String(detail.customer.metrics.ordersCount)} /> : null}
              {showLatestCall ? <Metric label={customerDetailCopy(customization, 'callsMetric', 'Calls')} value={String(detail.customer.metrics.callsCount)} /> : null}
              {showOpenFollowUp ? <Metric label={customerDetailCopy(customization, 'openRequestsMetric', 'Open requests')} value={String(detail.customer.metrics.openSupportCount)} /> : null}
              {showOpenFollowUp ? <Metric label={customerDetailCopy(customization, 'tasksMetric', 'Tasks')} value={String(detail.customer.metrics.openTaskCount)} /> : null}
            </div>

            <nav className="customer-detail-tabs" aria-label="Customer detail tabs">
              {visibleTabs.map((tab) => {
                const config = tab === 'main' ? { label: 'Main', Icon: LayoutDashboard } : TAB_CONFIG[tab];
                if (!config) return null;
                const tabLabel = customerDetailCopy(customization, `tab.${tab}`, config.label);
                return (
                  <button
                    key={tab}
                    type="button"
                    className={tab === activeTab ? 'active' : ''}
                    onClick={() => setActiveTab(tab)}
                  >
                    <config.Icon size={14} /> {tabLabel}
                  </button>
                );
              })}
            </nav>

            <main className="customer-detail-body">
              {selectedOrder
                ? <OrderDetailTab order={selectedOrder} onBack={() => { setSelectedOrder(null); setActiveTab('shopify_orders'); }} staffTerminology={staffTerminology} />
                : activeTab === 'main' && main
                ? <MainTab main={main} mainContent={mainContent} staffTerminology={staffTerminology} customization={customization} />
                : renderTab(
                    detail,
                    activeTab as CustomerDetailTab,
                    onRetry,
                    staffTerminology,
                    (order) => onOpenOrder ? onOpenOrder(order.id) : setSelectedOrder(order),
                    ownershipEditor,
                  )}
            </main>
          </>
        )}
      </section>
    </div>
  );
}

function MainTab({
  main,
  mainContent,
  staffTerminology,
  customization,
}: {
  main: CustomerDetailMainInfo;
  mainContent?: ReactNode;
  staffTerminology: boolean;
  customization?: CustomerDetailPanelCustomization | null;
}) {
  if (mainContent) {
    return <div className="customer-detail-main-card">{mainContent}</div>;
  }
  const productTags = main.productTags.map((tag) => staffPanelText(tag, staffTerminology)).filter(Boolean);
  const showPhone = customerDetailFieldVisible(customization, 'phone', true, true);
  const showEmail = customerDetailFieldVisible(customization, 'email');
  const showLatestOrder = customerDetailFieldVisible(customization, 'latestOrder');
  const showLatestCall = customerDetailFieldVisible(customization, 'latestCall');
  const showOpenFollowUp = customerDetailFieldVisible(customization, 'openFollowUp');
  const showLatestNote = customerDetailFieldVisible(customization, 'latestNote');
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
        {showPhone ? <KeyValue label="Phone" value={main.phone ?? 'No phone'} /> : null}
        {showEmail ? <KeyValue label="Email" value={main.email ?? 'No email'} /> : null}
        <KeyValue label="Last contact" value={date(main.lastContact)} />
        {showLatestCall ? <KeyValue label="Latest call" value={staffPanelText(main.lastCallLabel, staffTerminology)} /> : null}
        <KeyValue label="Owner" value={staffPanelText(main.owner ?? 'Unassigned', staffTerminology)} />
      </section>
      {showLatestOrder ? <section className="customer-detail-card">
        <h3>Orders</h3>
        <KeyValue label="Latest order" value={staffPanelText(main.orderLabel, staffTerminology)} />
        <KeyValue label="Total orders" value={String(main.ordersCount)} />
        <KeyValue label="Total spent" value={money(main.totalSpent)} />
      </section> : null}
      {showOpenFollowUp ? <section className="customer-detail-card">
        <h3>Open work</h3>
        <KeyValue label="Open tasks" value={String(main.openTasksCount)} />
        <KeyValue label="Customer requests" value={String(main.openRequestsCount)} />
        <KeyValue label="Notes" value={String(main.notesCount)} />
      </section> : null}
      {showLatestCall && main.lastCallSummary ? (
        <section className="customer-detail-card">
          <h3>Last call summary</h3>
          <p>{staffPanelText(main.lastCallSummary, staffTerminology)}</p>
        </section>
      ) : null}
      {showLatestNote && main.latestNote ? (
        <section className="customer-detail-card">
          <h3>Latest note</h3>
          <p>{staffPanelText(main.latestNote.body, staffTerminology)}</p>
          <div className="customer-detail-muted">{staffPanelText(main.latestNote.authorName, staffTerminology)} - {date(main.latestNote.createdAt)}</div>
        </section>
      ) : null}
    </div>
  );
}

function renderTab(
  detail: CustomerDetailPanelDto,
  tab: CustomerDetailTab,
  onRetry: () => void,
  staffTerminology: boolean,
  onOpenOrder: (order: CustomerDetailOrder) => void,
  ownershipEditor?: CustomerOwnershipEditor | null,
) {
  if (tab === 'profile') return <ProfileTab detail={detail} staffTerminology={staffTerminology} ownershipEditor={ownershipEditor} />;
  if (tab === 'shopify_orders') return <OrdersTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} onOpenOrder={onOpenOrder} />;
  if (tab === 'aircall_calls') return <AircallTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'support') return <SupportTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'email') return <EmailTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'messages') return <MessagesTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'notes') return <NotesTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  if (tab === 'tasks') return <TasksTab detail={detail} onRetry={onRetry} staffTerminology={staffTerminology} />;
  return null;
}

function ProfileTab({
  detail,
  staffTerminology,
  ownershipEditor,
}: {
  detail: CustomerDetailPanelDto;
  staffTerminology: boolean;
  ownershipEditor?: CustomerOwnershipEditor | null;
}) {
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
        {ownershipEditor ? (
          <div className="customer-detail-owner-editor">
            {['sales', 'account', 'support'].map((axis) => {
              const assignment = customer.assignments.find((row) => row.axis === axis);
              return (
                <label key={axis}>
                  <span>{staffTerminology ? customerFocusLabel(axis) : label(axis)}</span>
                  <select
                    value={assignment?.memberId ?? ''}
                    disabled={ownershipEditor.isSaving || ownershipEditor.options.length === 0}
                    onChange={(event) => event.target.value && ownershipEditor.onAssign(axis, event.target.value)}
                  >
                    <option value="">Select owner</option>
                    {ownershipEditor.options.map((option) => (
                      <option key={option.id} value={option.id}>{option.label} - {option.email}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : null}
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

function OrdersTab({
  detail,
  onRetry,
  staffTerminology,
  onOpenOrder,
}: {
  detail: CustomerDetailPanelDto;
  onRetry: () => void;
  staffTerminology: boolean;
  onOpenOrder: (order: CustomerDetailOrder) => void;
}) {
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
        <button key={order.id} type="button" className="customer-detail-card customer-detail-order-card" onClick={() => onOpenOrder(order)}>
          <div className="customer-detail-row">
            <div>
              <strong>{order.orderNumber ?? order.shopifyOrderId ?? order.id}</strong>
              <span>{staffPanelText(`${label(order.financialStatus ?? 'unknown')} - ${label(order.fulfillmentStatus ?? order.fulfillmentMode)}`, staffTerminology)}</span>
            </div>
            <div className="customer-detail-amount">{money(order.totalPrice, order.currency)}</div>
          </div>
          <div className="customer-detail-muted">{date(order.processedAt ?? order.createdAt)} - discounts {money(order.totalDiscounts, order.currency)} - shipping {money(order.totalShipping, order.currency)}</div>
          <span className="customer-detail-order-open">Open complete order detail</span>
        </button>
      ))}
    </div>
  );
}

function OrderDetailTab({
  order,
  onBack,
  staffTerminology,
}: {
  order: CustomerDetailOrder;
  onBack: () => void;
  staffTerminology: boolean;
}) {
  const [tab, setTab] = useState<'overview' | 'items' | 'delivery' | 'financial'>('overview');
  const lineItems = orderLineItems(order.lineItems);
  const fulfillments = jsonRecords(order.fulfillments);
  const refunds = jsonRecords(order.refunds);
  const discountCodes = displayValues(order.discountCodes);
  const designFiles = jsonRecords(order.designFiles);
  const title = order.orderNumber ?? order.shopifyOrderId ?? order.id;

  return (
    <section className="customer-detail-order-detail" aria-label={`Order ${title} detail`}>
      <header className="customer-detail-order-head">
        <div>
          <button type="button" className="customer-detail-back-link" onClick={onBack}><ChevronLeft size={15} /> Back to orders</button>
          <h3>Order {title}</h3>
          <p>{staffPanelText(`${label(order.financialStatus ?? 'unknown')} payment - ${label(order.fulfillmentStatus ?? order.fulfillmentMode)} fulfillment`, staffTerminology)}</p>
        </div>
        <div className="customer-detail-order-total">{money(order.totalPrice, order.currency)}</div>
      </header>

      <nav className="customer-detail-order-tabs" aria-label="Order detail sections">
        {([
          ['overview', 'Overview'],
          ['items', `Items (${lineItems.length})`],
          ['delivery', 'Delivery'],
          ['financial', 'Payment'],
        ] as const).map(([id, labelText]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{labelText}</button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="customer-detail-grid">
          <section className="customer-detail-card">
            <h3>Order status</h3>
            <KeyValue label="Placed" value={dateTime(order.processedAt ?? order.createdAt)} />
            <KeyValue label="Payment" value={label(order.financialStatus)} />
            <KeyValue label="Fulfillment" value={label(order.fulfillmentStatus ?? order.fulfillmentMode)} />
            <KeyValue label="Items" value={String(lineItems.reduce((sum, item) => sum + item.quantity, 0))} />
          </section>
          <section className="customer-detail-card">
            <h3>Order context</h3>
            <KeyValue label="Order subtotal" value={money(order.subtotal, order.currency)} />
            <KeyValue label="Shipping" value={money(order.totalShipping, order.currency)} />
            <KeyValue label="Tax" value={money(order.totalTax, order.currency)} />
            {order.tags.length > 0 ? <div className="customer-detail-tags">{order.tags.map((tag) => <span key={tag}>{staffPanelText(tag, staffTerminology)}</span>)}</div> : <div className="customer-detail-muted">No Shopify order tags.</div>}
          </section>
          {order.note ? <section className="customer-detail-card customer-detail-order-note"><h3>Order note</h3><p>{staffPanelText(order.note, staffTerminology)}</p></section> : null}
          {designFiles.length > 0 ? <section className="customer-detail-card customer-detail-order-note"><h3>Attached production files</h3><OrderDesignFiles files={designFiles} /></section> : null}
        </div>
      )}

      {tab === 'items' && (
        lineItems.length === 0
          ? <EmptyTab title="No line items captured" body="This Shopify order does not contain line item detail in the current sync record." onRetry={onBack} />
          : <div className="customer-detail-list">{lineItems.map((item, index) => <OrderLineItem key={`${item.id ?? item.title}-${index}`} item={item} currency={order.currency} staffTerminology={staffTerminology} />)}</div>
      )}

      {tab === 'delivery' && (
        <div className="customer-detail-grid">
          <section className="customer-detail-card"><h3>Shipping address</h3><AddressBlock label="Shipping" value={order.shippingAddress} /></section>
          <section className="customer-detail-card"><h3>Billing address</h3><AddressBlock label="Billing" value={order.billingAddress} /></section>
          <section className="customer-detail-card customer-detail-order-note">
            <h3>Fulfillment and tracking</h3>
            {fulfillments.length === 0 ? <div className="customer-detail-muted">No fulfillment shipment detail is attached yet.</div> : <FulfillmentList rows={fulfillments} />}
          </section>
        </div>
      )}

      {tab === 'financial' && (
        <div className="customer-detail-grid">
          <section className="customer-detail-card">
            <h3>Amount breakdown</h3>
            <KeyValue label="Subtotal" value={money(order.subtotal, order.currency)} />
            <KeyValue label="Discounts" value={money(order.totalDiscounts, order.currency)} />
            <KeyValue label="Shipping" value={money(order.totalShipping, order.currency)} />
            <KeyValue label="Tax" value={money(order.totalTax, order.currency)} />
            <KeyValue label="Total" value={money(order.totalPrice, order.currency)} />
          </section>
          <section className="customer-detail-card">
            <h3>Discount and refund history</h3>
            {discountCodes.length > 0 ? <KeyValue label="Discount codes" value={discountCodes.join(', ')} /> : <div className="customer-detail-muted">No discount code captured.</div>}
            {refunds.length > 0 ? <RefundList rows={refunds} /> : <div className="customer-detail-muted" style={{ marginTop: 10 }}>No refund record captured.</div>}
          </section>
        </div>
      )}
    </section>
  );
}

function OrderLineItem({ item, currency, staffTerminology }: { item: OrderLineItem; currency: string; staffTerminology: boolean }) {
  return (
    <article className="customer-detail-card">
      <div className="customer-detail-row">
        <div>
          <strong>{staffPanelText(item.title, staffTerminology)}</strong>
          <span>{[item.variantTitle, item.sku ? `SKU ${item.sku}` : null].filter(Boolean).join(' - ') || 'Variant details not captured'}</span>
        </div>
        <div className="customer-detail-amount">{item.quantity} x {item.unitPrice === null ? '-' : money(item.unitPrice, currency)}</div>
      </div>
      {item.properties.length > 0 ? <OrderProperties properties={item.properties} /> : null}
    </article>
  );
}

function OrderProperties({ properties }: { properties: Array<{ name: string; value: string }> }) {
  return <div className="customer-detail-order-properties">{properties.map((property) => {
    const url = httpUrl(property.value);
    return <div key={`${property.name}-${property.value}`}><span>{property.name}</span>{url ? <a href={url} target="_blank" rel="noreferrer">Open linked file</a> : <strong>{property.value}</strong>}</div>;
  })}</div>;
}

function OrderDesignFiles({ files }: { files: Array<Record<string, unknown>> }) {
  return <div className="customer-detail-order-files">{files.map((file, index) => {
    const name = textFromRecord(file, ['fileName', 'lineItemTitle', 'title']) ?? `File ${index + 1}`;
    const url = httpUrl(textFromRecord(file, ['previewUrl', 'uploadedFileUrl', 'printReadyUrl', 'editUrl', 'downloadUrl', 'url']));
    return <div key={`${name}-${index}`}><strong>{name}</strong>{url ? <a href={url} target="_blank" rel="noreferrer">Open file</a> : <span>File metadata is present; no accessible link was captured.</span>}</div>;
  })}</div>;
}

function FulfillmentList({ rows }: { rows: Array<Record<string, unknown>> }) {
  return <div className="customer-detail-order-files">{rows.map((row, index) => {
    const tracking = jsonRecords(row.tracking_info ?? row.trackingInfo);
    const status = textFromRecord(row, ['status', 'shipmentStatus']) ?? `Shipment ${index + 1}`;
    const trackingText = tracking.map((entry) => [textFromRecord(entry, ['company']), textFromRecord(entry, ['number'])].filter(Boolean).join(' ')).filter(Boolean).join(', ');
    const url = httpUrl(textFromRecord(row, ['tracking_url', 'trackingUrl'])) ?? httpUrl(textFromRecord(tracking[0] ?? {}, ['url']));
    return <div key={`${status}-${index}`}><strong>{status}</strong><span>{trackingText || 'Tracking details have not been supplied.'}</span>{url ? <a href={url} target="_blank" rel="noreferrer">Track shipment</a> : null}</div>;
  })}</div>;
}

function RefundList({ rows }: { rows: Array<Record<string, unknown>> }) {
  return <div className="customer-detail-order-files">{rows.map((row, index) => {
    const amount = textFromRecord(row, ['amount', 'totalRefunded', 'total_refunded']) ?? moneyFromSet(row.totalRefundedSet);
    const reason = textFromRecord(row, ['note', 'reason']) ?? `Refund ${index + 1}`;
    return <div key={`${reason}-${index}`}><strong>{reason}</strong><span>{amount ?? 'Amount not captured'}{textFromRecord(row, ['createdAt', 'created_at']) ? ` - ${dateTime(textFromRecord(row, ['createdAt', 'created_at']))}` : ''}</span></div>;
  })}</div>;
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
  if (rows.length === 0) return <EmptyTab title="No personnel notes" body="Notes saved from call plans or customer history will appear here." onRetry={onRetry} />;
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
                {note.linkedQueueId ? ` - task ${note.linkedQueueId}` : ''}
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
  if (rows.length === 0) return <EmptyTab title="No tasks" body="No call or manual task is linked to this customer." onRetry={onRetry} />;
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
          <p>{staffPanelText(task.description ?? 'No task description captured.', staffTerminology)}</p>
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

function money(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency || 'USD'} ${value.toFixed(2)}`;
  }
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

interface OrderLineItem {
  id: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: number | null;
  properties: Array<{ name: string; value: string }>;
}

function orderLineItems(value: unknown): OrderLineItem[] {
  return jsonRecords(value).map((row, index) => {
    const quantity = numberFromRecord(row, ['quantity', 'qty']) ?? 0;
    const unitPrice = numberFromRecord(row, ['price', 'unitPrice', 'unit_price']) ?? moneyAmountFromSet(row.originalUnitPriceSet);
    return {
      id: textFromRecord(row, ['id', 'lineItemId', 'line_item_id']),
      title: textFromRecord(row, ['title', 'name', 'productTitle']) ?? `Line item ${index + 1}`,
      variantTitle: textFromRecord(row, ['variant_title', 'variantTitle']),
      sku: textFromRecord(row, ['sku']),
      quantity,
      unitPrice,
      properties: orderProperties(row.properties ?? row.customAttributes),
    };
  });
}

function orderProperties(value: unknown): Array<{ name: string; value: string }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const row = recordFrom(entry);
      if (!row) return [];
      const name = textFromRecord(row, ['name', 'key']);
      const propertyValue = textFromRecord(row, ['value']);
      return name && propertyValue ? [{ name, value: propertyValue }] : [];
    });
  }
  const record = recordFrom(value);
  return record
    ? Object.entries(record)
      .map(([name, propertyValue]) => ({ name, value: scalarText(propertyValue) }))
      .filter((property) => property.value)
    : [];
}

function jsonRecords(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap((entry) => {
    const record = recordFrom(entry);
    return record ? [record] : [];
  });
  const record = recordFrom(value);
  if (!record) return [];
  if (Array.isArray(record.nodes)) return jsonRecords(record.nodes);
  return [record];
}

function displayValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      const record = recordFrom(entry);
      return record ? textFromRecord(record, ['code', 'title', 'name']) ?? '' : '';
    }).filter(Boolean);
  }
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function textFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = scalarText(record[key]);
    if (value) return value;
  }
  return null;
}

function numberFromRecord(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function moneyFromSet(value: unknown) {
  const root = recordFrom(value);
  const shopMoney = recordFrom(root?.shopMoney);
  const amount = Number(shopMoney?.amount);
  const currency = scalarText(shopMoney?.currencyCode) || 'USD';
  return Number.isFinite(amount) ? money(amount, currency) : null;
}

function moneyAmountFromSet(value: unknown): number | null {
  const root = recordFrom(value);
  const shopMoney = recordFrom(root?.shopMoney);
  const amount = Number(shopMoney?.amount);
  return Number.isFinite(amount) ? amount : null;
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
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
  return staffSafeDisplayText(value);
}

function customerDetailFieldVisible(
  customization: CustomerDetailPanelCustomization | null | undefined,
  field: string,
  defaultVisible = true,
  required = false,
) {
  if (required) return true;
  if (!customization) return defaultVisible;
  if (customization.visibleFields?.length) return customization.visibleFields.includes(field);
  if (customization.hiddenFields?.includes(field)) return false;
  return defaultVisible;
}

function customerDetailCopy(
  customization: CustomerDetailPanelCustomization | null | undefined,
  key: string,
  fallback: string,
) {
  return staffSafeDisplayText(customization?.copyOverrides?.[key] ?? fallback);
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
