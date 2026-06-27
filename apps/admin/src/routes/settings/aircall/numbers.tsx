import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Globe2, Hash, Phone, RefreshCw } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { aircallTenantConfigQueryKey, fetchAircallTenantConfig, hasAircallCredentials } from '@/features/integrations/aircallTenantConfig';

function NumbersView() {
  const { t } = useTranslation();
  const config = useQuery({
    queryKey: aircallTenantConfigQueryKey,
    queryFn: fetchAircallTenantConfig,
  });
  const ready = hasAircallCredentials(config.data);

  return (
    <>
      <div className="numbers-stat">
        <div className="card" id="num-total">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.total_numbers">{t('aircall_hub.numbers_tab.total_numbers')}</div>
            <div className="v">0</div>
          </div>
          <Phone size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-ivr">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.ivr_numbers">{t('aircall_hub.numbers_tab.ivr_numbers')}</div>
            <div className="v">0</div>
          </div>
          <Hash size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-countries">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.countries">{t('aircall_hub.numbers_tab.countries')}</div>
            <div className="v">0</div>
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
          <button id="btn-aircall-numbers-refresh" type="button" className="btn ghost" onClick={() => config.refetch()} disabled={config.isFetching}>
            <RefreshCw size={13} /> {t('common.refresh')}
          </button>
        </div>

        {config.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.numbers_tab.loading_body')} />}
        {config.isError && (
          <StateBlock
            title={t('common.error')}
            body={apiErrorMessage(config.error)}
            action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
          />
        )}
        {config.isSuccess && !ready && (
          <StateBlock
            title={t('aircall_hub.numbers_tab.credentials_required_title')}
            body={t('aircall_hub.numbers_tab.credentials_required_body')}
            icon={<AlertTriangle size={18} color="var(--warn)" />}
            action={<a className="btn primary" href="/settings/aircall/connection">{t('aircall_hub.numbers_tab.credentials_required_cta')}</a>}
          />
        )}
        {config.isSuccess && ready && (
          <StateBlock
            title={t('aircall_hub.numbers_tab.unavailable_title')}
            body={t('aircall_hub.numbers_tab.unavailable_body')}
          />
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

export const Route = createFileRoute('/settings/aircall/numbers')({ component: NumbersView });
