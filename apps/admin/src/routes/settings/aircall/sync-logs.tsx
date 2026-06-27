import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { adminApi, apiErrorMessage } from '@/lib/api';

function SyncLogsView() {
  const { t } = useTranslation();
  const logs = useQuery({
    queryKey: ['aircall', 'sync-logs'],
    queryFn: () => adminApi.aircallSyncLogs(),
  });
  const hasRows = Boolean(logs.data && (logs.data.logs.length || logs.data.inbox.length));

  return (
    <section className="config-card" id="aircall-sync-logs">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h3 data-i18n-key="aircall_hub.sync_logs_tab.title">{t('aircall_hub.sync_logs_tab.title')}</h3>
          <div className="sub" data-i18n-key="aircall_hub.sync_logs_tab.sub">{t('aircall_hub.sync_logs_tab.sub')}</div>
        </div>
        <button id="btn-sync-logs-refresh" type="button" className="btn ghost" onClick={() => logs.refetch()} disabled={logs.isFetching}>
          <RefreshCw size={13} /> {t('aircall_hub.sync_logs_tab.refresh')}
        </button>
      </div>

      {logs.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.sync_logs_tab.loading_body')} />}
      {logs.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(logs.error)}
          action={<button type="button" className="btn" onClick={() => logs.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}
      {logs.isSuccess && logs.data.credentialRequired && !hasRows && (
        <StateBlock
          title={t('aircall_hub.sync_logs_tab.credentials_required_title')}
          body={t('aircall_hub.sync_logs_tab.credentials_required_body')}
          icon={<AlertTriangle size={18} color="var(--warn)" />}
          action={<a className="btn primary" href="/settings/aircall/connection">{t('aircall_hub.sync_logs_tab.credentials_required_cta')}</a>}
        />
      )}
      {logs.isSuccess && !hasRows && !logs.data.credentialRequired && (
        <StateBlock
          title={t('aircall_hub.sync_logs_tab.empty_title')}
          body={t('aircall_hub.sync_logs_tab.empty_body')}
        />
      )}
      {logs.isSuccess && hasRows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th data-i18n-key="aircall_hub.sync_logs_tab.col_source">{t('aircall_hub.sync_logs_tab.col_source')}</th>
                <th data-i18n-key="aircall_hub.sync_logs_tab.col_action">{t('aircall_hub.sync_logs_tab.col_action')}</th>
                <th data-i18n-key="aircall_hub.sync_logs_tab.col_status">{t('aircall_hub.sync_logs_tab.col_status')}</th>
                <th data-i18n-key="aircall_hub.sync_logs_tab.col_message">{t('aircall_hub.sync_logs_tab.col_message')}</th>
                <th data-i18n-key="aircall_hub.sync_logs_tab.col_at">{t('aircall_hub.sync_logs_tab.col_at')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.logs.map((row) => (
                <tr key={row.id}>
                  <td>{row.service}</td>
                  <td>{row.action}</td>
                  <td><span className={`pill ${row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : 'warn'}`}>{row.status}</span></td>
                  <td>{row.message ?? '-'}</td>
                  <td>{formatDate(row.finishedAt ?? row.startedAt)}</td>
                </tr>
              ))}
              {logs.data.inbox.map((row) => (
                <tr key={row.id}>
                  <td>{t('aircall_hub.sync_logs_tab.source_webhook')}</td>
                  <td>{row.eventType ?? '-'}</td>
                  <td><span className={`pill ${row.status === 'processed' ? 'success' : row.status === 'rejected' ? 'danger' : 'warn'}`}>{row.status}</span></td>
                  <td>{row.rejectionReason ?? row.externalCallId ?? '-'}</td>
                  <td>{formatDate(row.processedAt ?? row.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StateBlock({ title, body, action, icon }: { title: string; body: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      {icon && <div style={{ marginBottom: 10 }}>{icon}</div>}
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/aircall/sync-logs')({ component: SyncLogsView });
