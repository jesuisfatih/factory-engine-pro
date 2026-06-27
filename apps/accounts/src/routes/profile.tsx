import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, ShieldCheck, User, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { fetchProfile, saveProfile, updateAccountPassword, type BuyerProfile } from '@/lib/portal';

const QK = ['profile'] as const;

type TabKey = 'profile' | 'security';

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function ProfileView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: profile, isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchProfile });
  const [tab, setTab] = useState<TabKey>('profile');

  const [form, setForm] = useState<BuyerProfile | null>(null);
  useEffect(() => { if (profile && !form) setForm(profile); }, [profile, form]);

  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: () => { toast.success(t('profile.saved')); qc.invalidateQueries({ queryKey: QK }); },
    onError: (error) => toast.error('Save failed', { description: (error as Error).message }),
  });

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const pwdMismatch = pwd.next.length > 0 && pwd.next !== pwd.confirm;
  const passwordUpdate = useMutation({
    mutationFn: () => updateAccountPassword({ currentPassword: pwd.current, newPassword: pwd.next }),
    onSuccess: () => {
      toast.success('Password updated');
      setPwd({ current: '', next: '', confirm: '' });
    },
    onError: (error) => toast.error('Password update failed', { description: (error as Error).message }),
  });

  if (isError) {
    return <ErrorState title="Could not load profile" error={error} retry={() => refetch()} />;
  }

  if (isLoading || !form) {
    return <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>{t('common.loading')}</div>;
  }

  const initials = `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase();

  return (
    <>
      <PageHeader titleI18nKey="profile.title" subtitleI18nKey="profile.subtitle" />

      <div className="profile-shell">
        <aside className="profile-side">
          <div className="user-avatar" style={{ width: 64, height: 64, fontSize: 18 }}>{initials}</div>
          <h3>{form.firstName} {form.lastName}</h3>
          <div className="muted">{form.email}</div>
          <div style={{ marginTop: 6 }}>
            <span className="pill accent">{form.role}</span>
          </div>
          <div className="muted" style={{ marginTop: 12, fontSize: 11 }}>{form.company}</div>

          <div className="profile-side-stats">
            <div>
              <div className="label">{t('profile.stats_orders')}</div>
              <div className="val">{form.ordersCount}</div>
            </div>
            <div>
              <div className="label">{t('profile.stats_quotes')}</div>
              <div className="val">{form.quotesCount}</div>
            </div>
            <div>
              <div className="label">{t('profile.stats_spent')}</div>
              <div className="val">{fmtMoney(form.totalSpentUsd)}</div>
            </div>
          </div>
        </aside>

        <main className="profile-main">
          <div className="tabs" role="tablist">
            {(['profile', 'security'] as TabKey[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                className={`tab${tab === value ? ' active' : ''}`}
                onClick={() => setTab(value)}
              >
                {value === 'profile' ? <User size={11} /> : <ShieldCheck size={11} />}
                {t(`profile.tabs.${value}`)}
              </button>
            ))}
          </div>

          {tab === 'profile' && (
            <section className="section" style={{ padding: 18 }}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="p-first">{t('profile.field_first_name')}</label>
                  <input id="p-first" value={form.firstName} onChange={(event) => setForm((current) => current && { ...current, firstName: event.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="p-last">{t('profile.field_last_name')}</label>
                  <input id="p-last" value={form.lastName} onChange={(event) => setForm((current) => current && { ...current, lastName: event.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="p-email">{t('profile.field_email')}</label>
                <input id="p-email" type="email" value={form.email} disabled />
              </div>
              <div className="field">
                <label htmlFor="p-phone">{t('profile.field_phone')}</label>
                <input id="p-phone" value={form.phone} onChange={(event) => setForm((current) => current && { ...current, phone: event.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="save-btn" onClick={() => save.mutate({ firstName: form.firstName, lastName: form.lastName, phone: form.phone })}>
                  <Save size={14} /> {t('profile.save_changes')}
                </button>
              </div>
            </section>
          )}

          {tab === 'security' && (
            <section className="section" style={{ padding: 18 }}>
              <h3 style={{ marginTop: 0 }}>{t('profile.security_title')}</h3>
              <p className="subtitle" style={{ marginTop: -4 }}>{t('profile.security_subtitle')}</p>
              <div className="field">
                <label htmlFor="pwd-current">{t('profile.field_current_pwd')}</label>
                <input id="pwd-current" type="password" value={pwd.current} onChange={(event) => setPwd((current) => ({ ...current, current: event.target.value }))} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="pwd-new">{t('profile.field_new_pwd')}</label>
                  <input id="pwd-new" type="password" value={pwd.next} onChange={(event) => setPwd((current) => ({ ...current, next: event.target.value }))} />
                </div>
                <div className="field">
                  <label htmlFor="pwd-confirm">{t('profile.field_confirm_pwd')}</label>
                  <input id="pwd-confirm" type="password" value={pwd.confirm} onChange={(event) => setPwd((current) => ({ ...current, confirm: event.target.value }))} />
                </div>
              </div>
              {pwdMismatch && (
                <div className="warn-banner"><AlertCircle size={14} /> Passwords don't match.</div>
              )}
              <div style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 8, padding: 10, fontSize: 11, marginTop: 8 }}>
                {t('profile.pwd_tip')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="save-btn"
                  disabled={!pwd.current || !pwd.next || pwdMismatch || passwordUpdate.isPending}
                  onClick={() => passwordUpdate.mutate()}
                >
                  <Save size={14} /> {passwordUpdate.isPending ? 'Updating...' : t('profile.update_password')}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}

export const Route = createFileRoute('/profile')({ component: ProfileView });
