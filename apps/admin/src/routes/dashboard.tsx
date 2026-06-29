import type { ReactNode } from 'react';
import type { ActiveWorkflowRuleStatsResponse, CallCenterOverview } from '@factory-engine-pro/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Kpi } from '@/components/Kpi';
import { adminApi, apiErrorMessage } from '@/lib/api';

interface OrderStats {
  count: number;
  totalRevenue: number;
  fulfilledCount: number;
  fulfillmentRate: number;
  pickupCount: number;
  designFileCount: number;
}

interface CustomerStats {
  count: number;
  totalRevenue: number;
  totalOrders: number;
  atRiskCount: number;
  vipCount: number;
}

interface SupportStats {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  urgent: number;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  companyName: string | null;
  totalPrice: number;
  currency: string;
  processedAt: string | null;
  createdAt: string;
}

interface OrderListResponse {
  data: OrderRow[];
  meta: { count: number; limit: number };
}

interface SupportRow {
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  customer: { companyName?: string | null; name?: string | null; email?: string | null } | null;
  assignedTo: { name?: string | null; email?: string | null } | null;
  updatedAt: string;
}

interface SupportListResponse {
  items: SupportRow[];
  total: number;
}

interface MailDelivery {
  id: string;
  eventKey: string;
  recipientEmail: string;
  subject: string;
  status: string;
  createdAt: string;
  errorMessage: string | null;
}

interface TrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

