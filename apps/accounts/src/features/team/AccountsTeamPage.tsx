import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Plus, RefreshCw, Search } from 'lucide-react';
import { accountsApi, apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';

type SubUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  status: string;
  spendingLimitCents?: number | null;
  roleAssignments: Array<{ role: { id: string; name: string; slug: string } }>;
  invitation?: { token: string } | null;
};

const QK = ['accounts', 'sub-users'] as const;

export function AccountsTeamPage() {
  const query = useQuery({ queryKey: QK, queryFn: () => accountsApi.subUsers() as Promise<SubUser[]> });
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', spendingLimit: '', password: '', sendInvite: true });
  const create = useMutation({
    mutationFn: () => accountsApi.createSubUser({
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      spendingLimitCents: form.spendingLimit ? Math.round(Number(form.spendingLimit) * 100) : undefined,
      password: form.sendInvite ? undefined : form.password,
      sendInvite: form.sendInvite,
      roleIds: [],
    }) as Promise<SubUser>,
    onSuccess: (subUser) => {
      toast.success('Sub-user created', { description: subUser.invitation ? `Invite token: ${subUser.invitation.token}` : subUser.email });
      setForm({ firstName: '', lastName: '', email: '', phone: '', spendingLimit: '', password: '', sendInvite: true });
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (error) => toast.error('Sub-user create failed', { description: apiErrorMessage(error) }),
  });
  const subUsers = query.data ?? [];
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return text ? subUsers.filter((user) => `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(text)) : subUsers;
  }, [search, subUsers]);
  const canSubmit = form.firstName && form.lastName && form.email && (form.sendInvite || form.password.length >= 8);

  return (
    <>
      <PageHeader titleI18nKey="team.title" subtitleI18nKey="team.subtitle" />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16 }}>
        <section>
          <div className="orders-toolbar">
            <div className="orders-search" style={{ flex: 1 }}><Search size={14} /><input placeholder="Search sub-users" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          </div>
          {query.isLoading && <StateCard title="Loading team" body="Fetching B2B sub-users from the API." />}
          {query.isError && <ErrorCard error={query.error} retry={() => query.refetch()} />}
          {query.isSuccess && subUsers.length === 0 && <StateCard title="No sub-users yet" body="Create the first buyer seat with an optional spending cap." />}
          {query.isSuccess && subUsers.length > 0 && (
            <div className="data-card">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Spending cap</th></tr></thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id}>
                      <td><div className="name">{user.firstName} {user.lastName}</div><div className="muted">{user.phone ?? 'No phone'}</div></td>
                      <td>{user.email}</td>
                      <td>{user.roleAssignments.map((assignment) => <span className="pill accent" key={assignment.role.id}>{assignment.role.name}</span>)}</td>
                      <td><span className={`pill dot ${user.status === 'active' ? 'success' : 'info'}`}>{user.status}</span></td>
                      <td>{user.spendingLimitCents ? `$${(user.spendingLimitCents / 100).toLocaleString()}` : 'Unlimited'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <form className="data-card" style={{ padding: 16, alignSelf: 'start' }} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <h3 style={{ marginTop: 0 }}>Create sub-user</h3>
          <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
          <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
          <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label="Spending cap USD" value={form.spendingLimit} onChange={(spendingLimit) => setForm({ ...form, spendingLimit })} />
          <label className="checkbox-row"><input type="checkbox" checked={form.sendInvite} onChange={(event) => setForm({ ...form, sendInvite: event.target.checked })} /> Send invite link</label>
          {!form.sendInvite && <Field label="Initial password" value={form.password} onChange={(password) => setForm({ ...form, password })} type="password" />}
          <button className="btn primary" type="submit" disabled={!canSubmit || create.isPending}><Plus size={14} /> {create.isPending ? 'Creating...' : 'Create sub-user'}</button>
        </form>
      </div>
    </>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return <div className="preview-empty"><div className="title">{title}</div><div className="note">{body}</div></div>;
}

function ErrorCard({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="preview-empty"><AlertTriangle className="ico" size={24} /><div className="title">Could not load team</div><div className="note">{apiErrorMessage(error)}</div><button className="btn" type="button" onClick={retry} style={{ marginTop: 14 }}><RefreshCw size={14} /> Retry</button></div>;
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (next: string) => void; type?: string }) {
  return <div className="field"><label>{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
