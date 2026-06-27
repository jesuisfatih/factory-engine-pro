import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Search, RefreshCw, ChevronRight, FileText } from 'lucide-react';
import { fetchAiPrompts, AI_SERVICES, type AiServiceId } from '@/lib/mock';

type ServiceFilter = 'all' | AiServiceId | 'other' | 'email_template';

function PromptsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all');
  const [search, setSearch] = useState('');

  const { data: prompts = [] } = useQuery({ queryKey: ['ai', 'prompts'], queryFn: fetchAiPrompts });

  const rows = useMemo(() => {
    return prompts.filter((row) => {
      if (serviceFilter !== 'all' && row.service !== serviceFilter) return false;
      if (search.trim() && !row.key.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [prompts, serviceFilter, search]);

  return (
    <>
      <div className="log-filters" id="ai-prompt-filters">
        <div className="group">
          <button id="pf-all" type="button" className={`filter-pill${serviceFilter === 'all' ? ' active' : ''}`} onClick={() => setServiceFilter('all')}>
            All
          </button>
          {AI_SERVICES.map((srv) => (
            <button key={srv.id} id={`pf-${srv.id}`} type="button"
              className={`filter-pill${serviceFilter === srv.id ? ' active' : ''}`}
              onClick={() => setServiceFilter(srv.id)}>
              {srv.label}
            </button>
          ))}
        </div>
        <div className="search-wrap">
          <Search size={14} className="icon" />
          <input id="ai-prompt-search"
            placeholder={t('ai.prompts.search_placeholder')}
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <button id="btn-ai-prompts-refresh" type="button" className="btn ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['ai', 'prompts'] })}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="data-card">
        <table className="data-table" id="ai-prompt-table">
          <thead>
            <tr>
              <th data-i18n-key="ai.prompts.col_service">{t('ai.prompts.col_service')}</th>
              <th data-i18n-key="ai.prompts.col_prompt_key">{t('ai.prompts.col_prompt_key')}</th>
              <th data-i18n-key="ai.prompts.col_active_v">{t('ai.prompts.col_active_v')}</th>
              <th data-i18n-key="ai.prompts.col_model">{t('ai.prompts.col_model')}</th>
              <th data-i18n-key="ai.prompts.col_char_tokens" style={{ textAlign: 'right' }}>{t('ai.prompts.col_char_tokens')}</th>
              <th data-i18n-key="ai.prompts.col_7d_calls" style={{ textAlign: 'right' }}>{t('ai.prompts.col_7d_calls')}</th>
              <th data-i18n-key="ai.prompts.col_success" style={{ textAlign: 'right' }}>{t('ai.prompts.col_success')}</th>
              <th data-i18n-key="ai.prompts.col_avg_inout" style={{ textAlign: 'right' }}>{t('ai.prompts.col_avg_inout')}</th>
              <th data-i18n-key="ai.prompts.col_last_used" style={{ textAlign: 'right' }}>{t('ai.prompts.col_last_used')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} id={`prompt-${row.id}`}>
                <td><span className={`service-badge ${row.service}`}>{row.service}</span></td>
                <td className="name">{row.key}</td>
                <td><span className="pill">{row.activeVersion}</span></td>
                <td className="muted">{row.model}</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.charCount}c / ~{row.tokenEstimate}t</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.calls7d}</td>
                <td style={{ textAlign: 'right' }}>{row.successPct === null ? <span className="muted">—</span> : <span style={{ color: 'var(--success)', fontWeight: 600 }}>{row.successPct}%</span>}</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.avgInOut ?? '—'}</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.lastUsedAt ?? '—'}</td>
                <td style={{ textAlign: 'right' }} className="muted"><ChevronRight size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/prompts')({ component: PromptsView });
