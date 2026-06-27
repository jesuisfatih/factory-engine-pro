import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Globe2, Hash, Phone, RefreshCw } from 'lucide-react';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

function NumbersView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('aircall.users.write');
  const numbers = useQuery({
    queryKey: ['aircall', 'numbers'],
    queryFn: () => adminApi.aircallNumbers(),
  });
  const sync = useMutation({
    mutationFn: () => adminApi.syncAircallNumbers(),
    onSuccess: (data) => qc.setQueryData(['aircall', 'numbers'], data),
  });
  const data = numbers.data;

  return (
    <>
      <div className="numbers-stat">
        <div className="card" id="num-total">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.total_numbers">{t('aircall_hub.numbers_tab.total_numbers')}</div>
            <div className="v">{data?.stats.total ?? 0}</div>
          </div>
          <Phone size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-ivr">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.ivr_numbers">{t('aircall_hub.numbers_tab.ivr_numbers')}</div>
            <div className="v">{data?.stats.ivr ?? 0}</div>
          </div>
          <Hash size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-countries">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.countries">{t('aircall_hub.numbers_tab.countries')}</div>
            <div className="v">{data?.stats.countries.length ?? 0}</div>
          </div>
          <Globe2 size={20} color="var(--text-faint)" />
        </div>
      </div>

      <section className="config-card" id="aircall-numbers-status">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 data-i18n-key="aircall_hub.numbers_tab.numbers_title">{t('aircall_hub.numbers_tab.numbers_title')}</h3>
            <div className="sub" data-i18n-key="aircall_hub.numbers_tab.numbers_sub">{t('aircall_hub.numbers_tab.numbers_sub')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button id="btn-aircall-numbers-refresh" type="button" className="btn ghost" onClick={() => numbers.refetch()} disabled={numbers.isFetching}>
              <RefreshCw size={13} /> {t('common.refresh')}
            </button>
            <button id="btn-aircall-numbers-sync" type="button" className="btn" onClick={() => sync.mutate()} disabled={!canWrite || sync.isPending || numbers.isLoading || data?.credentialRequired}>
              <RefreshCw size={13} /> {sync.isPending ? t('aircall_hub.numbers_tab.syncing') : t('aircall_hub.numbers_tab.sync')}
            </button>
          </div>
        </div>

        {numbers.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.numbers_tab.loading_body')} />}
        {numbers.isError && (
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(numbers.error)}
            action={<button type="button" className="btn" onClick={() => numbers.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {sync.isError && <div className="form-error" style={{ marginBottom: 12 }}>{apiErrorMessage(sync.error)}</div>}
        {numbers.isSuccess && data?.credentialRequired && (
          <StateBlock
            title={t('aircall_hub.numbers_tab.credentials_required_title')}
            body={t('aircall_hub.numbers_tab.credentials_required_body')}
            icon={<AlertTriangle size={18} color="var(--warn)" />}
            action={<a className="btn primary" href="/settings/aircall/connection">{t('aircall_hub.numbers_tab.credentials_required_cta')}</a>}
          />
        )}
        {numbers.isSuccess && !data?.credentialRequired && data?.numbers.length === 0 && (
          <StateBlock
            title={t('aircall_hub.numbers_tab.empty_title')}
            body={t('aircall_hub.numbers_tab.empty_body')}
          />
        )}
        {numbers.isSuccess && !data?.credentialRequired && Boolean(data?.numbers.length) && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_name">{t('aircall_hub.numbers_tab.col_name')}</th>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_digits">{t('aircall_hub.numbers_tab.col_digits')}</th>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_country">{t('aircall_hub.numbers_tab.col_country')}</th>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_type">{t('aircall_hub.numbers_tab.col_type')}</th>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_tenant_slug">{t('aircall_hub.numbers_tab.col_tenant_slug')}</th>
                  <th data-i18n-key="aircall_hub.numbers_tab.col_last_synced">{t('aircall_hub.numbers_tab.col_last_synced')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.numbers.map((number) => (
                  <tr key={number.id}>
                    <td>{number.name}</td>
                    <td>{number.digits}</td>
                    <td>{number.country ?? '-'}</td>
                    <td>{number.isIvr ? t('aircall_hub.numbers_tab.type_ivr') : t('aircall_hub.numbers_tab.type_direct')}</td>
                    <td>{number.tenantSlug ?? '-'}</td>
                    <td>{formatDate(number.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
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

export const Route = createFileRoute('/settings/aircall/numbers')({ component: NumbersView });
