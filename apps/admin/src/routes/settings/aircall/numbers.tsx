import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Phone, Hash, Globe2, Search } from 'lucide-react';
import { fetchAircallNumbers } from '@/lib/mock';

function NumbersView() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { data: numbers = [] } = useQuery({ queryKey: ['aircall', 'numbers'], queryFn: fetchAircallNumbers });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return numbers;
    return numbers.filter((row) => `${row.name} ${row.digits} ${row.country}`.toLowerCase().includes(q));
  }, [numbers, search]);

  const ivrCount = numbers.filter((row) => row.type === 'IVR').length;
  const countries = new Set(numbers.map((row) => row.country)).size;

  return (
    <>
      <div className="numbers-stat">
        <div className="card" id="num-total">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.total_numbers">{t('aircall_hub.numbers_tab.total_numbers')}</div>
            <div className="v">{numbers.length}</div>
          </div>
          <Phone size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-ivr">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.ivr_numbers">{t('aircall_hub.numbers_tab.ivr_numbers')}</div>
            <div className="v">{ivrCount}</div>
          </div>
          <Hash size={20} color="var(--text-faint)" />
        </div>
        <div className="card" id="num-countries">
          <div>
            <div className="lbl" data-i18n-key="aircall_hub.numbers_tab.countries">{t('aircall_hub.numbers_tab.countries')}</div>
            <div className="v">{countries}</div>
          </div>
          <Globe2 size={20} color="var(--text-faint)" />
        </div>
      </div>

      <div className="config-card" style={{ padding: 0 }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div>
            <h3 data-i18n-key="aircall_hub.numbers_tab.numbers_title">{t('aircall_hub.numbers_tab.numbers_title')}</h3>
            <div className="sub" data-i18n-key="aircall_hub.numbers_tab.numbers_sub">{t('aircall_hub.numbers_tab.numbers_sub')}</div>
          </div>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input id="aircall-numbers-search"
              value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder={t('aircall_hub.numbers_tab.search')}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px 8px 32px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
          </div>
        </div>
        <table className="data-table" id="aircall-numbers-table">
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
            {filtered.map((row) => (
              <tr key={row.id} id={`ac-num-${row.id}`}>
                <td className="name">{row.name}</td>
                <td className="muted">{row.digits}</td>
                <td className="muted">{row.country}</td>
                <td className="muted">{row.type}</td>
                <td className="muted">{row.tenantSlug}</td>
                <td className="muted">{row.lastSyncedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/aircall/numbers')({ component: NumbersView });
