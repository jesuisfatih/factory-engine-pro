import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Truck, Phone, ShoppingCart, Mail, RefreshCw } from 'lucide-react';
import { AI_SERVICES, fetchAiServiceStats, type AiServiceId } from '@/lib/mock';

const ICONS: Record<AiServiceId, typeof TrendingUp> = {
  analytics: TrendingUp,
  partners: Truck,
  aircall: Phone,
  sales: ShoppingCart,
  email_template: Mail,
};

function ServicesView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: stats = [] } = useQuery({ queryKey: ['ai', 'services'], queryFn: fetchAiServiceStats });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }} data-i18n-key="ai.services.title">
          {t('ai.services.title')}
        </div>
        <button id="btn-ai-services-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['ai', 'services'] })}>
          <RefreshCw size={13} /> {t('ai.services.refresh')}
        </button>
      </div>

      <div className="service-grid" id="ai-service-grid">
        {AI_SERVICES.map((meta) => {
          const stat = stats.find((s) => s.id === meta.id);
          const Icon = ICONS[meta.id];
          return (
            <div key={meta.id} className="service-card" id={`service-card-${meta.id}`}>
              <div className="top">
                <span className="dot" style={{ background: meta.color }} />
                <Icon size={16} style={{ color: meta.color }} />
                <div>
                  <h4>{meta.label}</h4>
                  <div className="sub">{meta.subtitle}</div>
                </div>
              </div>
              <div className="body">
                <div className="col">
                  <div className="label" data-i18n-key="ai.services.calls">{t('ai.services.calls')}</div>
                  <div className="val">{stat?.calls ?? 0}</div>
                </div>
                <div className="col">
                  <div className="label" data-i18n-key="ai.services.cost">{t('ai.services.cost')}</div>
                  <div className="val">${(stat?.cost ?? 0).toFixed(2)}</div>
                </div>
                <div className="col">
                  <div className="label" data-i18n-key="ai.services.avg_ms">{t('ai.services.avg_ms')}</div>
                  <div className="val">{stat?.avgMs ?? 0}</div>
                </div>
                <div className="col">
                  <div className="label" data-i18n-key="ai.services.error_pct">{t('ai.services.error_pct')}</div>
                  <div className="val" style={{ color: 'var(--success)' }}>{stat?.errorPct ?? 0}%</div>
                </div>
              </div>
              <div className="foot">
                <span><span data-i18n-key="ai.services.tokens_in">{t('ai.services.tokens_in')}</span> <b>{(stat?.tokensIn ?? 0).toLocaleString()}</b></span>
                <span><span data-i18n-key="ai.services.tokens_out">{t('ai.services.tokens_out')}</span> <b>{(stat?.tokensOut ?? 0).toLocaleString()}</b></span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/services')({ component: ServicesView });
