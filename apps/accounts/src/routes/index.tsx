import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowUpRight, CreditCard, Layers3, RotateCw, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import {
  fetchBuyerOrders,
  fetchInvoices,
  fetchProfile,
  fetchReorderTemplates,
  type BuyerInvoice,
  type BuyerOrder,
  type ReorderTemplate,
} from '@/lib/portal';

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function fmtDate(value: string | null | undefined) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PortalHomeMetric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="val">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function PortalHomeEmpty({ title, body, to, cta }: { title: string; body: string; to: string; cta: string }) {
  return (
    <div className="portal-home-empty">
      <AlertCircle size={16} />
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      <Link to={to} className="btn">{cta}</Link>
    </div>
  );
}

function OrderRow({ order }: { order: BuyerOrder }) {
  return (
    <Link to="/orders" hash={`order-${order.id}`} className="portal-home-row">
      <div className="portal-home-row-icon"><Truck size={15} /></div>
      <div className="portal-home-row-main">
        <strong>{order.orderNumber}</strong>
        <span>{order.itemsCount} items - {fmtDate(order.placedAt)} - {order.fulfillmentStatus ?? order.status}</span>
      </div>
      <div className="portal-home-row-side">
        <strong>{fmtMoney(order.totalUsd)}</strong>
        <span>{order.canReorder ? 'Reorder ready' : 'Review required'}</span>
      </div>
    </Link>
  );
}

function InvoiceRow({ invoice }: { invoice: BuyerInvoice }) {
  const isPayable = invoice.balanceUsd > 0;
  return (
    <Link to="/invoices" hash={`row-invoice-${invoice.id}`} className={`portal-home-row${isPayable ? ' warn' : ''}`}>
      <div className="portal-home-row-icon"><CreditCard size={15} /></div>
      <div className="portal-home-row-main">
        <strong>{invoice.invoiceNumber}</strong>
        <span>{invoice.orderNumber ?? 'Not linked to an order'} - due {fmtDate(invoice.dueAt)}</span>
      </div>
      <div className="portal-home-row-side">
        <strong>{fmtMoney(invoice.balanceUsd)}</strong>
        <span>{isPayable ? 'Balance due' : invoice.status}</span>
      </div>
    </Link>
  );
}

function ReorderRow({ template }: { template: ReorderTemplate }) {
  const eligible = template.items.filter((item) => item.canReorder).length;
  return (
    <Link to="/reorder" className={`portal-home-row${template.canReorder ? ' success' : ''}`}>
      <div className="portal-home-row-icon"><RotateCw size={15} /></div>
      <div className="portal-home-row-main">
        <strong>{template.name}</strong>
        <span>{eligible} of {template.items.length} items ready - last used {fmtDate(template.lastUsedAt)}</span>
      </div>
      <div className="portal-home-row-side">
        <span>{template.canReorder ? 'Ready' : 'Needs review'}</span>
      </div>
    </Link>
  );
}

