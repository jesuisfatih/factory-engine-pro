import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Search, RefreshCw, Link2, Unlink, UserPlus } from 'lucide-react';
import { fetchAircallUsers } from '@/lib/mock';
import { useCan } from '@/lib/permissions';

function UsersTabView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');
  const [search, setSearch] = useState('');

  const { data: users = [] } = useQuery({ queryKey: ['aircall', 'users'], queryFn: fetchAircallUsers });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((row) => `${row.email} ${row.extension}`.toLowerCase().includes(q));
  }, [users, search]);

  const linkedCount = users.filter((row) => row.linkedMember).length;
  const unlinkedCount = users.length - linkedCount;

  return (
    <>
      <div className="users-counter">
        <div>
          <span className="count">{users.length} {t('aircall_hub.users_tab.header', { count: users.length }).split(' ').slice(1).join(' ')}</span>
          <span className="linked">{linkedCount} linked</span>
          <span className="unlinked">{unlinkedCount} unlinked</span>
        </div>
        <button id="btn-aircall-sync" type="button" className="sync-btn" disabled={!canWrite}
          onClick={() => qc.invalidateQueries({ queryKey: ['aircall', 'users'] })}>
          <RefreshCw size={13} /> {t('aircall_hub.users_tab.sync_button')}
        </button>
      </div>

      <div className="config-card" style={{ padding: 0 }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 26, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input id="aircall-users-search"
            value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder={t('aircall_hub.users_tab.search')}
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px 8px 32px', color: 'var(--text)', fontSize: 12, outline: 'none' }} />
        </div>
        <table className="data-table" id="aircall-users-table">
          <thead>
            <tr>
              <th data-i18n-key="aircall_hub.users_tab.col_user">{t('aircall_hub.users_tab.col_user')}</th>
              <th data-i18n-key="aircall_hub.users_tab.col_email">{t('aircall_hub.users_tab.col_email')}</th>
              <th data-i18n-key="aircall_hub.users_tab.col_ext">{t('aircall_hub.users_tab.col_ext')}</th>
              <th data-i18n-key="aircall_hub.users_tab.col_status">{t('aircall_hub.users_tab.col_status')}</th>
              <th data-i18n-key="aircall_hub.users_tab.col_linked">{t('aircall_hub.users_tab.col_linked')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} id={`ac-user-${row.id}`}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="aircall-avatar">{row.firstName}</span>
                    <span className="muted">{row.email}</span>
                  </div>
                </td>
                <td className="muted">{row.email}</td>
                <td className="muted">{row.extension}</td>
                <td><span className="pill success dot">{row.status}</span></td>
                <td>
                  {row.linkedMember ? (
                    <span className="link-pill"><Link2 size={11} /> {row.linkedMemberName}</span>
                  ) : (
                    <button type="button" className="link-pill empty" id={`btn-link-${row.id}`} disabled={!canWrite}>
                      <UserPlus size={11} /> {t('aircall_hub.users_tab.link_to_member')}
                    </button>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {row.linkedMember && (
                    <button type="button" className="unlink-pill" id={`btn-unlink-${row.id}`} disabled={!canWrite}>
                      <Unlink size={11} style={{ marginRight: 4 }} /> {t('aircall_hub.users_tab.unlink')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/aircall/users')({ component: UsersTabView });