function DashboardView() {
  const { t } = useTranslation();
  const orderStats = useQuery<OrderStats>({
    queryKey: ['dashboard', 'orders', 'stats'],
    queryFn: () => adminApi.orderStats() as Promise<OrderStats>,
  });
  const customerStats = useQuery<CustomerStats>({
    queryKey: ['dashboard', 'customers', 'stats'],
    queryFn: () => adminApi.commerceCustomerStats() as Promise<CustomerStats>,
  });
  const supportStats = useQuery<SupportStats>({
    queryKey: ['dashboard', 'support', 'stats'],
    queryFn: () => adminApi.supportStats() as Promise<SupportStats>,
  });
  const orders = useQuery<OrderListResponse>({
    queryKey: ['dashboard', 'orders', 'recent'],
    queryFn: () => adminApi.orders('?limit=100') as Promise<OrderListResponse>,
  });
  const support = useQuery<SupportListResponse>({
    queryKey: ['dashboard', 'support', 'recent'],
    queryFn: () => adminApi.supportRequests('?limit=5&sort=updatedAt%3Adesc') as Promise<SupportListResponse>,
  });
  const mail = useQuery<MailDelivery[]>({
    queryKey: ['dashboard', 'mail', 'recent'],
    queryFn: () => adminApi.mailDeliveries('?limit=5') as Promise<MailDelivery[]>,
  });
  const ruleStats = useQuery<ActiveWorkflowRuleStatsResponse>({
    queryKey: ['dashboard', 'rules', 'active-stats', 7],
    queryFn: () => adminApi.workflowRuleActiveStats('?days=7'),
  });
  const callCenter = useQuery<CallCenterOverview>({
    queryKey: ['dashboard', 'call-center', 'overview'],
    queryFn: () => adminApi.callCenterOverview(),
  });

  const statsQueries = [orderStats, customerStats, supportStats, mail];
  const failedMailCount = (mail.data ?? []).filter((delivery) => delivery.status === 'failed').length;
  const trend = buildTrend(orders.data?.data ?? []);
  const max = Math.max(1, ...trend.map((point) => point.revenue));
  const statsError = statsQueries.find((query) => query.isError)?.error;

  const retryDashboard = () => {
    void orderStats.refetch();
    void customerStats.refetch();
    void supportStats.refetch();
    void orders.refetch();
    void support.refetch();
    void mail.refetch();
    void ruleStats.refetch();
    void callCenter.refetch();
  };

  return (
    <>
      <PageHeader titleI18nKey="dashboard.title" subtitleI18nKey="dashboard.subtitle" />

      {statsQueries.some((query) => query.isLoading) && (
        <StateBlock title={t('common.loading')} body={t('dashboard.loading_body')} />
      )}
      {statsError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(statsError)}
          action={<button type="button" className="btn" onClick={retryDashboard}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}

      {!statsQueries.some((query) => query.isLoading || query.isError) && (
        <div className="kpis">
          <Kpi id="kpi-sales-24h" labelI18nKey="dashboard.kpi.sales_24h" value={formatMoney(orderStats.data?.totalRevenue ?? 0)} subI18nKey="dashboard.kpi.sales_24h_sub" />
          <Kpi id="kpi-orders" labelI18nKey="dashboard.kpi.orders" value={orderStats.data?.count ?? 0} subI18nKey="dashboard.kpi.orders_sub" />
          <Kpi id="kpi-open-tasks" labelI18nKey="dashboard.kpi.open_tasks" value={supportStats.data?.open ?? 0} subI18nKey="dashboard.kpi.open_tasks_sub" />
          <Kpi id="kpi-ai-tasks" labelI18nKey="dashboard.kpi.ai_tasks" value={supportStats.data?.urgent ?? 0} subI18nKey="dashboard.kpi.ai_tasks_sub" />
          <Kpi id="kpi-calls" labelI18nKey="dashboard.kpi.calls" value={failedMailCount} subI18nKey="dashboard.kpi.calls_sub" />
        </div>
      )}

      <div className="section" id="section-call-center-preview" style={{ marginBottom: 16 }}>
        <h3>
          <span>Call Center preview</span>
          <span className="meta">combined staff kanban</span>
        </h3>
        {callCenter.isLoading && <StateBlock title={t('common.loading')} body="Loading live Call Center kanban from the API." />}
        {callCenter.isError && (
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(callCenter.error)}
            action={<button type="button" className="btn" onClick={() => callCenter.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {callCenter.isSuccess && (
          <div className="call-center-preview-grid">
            <DashboardCallCenterCard
              title="Daily call list"
              value={callCenter.data.kanban.dailyCallList.length}
              rows={callCenter.data.kanban.dailyCallList.slice(0, 3).map((task) => `${task.assignedMemberName}: ${task.title}`)}
            />
            <DashboardCallCenterCard
              title="Priority customers"
              value={callCenter.data.kanban.priorityGroups.reduce((sum, group) => sum + group.customers.length, 0)}
              rows={callCenter.data.kanban.priorityGroups.slice(0, 3).map((group) => `${group.ownerName}: ${group.segmentName} (${group.customers.length})`)}
            />
            <DashboardCallCenterCard
              title="Pinned"
              value={callCenter.data.kanban.pinBoard.length}
              rows={callCenter.data.kanban.pinBoard.slice(0, 3).map((pin) => `${pin.ownerName}: ${pin.customerName ?? pin.title}`)}
            />
            <DashboardCallCenterCard
              title="Notes"
              value={callCenter.data.notes.length}
              rows={callCenter.data.notes.slice(0, 3).map((note) => `${note.authorName}: ${note.customerName ?? 'No customer'}`)}
            />
            <DashboardCallCenterCard
              title="Messages"
              value={callCenter.data.messages.length}
              rows={callCenter.data.messages.slice(0, 3).map((message) => `${message.fromName} to ${message.toName ?? 'team'}`)}
            />
            <div className="call-center-preview-card">
              <div className="preview-card-head"><span>Open module</span></div>
              <strong>{callCenter.data.members.length}</strong>
              <p>active staff in overview</p>
              <a className="btn primary" href="/call-center" style={{ marginTop: 10 }}>Open Call Center</a>
            </div>
          </div>
        )}
      </div>

      <div className="section" id="section-active-rule-stats" style={{ marginBottom: 16 }}>
        <h3>
          <span>Active rule stats</span>
          <span className="meta">7d fire/match/avg_latency</span>
        </h3>
        {ruleStats.isLoading && <StateBlock title={t('common.loading')} body="Loading active rule health metrics from the API." />}
        {ruleStats.isError && (
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(ruleStats.error)}
            action={<button type="button" className="btn" onClick={() => ruleStats.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {ruleStats.isSuccess && ruleStats.data.rows.length === 0 && (
          <StateBlock
            title="No active workflow rules"
            body="Active rules appear here after they are switched on in the rule engine."
            action={<a className="btn primary" href="/rules">Open rule engine</a>}
          />
        )}
        {ruleStats.isSuccess && ruleStats.data.rows.length > 0 && (
          <table className="data-table" id="active-rule-stats-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Fire</th>
                <th>Match</th>
                <th>Avg latency</th>
                <th>Tasks</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {ruleStats.data.rows.map((row) => (
                <tr key={row.ruleId}>
                  <td>
                    <div className="name">{row.ruleName}</div>
                    <div className="muted">{row.trigger} - p{row.priority} - last {row.lastFiredAt ? formatDateTime(row.lastFiredAt) : 'never'}</div>
                  </td>
                  <td>{row.fireCount}</td>
                  <td>{row.matchRate.toFixed(1)}% ({row.matchCount})</td>
                  <td>{formatLatency(row.avgLatencyMs)}</td>
                  <td>{row.taskCreatedCount}</td>
                  <td><span className={healthPill(row.health)}>{row.health}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="section" id="section-shopify-sales" style={{ marginBottom: 16 }}>
        <h3>
          <span data-i18n-key="dashboard.section_shopify_sales">{t('dashboard.section_shopify_sales')}</span>
          <span className="meta">{t('dashboard.window_14d')}</span>
        </h3>
        {orders.isLoading && <StateBlock title={t('common.loading')} body={t('dashboard.orders_loading_body')} />}
        {orders.isError && (
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(orders.error)}
            action={<button type="button" className="btn" onClick={() => orders.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {orders.isSuccess && orders.data.data.length === 0 && (
          <StateBlock
            title={t('dashboard.orders_empty_title')}
            body={t('dashboard.orders_empty_body')}
            action={<a className="btn primary" href="/orders">{t('dashboard.orders_empty_cta')}</a>}
          />
        )}
        {orders.isSuccess && orders.data.data.length > 0 && (
          <>
            <div className="bar-chart" aria-label={t('dashboard.section_shopify_sales')}>
              {trend.map((point) => (
                <div
                  key={point.date}
                  className="bar"
                  style={{ height: `${Math.max(6, (point.revenue / max) * 100)}%` }}
                  title={t('dashboard.chart_point_title', {
                    date: point.date,
                    revenue: formatMoney(point.revenue),
                    orders: point.orders,
                  })}
                />
              ))}
            </div>
            <div className="bar-labels">
              {trend.map((point) => <span key={point.date}>{point.date.slice(5)}</span>)}
            </div>
          </>
        )}
      </div>

      <div className="two-col">
        <div className="section" id="section-recent-support">
          <h3>
            <span data-i18n-key="dashboard.section_recent_support">{t('dashboard.section_recent_support')}</span>
            <span className="meta">{t('dashboard.records_count', { count: support.data?.items.length ?? 0 })}</span>
          </h3>
          {support.isLoading && <StateBlock title={t('common.loading')} body={t('dashboard.support_loading_body')} />}
          {support.isError && (
            <StateBlock
              title={t('common.error')}
              body={apiErrorMessage(support.error)}
              action={<button type="button" className="btn" onClick={() => support.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
            />
          )}
          {support.isSuccess && support.data.items.length === 0 && (
            <StateBlock
              title={t('dashboard.support_empty_title')}
              body={t('dashboard.support_empty_body')}
              action={<a className="btn primary" href="/support">{t('dashboard.support_empty_cta')}</a>}
            />
          )}
          {support.isSuccess && support.data.items.length > 0 && (
            <table className="data-table">
              <tbody>
                {support.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="name">{item.ticketNumber} - {item.title}</div>
                      <div className="muted">{item.customer?.companyName ?? item.customer?.email ?? t('dashboard.no_customer')} - {item.assignedTo?.name ?? t('dashboard.unassigned')}</div>
                    </td>
                    <td><span className={priorityPill(item.priority)}>{humanize(item.priority)}</span></td>
                    <td><span className="muted">{formatDateTime(item.updatedAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="section" id="section-recent-mail">
          <h3>
            <span data-i18n-key="dashboard.section_recent_mail">{t('dashboard.section_recent_mail')}</span>
            <span className="meta">{t('dashboard.records_count', { count: mail.data?.length ?? 0 })}</span>
          </h3>
          {mail.isLoading && <StateBlock title={t('common.loading')} body={t('dashboard.mail_loading_body')} />}
          {mail.isError && (
            <StateBlock
              title={t('common.error')}
              body={apiErrorMessage(mail.error)}
              action={<button type="button" className="btn" onClick={() => mail.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
            />
          )}
          {mail.isSuccess && mail.data.length === 0 && (
            <StateBlock
              title={t('dashboard.mail_empty_title')}
              body={t('dashboard.mail_empty_body')}
              action={<a className="btn primary" href="/system-mail">{t('dashboard.mail_empty_cta')}</a>}
            />
          )}
          {mail.isSuccess && mail.data.length > 0 && (
            <table className="data-table">
              <tbody>
                {mail.data.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>
                      <div className="name">{delivery.subject}</div>
                      <div className="muted">{delivery.eventKey} - {delivery.recipientEmail}</div>
                    </td>
                    <td><span className={statusPill(delivery.status)}>{humanize(delivery.status)}</span></td>
                    <td><span className="muted">{formatDateTime(delivery.createdAt)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function buildTrend(orders: OrderRow[]): TrendPoint[] {
  const today = new Date();
  const byDate = new Map<string, TrendPoint>();
  for (let index = 13; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    byDate.set(key, { date: key, revenue: 0, orders: 0 });
  }
  for (const order of orders) {
    const rawDate = order.processedAt ?? order.createdAt;
    const key = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : '';
    const point = byDate.get(key);
    if (!point) continue;
    point.revenue += Number(order.totalPrice ?? 0);
    point.orders += 1;
  }
  return Array.from(byDate.values());
}

function DashboardCallCenterCard({ title, value, rows }: { title: string; value: number; rows: string[] }) {
  return (
    <div className="call-center-preview-card">
      <div className="preview-card-head"><span>{title}</span></div>
      <strong>{value}</strong>
      {rows.length ? rows.map((row) => <p key={row}>{row}</p>) : <p>No live records yet.</p>}
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatLatency(value: number | null) {
  if (value === null) return 'n/a';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function humanize(value: string) {
  return value.replace(/_/g, ' ');
}

function priorityPill(priority: string) {
  return ['critical', 'urgent', 'high'].includes(priority) ? 'pill danger' : priority === 'medium' ? 'pill warn' : 'pill info';
}

function statusPill(status: string) {
  if (status === 'sent') return 'pill success';
  if (status === 'failed') return 'pill danger';
  if (status === 'queued' || status === 'sending') return 'pill warn';
  return 'pill info';
}

function healthPill(health: string) {
  if (health === 'dead') return 'pill danger';
  if (health === 'loose') return 'pill warn';
  return 'pill success';
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export const Route = createFileRoute('/dashboard')({ component: DashboardView });
