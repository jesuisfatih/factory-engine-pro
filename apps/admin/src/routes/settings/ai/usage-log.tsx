import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Search, RefreshCw, XCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { fetchAiCalls, AI_SERVICES, type AiServiceId } from '@/lib/mock';
// Banner removed — layout already provides IntegrationHeader.

type ServiceFilter = 'all' | AiServiceId;
type StatusFilter = 'all' | 'success' | 'fail';

function UsageLogView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('fail');
  const [search, setSearch] = useState('');

  const { data: calls = [] } = useQuery({ queryKey: ['ai', 'calls'], queryFn: fetchAiCalls });

  const rows = useMemo(() => {
    return calls.filter((row) => {
      if (serviceFilter !== 'all' && row.service !== serviceFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (search.trim()) {
        const needle = search.toLowerCase();
        if (!(`${row.promptKey} ${row.model} ${row.id}`.toLowerCase().includes(needle))) return false;
      }
      return true;
    });
  }, [calls, serviceFilter, statusFilter, search]);

  return (
    <>
      <div className="log-filters" id="ai-log-filters">
        <div className="group">
          <button id="srv-all" type="button" className={`filter-pill${serviceFilter === 'all' ? ' active' : ''}`} onClick={() => setServiceFilter('all')}>
            {t('ai.usage_log.filter_all')}
          </button>
          {AI_SERVICES.map((srv) => (
            <button key={srv.id} id={`srv-${srv.id}`} type="button"
              className={`filter-pill${serviceFilter === srv.id ? ' active' : ''}`}
              onClick={() => setServiceFilter(srv.id)}>
              {srv.label}
            </button>
          ))}
        </div>
        <div className="group">
          <button id="status-all" type="button" className={`filter-pill${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>
            {t('ai.usage_log.filter_all')}
          </button>
          <button id="status-success" type="button" className={`filter-pill success${statusFilter === 'success' ? ' active' : ''}`} onClick={() => setStatusFilter('success')}>
            {t('ai.usage_log.filter_success')}
          </button>
          <button id="status-fail" type="button" className={`filter-pill fail${statusFilter === 'fail' ? ' active' : ''}`} onClick={() => setStatusFilter('fail')}>
            {t('ai.usage_log.filter_fail')}
          </button>
        </div>
        <div className="search-wrap">
          <Search size={14} className="icon" />
          <input id="ai-log-search"
            placeholder={t('ai.usage_log.search_placeholder')}
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <button id="btn-ai-log-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['ai', 'calls'] })}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="data-card">
        <table className="data-table" id="ai-log-table">
          <thead>
            <tr>
              <th data-i18n-key="ai.usage_log.col_time">{t('ai.usage_log.col_time')}</th>
              <th data-i18n-key="ai.usage_log.col_service">{t('ai.usage_log.col_service')}</th>
              <th data-i18n-key="ai.usage_log.col_model">{t('ai.usage_log.col_model')}</th>
              <th data-i18n-key="ai.usage_log.col_prompt">{t('ai.usage_log.col_prompt')}</th>
              <th data-i18n-key="ai.usage_log.col_tokens" style={{ textAlign: 'right' }}>{t('ai.usage_log.col_tokens')}</th>
              <th data-i18n-key="ai.usage_log.col_cache" style={{ textAlign: 'right' }}>{t('ai.usage_log.col_cache')}</th>
              <th data-i18n-key="ai.usage_log.col_cost" style={{ textAlign: 'right' }}>{t('ai.usage_log.col_cost')}</th>
              <th data-i18n-key="ai.usage_log.col_latency" style={{ textAlign: 'right' }}>{t('ai.usage_log.col_latency')}</th>
              <th data-i18n-key="ai.usage_log.col_status" style={{ textAlign: 'right' }}>{t('ai.usage_log.col_status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} id={`call-${row.id}`}>
                <td className="muted">{row.timestamp}</td>
                <td><span className={`service-badge ${row.service}`}>{row.service}</span></td>
                <td className="muted">{row.model}</td>
                <td className="muted">{row.promptKey}</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.tokensIn} → {row.tokensOut}</td>
                <td style={{ textAlign: 'right', color: 'var(--success)' }}>{row.cacheHits ?? '—'}</td>
                <td style={{ textAlign: 'right' }} className="muted">${(row.costMillicents / 100000).toFixed(2)}m</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.latencyMs}ms</td>
                <td style={{ textAlign: 'right' }}>
                  {row.status === 'success'
                    ? <span className="status-success" title="success"><CheckCircle2 size={14} /></span>
                    : <span className="status-fail" title="fail"><XCircle size={14} /></span>}
                </td>
                <td style={{ textAlign: 'right' }} className="muted"><ChevronRight size={14} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)' }}>No calls match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/usage-log')({ component: UsageLogView });