function HomeView() {
  const { t } = useTranslation();
  const orders = useQuery({
    queryKey: ['home', 'orders'],
    queryFn: () => fetchBuyerOrders({ status: 'all', limit: 3 }),
  });
  const invoices = useQuery({
    queryKey: ['home', 'invoices'],
    queryFn: () => fetchInvoices({ status: 'all', limit: 5 }),
  });
  const reorderTemplates = useQuery({
    queryKey: ['home', 'reorder-templates'],
    queryFn: fetchReorderTemplates,
  });
  const profile = useQuery({
    queryKey: ['home', 'profile'],
    queryFn: fetchProfile,
  });

  const orderRows = orders.data?.data ?? [];
  const invoiceRows = invoices.data?.data ?? [];
  const unpaidInvoices = invoiceRows.filter((invoice) => invoice.balanceUsd > 0);
  const reorderRows = (reorderTemplates.data ?? []).slice(0, 3);
  const reorderReady = (reorderTemplates.data ?? []).filter((template) => template.canReorder).length;
  const recentOrderTotal = orderRows.reduce((sum, order) => sum + order.totalUsd, 0);
  const outstanding = invoiceRows.reduce((sum, invoice) => sum + invoice.balanceUsd, 0);

  const hasAnyError = orders.isError || invoices.isError || reorderTemplates.isError;

  return (
    <>
      <PageHeader titleI18nKey="home.title" subtitleI18nKey="home.subtitle" />

      {profile.data?.taxExemption?.warningMessage ? (
        <div className={`portal-tax-notice${profile.data.taxExemption.purchasingRestricted ? ' restricted' : ''}`}>
          <AlertCircle size={18} />
          <div>
            <strong>{profile.data.taxExemption.purchasingRestricted ? 'Tax-exempt purchasing is paused' : 'Certificate renewal needed'}</strong>
            <span>{profile.data.taxExemption.warningMessage} Expiration date: {fmtDate(profile.data.taxExemption.expiresAt)}.</span>
          </div>
          <Link to="/profile" className="btn">Update account documents</Link>
        </div>
      ) : null}

      <div className="portal-home-hero">
        <div>
          <span>{t('home.next_step_label')}</span>
          <h3>
            {unpaidInvoices.length > 0
              ? 'Review open invoices before the next reorder.'
              : reorderReady > 0
                  ? 'Reorder from a recent approved basket.'
                  : 'Review recent orders and account activity.'}
          </h3>
          <p>Orders, invoices, and reorder options stay connected to your Shopify customer account.</p>
        </div>
        <div className="portal-home-hero-actions">
          {unpaidInvoices.length > 0 ? (
            <Link to="/invoices" className="btn primary"><CreditCard size={13} /> Pay or review invoices</Link>
          ) : (
            <Link to="/reorder" className="btn primary"><RotateCw size={13} /> Start reorder</Link>
          )}
          <Link to="/orders" className="btn">Open orders</Link>
        </div>
      </div>

      <div className="kpis four">
        <PortalHomeMetric label="Recent orders" value={orders.data?.meta.count ?? 0} sub={`${fmtMoney(recentOrderTotal)} on this page`} />
        <PortalHomeMetric label="Open invoices" value={unpaidInvoices.length} sub={`${fmtMoney(outstanding)} visible balance`} />
        <PortalHomeMetric label="Reorder ready" value={reorderReady} sub="templates with available items" />
        <PortalHomeMetric label="Account orders" value={profile.data?.ordersCount ?? 0} sub="linked from Shopify" />
      </div>

      {hasAnyError ? (
        <div className="portal-home-errors">
          {orders.isError ? <ErrorState title="Could not load recent orders" error={orders.error} retry={() => orders.refetch()} /> : null}
          {invoices.isError ? <ErrorState title="Could not load invoices" error={invoices.error} retry={() => invoices.refetch()} /> : null}
          {reorderTemplates.isError ? <ErrorState title="Could not load reorder options" error={reorderTemplates.error} retry={() => reorderTemplates.refetch()} /> : null}
        </div>
      ) : null}

      <div className="portal-home-grid">
        <section className="portal-home-panel">
          <header>
            <div>
              <span>Recent orders</span>
              <strong>Track and reorder from actual order history</strong>
            </div>
            <Link to="/orders" className="btn">All orders</Link>
          </header>
          {orders.isLoading ? (
            <div className="portal-home-loading">Loading recent orders...</div>
          ) : orderRows.length === 0 ? (
            <PortalHomeEmpty title="No orders found" body="Orders will appear here as soon as they are linked to this account." to="/products" cta="Browse catalog" />
          ) : (
            <div className="portal-home-list">{orderRows.map((order) => <OrderRow key={order.id} order={order} />)}</div>
          )}
        </section>

        <section className="portal-home-panel">
          <header>
            <div>
              <span>Invoices</span>
              <strong>Payable records stay separate from order receipts</strong>
            </div>
            <Link to="/invoices" className="btn">All invoices</Link>
          </header>
          {invoices.isLoading ? (
            <div className="portal-home-loading">Loading invoices...</div>
          ) : invoiceRows.length === 0 ? (
            <PortalHomeEmpty title="No invoices yet" body="Only official invoices are shown here. Order receipts do not become payable invoices." to="/orders" cta="View orders" />
          ) : (
            <div className="portal-home-list">{invoiceRows.slice(0, 3).map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}</div>
          )}
        </section>

        <section className="portal-home-panel">
          <header>
            <div>
              <span>Reorder options</span>
              <strong>Use recent baskets when availability is clear</strong>
            </div>
            <Link to="/reorder" className="btn">Reorder</Link>
          </header>
          {reorderTemplates.isLoading ? (
            <div className="portal-home-loading">Loading reorder options...</div>
          ) : reorderRows.length === 0 ? (
            <PortalHomeEmpty title="No reorder templates" body="Reorder shortcuts appear after order line items can be matched safely." to="/orders" cta="Review orders" />
          ) : (
            <div className="portal-home-list">{reorderRows.map((template) => <ReorderRow key={template.id} template={template} />)}</div>
          )}
        </section>

        <section className="portal-home-panel">
          <header>
            <div>
              <span>Product collections</span>
              <strong>Explore the catalog, then purchase in the Shopify store</strong>
            </div>
            <Link to="/products" className="btn">Browse products</Link>
          </header>
          <div className="portal-home-feature-card">
            <span className="portal-home-row-icon"><Layers3 size={16} /></span>
            <div>
              <strong>Collection-based catalog</strong>
              <span>Open any product on the connected Shopify storefront to choose current options.</span>
            </div>
            <Link to="/products" className="btn"><ArrowUpRight size={12} /> View catalog</Link>
          </div>
        </section>
      </div>
    </>
  );
}

export const Route = createFileRoute('/')({ component: HomeView });
