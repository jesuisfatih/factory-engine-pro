import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { Search, RefreshCw, Link2, Unlink, UserPlus } from 'lucide-react';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

function UsersTabView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('aircall.users.write');
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<Record<string, string>>({});

  const users = useQuery({
    queryKey: ['aircall', 'users'],
    queryFn: () => adminApi.aircallUsers(),
    retry: false,
  });

  const sync = useMutation({
    mutationFn: () => adminApi.syncAircallUsers(),
    onSuccess: (data) => qc.setQueryData(['aircall', 'users'], data),
  });
  const link = useMutation({
    mutationFn: ({ aircallUserId, memberId }: { aircallUserId: string; memberId: string }) => adminApi.linkAircallUser(aircallUserId, { memberId }),
    onSuccess: (data) => qc.setQueryData(['aircall', 'users'], data),
  });
  const unlink = useMutation({
    mutationFn: (aircallUserId: string) => adminApi.unlinkAircallUser(aircallUserId),
    onSuccess: (data) => qc.setQueryData(['aircall', 'users'], data),
  });

  const rows = users.data?.users ?? [];
  const members = users.data?.members ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.name} ${row.email ?? ''} ${row.extension ?? ''}`.toLowerCase().includes(q));
  }, [rows, search]);

  const linkedCount = rows.filter((row) => row.linkedMember).length;
  const unlinkedCount = rows.length - linkedCount;

  return (
    <>
      <div className="users-counter">
        <div>
          <span className="count">{t('aircall_hub.users_tab.header', { count: rows.length })}</span>
          <span className="linked">{t('aircall_hub.users_tab.linked', { count: linkedCount })}</span>
          <span className="unlinked">{t('aircall_hub.users_tab.unlinked', { count: unlinkedCount })}</span>
        </div>
        <button
          id="btn-aircall-sync"
          type="button"
          className="sync-btn"
          disabled={!canWrite || sync.isPending || users.isLoading}
          onClick={() => sync.mutate()}
        >
          <RefreshCw size={13} /> {sync.isPending ? t('common.loading') : t('aircall_hub.users_tab.sync_button')}
        </button>
      </div>

      {users.isLoading && <StateBlock title={t('common.loading')} body={t('aircall_hub.users_tab.loading_body')} />}
      {users.isError && (
        <StateBlock
          title={t('common.error')}
          body={apiErrorMessage(users.error)}
          action={<button type="button" className="btn" onClick={() => users.refetch()}><RefreshCw size={14} /> {t('common.retry')}</button>}
        />
      )}
      {sync.isError && <div className="error-state" style={{ marginBottom: 12 }}>{apiErrorMessage(sync.error)}</div>}
      {link.isError && <div className="error-state" style={{ marginBottom: 12 }}>{apiErrorMessage(link.error)}</div>}
      {unlink.isError && <div className="error-state" style={{ marginBottom: 12 }}>{apiErrorMessage(unlink.error)}</div>}

      {users.isSuccess && rows.length === 0 && (
        <StateBlock
          title={t('aircall_hub.users_tab.empty_title')}
          body={t('aircall_hub.users_tab.empty_body')}
          action={canWrite ? <button type="button" className="btn primary" onClick={() => sync.mutate()}><RefreshCw size={14} /> {t('aircall_hub.users_tab.sync_button')}</button> : undefined}
        />
      )}

      {users.isSuccess && rows.length > 0 && (
        <div className="config-card" style={{ padding: 0 }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)', position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 26, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input
              id="aircall-users-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('aircall_hub.users_tab.search')}
              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px 8px 32px', color: 'var(--text)', fontSize: 12, outline: 'none' }}
            />
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
                <tr key={row.aircallUserId} id={`ac-user-${row.aircallUserId}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="aircall-avatar">{initials(row.name)}</span>
                      <span className="muted">{row.name}</span>
                    </div>
                  </td>
                  <td className="muted">{row.email ?? t('aircall_hub.users_tab.no_email')}</td>
                  <td className="muted">{row.extension ?? t('aircall_hub.users_tab.no_extension')}</td>
                  <td><span className="pill success dot">{row.availableStatus ?? t('aircall_hub.users_tab.unknown_status')}</span></td>
                  <td>
                    {row.linkedMember ? (
                      <span className="link-pill"><Link2 size={11} /> {row.linkedMember.name}</span>
                    ) : (
                      <select
                        value={selectedMember[row.aircallUserId] ?? ''}
                        disabled={!canWrite || link.isPending}
                        onChange={(event) => setSelectedMember((current) => ({ ...current, [row.aircallUserId]: event.target.value }))}
                      >
                        <option value="">{t('aircall_hub.users_tab.select_member')}</option>
                        {members.map((member) => <option key={member.id} value={member.id}>{member.name} - {member.email}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row.linkedMember ? (
                      <button type="button" className="unlink-pill" id={`btn-unlink-${row.aircallUserId}`} disabled={!canWrite || unlink.isPending} onClick={() => unlink.mutate(row.aircallUserId)}>
                        <Unlink size={11} style={{ marginRight: 4 }} /> {t('aircall_hub.users_tab.unlink')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="link-pill empty"
                        id={`btn-link-${row.aircallUserId}`}
                        disabled={!canWrite || !selectedMember[row.aircallUserId] || link.isPending}
                        onClick={() => link.mutate({ aircallUserId: row.aircallUserId, memberId: selectedMember[row.aircallUserId] })}
                      >
                        <UserPlus size={11} /> {t('aircall_hub.users_tab.link_to_member')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <StateBlock title={t('aircall_hub.users_tab.no_matches_title')} body={t('aircall_hub.users_tab.no_matches_body')} />}
        </div>
      )}
    </>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AC';
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

export const Route = createFileRoute('/settings/aircall/users')({ component: UsersTabView });
