import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { Kpi } from '@/components/Kpi';
import { fetchKpis, fetchRecentTasks, fetchRecentCalls, fetchShopifyTrend } from '@/lib/mock';

function DashboardView() {
  const { t } = useTranslation();
  const { data: kpis } = useQuery({ queryKey: ['dashboard', 'kpis'], queryFn: fetchKpis });
  const { data: tasks = [] } = useQuery({ queryKey: ['dashboard', 'recent-tasks'], queryFn: fetchRecentTasks });
  const { data: calls = [] } = useQuery({ queryKey: ['dashboard', 'recent-calls'], queryFn: fetchRecentCalls });
  const { data: trend = [] } = useQuery({ queryKey: ['dashboard', 'shopify-trend'], queryFn: fetchShopifyTrend });

  const max = Math.max(1, ...trend.map((p) => p.revenue));

  const priorityPill = (p: string) =>
    p === 'critical' ? 'pill danger' : p === 'high' ? 'pill warn' : p === 'normal' ? 'pill info' : 'pill';
  const outcomePill = (o: string) =>
    o === 'answered' ? 'pill success' : o === 'voicemail' ? 'pill info' : 'pill warn';

  return (
    <>
      <PageHeader titleI18nKey="dashboard.title" subtitleI18nKey="dashboard.subtitle" />

      <div className="kpis">
        <Kpi id="kpi-sales-24h" labelI18nKey="dashboard.kpi.sales_24h" value={`$${(kpis?.sales24h ?? 0).toLocaleString()}`} subI18nKey="dashboard.kpi.sales_24h_sub" />
        <Kpi id="kpi-orders" labelI18nKey="dashboard.kpi.orders" value={kpis?.ordersToday ?? 0} subI18nKey="dashboard.kpi.orders_sub" />
        <Kpi id="kpi-open-tasks" labelI18nKey="dashboard.kpi.open_tasks" value={kpis?.openTasks ?? 0} subI18nKey="dashboard.kpi.open_tasks_sub" />
        <Kpi id="kpi-ai-tasks" labelI18nKey="dashboard.kpi.ai_tasks" value={kpis?.aiTasksPending ?? 0} subI18nKey="dashboard.kpi.ai_tasks_sub" />
        <Kpi id="kpi-calls" labelI18nKey="dashboard.kpi.calls" value={kpis?.callsAnswered ?? 0} subI18nKey="dashboard.kpi.calls_sub" />
      </div>

      <div className="section" id="section-shopify-sales" style={{ marginBottom: 16 }}>
        <h3>
          <span data-i18n-key="dashboard.section_shopify_sales">{t('dashboard.section_shopify_sales')}</span>
          <span className="meta">14d window</span>
        </h3>
        <div className="bar-chart" aria-label="Shopify sales bar chart">
          {trend.map((point) => (
            <div
              key={point.date}
              className="bar"
              style={{ height: `${(point.revenue / max) * 100}%` }}
              title={`${point.date} — $${point.revenue.toLocaleString()} · ${point.orders} orders`}
            />
          ))}
        </div>
        <div className="bar-labels">
          {trend.map((point) => <span key={point.date}>{point.date.slice(5)}</span>)}
        </div>
      </div>

      <div className="two-col">
        <div className="section" id="section-recent-tasks">
          <h3>
            <span data-i18n-key="dashboard.section_recent_tasks">{t('dashboard.section_recent_tasks')}</span>
            <span className="meta">{tasks.length} items</span>
          </h3>
          <table className="data-table">
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td><div className="name">{task.title}</div><div className="muted">{task.assignee} · {task.source}</div></td>
                  <td><span className={priorityPill(task.priority)}>{task.priority}</span></td>
                  <td><span className="muted">{task.createdAt}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="section" id="section-recent-calls">
          <h3>
            <span data-i18n-key="dashboard.section_recent_calls">{t('dashboard.section_recent_calls')}</span>
            <span className="meta">{calls.length} calls</span>
          </h3>
          <table className="data-table">
            <tbody>
              {calls.map((call) => (
                <tr key={call.id}>
                  <td><div className="name">{call.customer}</div><div className="muted">{call.phone}</div></td>
                  <td><span className={outcomePill(call.outcome)}>{call.outcome}</span></td>
                  <td><span className="muted">{call.at}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/dashboard')({ component: DashboardView });
