import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { CUSTOMER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { accountsApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { PageHeader } from '@/components/PageHeader';

type CustomerRole = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: Record<string, boolean>;
};

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

const SUB_USERS_QK = ['accounts', 'sub-users'] as const;
const ROLE_OPTIONS_QK = ['accounts', 'customer-role-options'] as const;

const PERMISSION_LABELS: Record<string, string> = {
  [CUSTOMER_PERMISSIONS.accountRead]: 'View account profile and documents',
  [CUSTOMER_PERMISSIONS.accountWrite]: 'Edit account profile and addresses',
  [CUSTOMER_PERMISSIONS.subUsersRead]: 'View company team',
  [CUSTOMER_PERMISSIONS.subUsersWrite]: 'Invite and manage company team',
  [CUSTOMER_PERMISSIONS.ordersRead]: 'View orders and tracking',
  [CUSTOMER_PERMISSIONS.ordersCreate]: 'Create account orders',
  [CUSTOMER_PERMISSIONS.ordersReorder]: 'Reorder previous items',
  [CUSTOMER_PERMISSIONS.invoicesRead]: 'View invoices and payments',
  [CUSTOMER_PERMISSIONS.cartWrite]: 'Build and checkout reorder carts',
  [CUSTOMER_PERMISSIONS.spendingLimitsWrite]: 'Manage spending limits',
};

export function AccountsTeamPage() {
  const principal = useCurrentPrincipal().data;
  const permissions = new Set(principal?.permissions ?? []);
  const canManageTeam = permissions.has(CUSTOMER_PERMISSIONS.subUsersRead);
  const query = useQuery({
    queryKey: SUB_USERS_QK,
    queryFn: () => accountsApi.subUsers() as Promise<SubUser[]>,
    enabled: canManageTeam,
  });
  const rolesQuery = useQuery({
    queryKey: ROLE_OPTIONS_QK,
    queryFn: () => accountsApi.customerRoleOptions() as Promise<CustomerRole[]>,
    enabled: canManageTeam,
  });
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    spendingLimit: '',
    password: '',
    sendInvite: true,
    roleIds: [] as string[],
  });

  useEffect(() => {
    if (!rolesQuery.data?.length || form.roleIds.length > 0) return;
    const defaultRole = rolesQuery.data.find((role) => role.slug === 'b2b_user') ?? rolesQuery.data[0];
    setForm((current) => ({ ...current, roleIds: [defaultRole.id] }));
  }, [form.roleIds.length, rolesQuery.data]);

  const create = useMutation({
    mutationFn: () => accountsApi.createSubUser({
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      spendingLimitCents: form.spendingLimit ? Math.round(Number(form.spendingLimit) * 100) : undefined,
      password: form.sendInvite ? undefined : form.password,
      sendInvite: form.sendInvite,
      roleIds: form.roleIds,
    }) as Promise<SubUser>,
    onSuccess: (subUser) => {
      toast.success('Team member created', { description: subUser.invitation ? `Invite token: ${subUser.invitation.token}` : subUser.email });
      const defaultRole = rolesQuery.data?.find((role) => role.slug === 'b2b_user') ?? rolesQuery.data?.[0];
      setForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        spendingLimit: '',
        password: '',
        sendInvite: true,
        roleIds: defaultRole ? [defaultRole.id] : [],
      });
      qc.invalidateQueries({ queryKey: SUB_USERS_QK });
    },
    onError: (error) => toast.error('Team member create failed', { description: apiErrorMessage(error) }),
  });

  const subUsers = query.data ?? [];
  const roles = rolesQuery.data ?? [];
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    return text
      ? subUsers.filter((user) => `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(text))
      : subUsers;
  }, [search, subUsers]);
  const stats = useMemo(() => {
    const active = subUsers.filter((user) => user.status === 'active').length;
    const invited = subUsers.filter((user) => user.status === 'invited').length;
    const spendingCap = subUsers.reduce((sum, user) => sum + (user.spendingLimitCents ?? 0), 0);
    return { total: subUsers.length, active, invited, spendingCap };
  }, [subUsers]);
  const canSubmit = Boolean(
    form.firstName.trim()
      && form.lastName.trim()
      && form.email.trim()
      && form.roleIds.length > 0
      && (form.sendInvite || form.password.length >= 8),
  );

  if (!canManageTeam) {
    return (
      <>
        <PageHeader titleI18nKey="team.title" subtitleI18nKey="team.subtitle" />
        <StateCard
          title="Team management is reserved for account owners"
          body="Ask the account owner to invite team members or change your company role."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader titleI18nKey="team.title" subtitleI18nKey="team.subtitle" />
      <div className="kpis four">
        <div className="kpi"><div className="label">Members</div><div className="val">{stats.total}</div><div className="sub">company seats</div></div>
        <div className="kpi"><div className="label">Active</div><div className="val">{stats.active}</div><div className="sub">can sign in</div></div>
        <div className="kpi"><div className="label">Invited</div><div className="val">{stats.invited}</div><div className="sub">waiting for setup</div></div>
        <div className="kpi"><div className="label">Spending cap</div><div className="val">{formatMoney(stats.spendingCap)}</div><div className="sub">assigned seats</div></div>
      </div>

      <div className="team-page-grid">
        <section>
          <div className="orders-toolbar">
            <div className="orders-search" style={{ flex: 1 }}>
              <Search size={14} />
              <input placeholder="Search team members" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          {query.isLoading && <StateCard title="Loading team" body="Fetching company team members from the account API." />}
          {query.isError && <ErrorCard title="Could not load team" error={query.error} retry={() => query.refetch()} />}
          {query.isSuccess && subUsers.length === 0 && <StateCard title="No team members yet" body="Invite the first teammate and choose exactly what they can see or change." />}
          {query.isSuccess && subUsers.length > 0 && (
            <div className="data-card">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Spending cap</th></tr></thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id}>
                      <td><div className="name">{user.firstName} {user.lastName}</div><div className="muted">{user.phone ?? 'No phone'}</div></td>
                      <td>{user.email}</td>
                      <td>
                        <div className="team-role-pills">
                          {user.roleAssignments.map((assignment) => <span className="pill accent" key={assignment.role.id}>{assignment.role.name}</span>)}
                        </div>
                      </td>
                      <td><span className={`pill dot ${user.status === 'active' ? 'success' : 'info'}`}>{user.status}</span></td>
                      <td>{user.spendingLimitCents ? formatMoney(user.spendingLimitCents) : 'Unlimited'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form className="data-card team-create-card" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <h3><ShieldCheck size={16} /> Invite company member</h3>
          <p className="muted">Choose the real portal permissions before sending the invitation.</p>
          {rolesQuery.isError && <ErrorCard title="Could not load roles" error={rolesQuery.error} retry={() => rolesQuery.refetch()} />}
          <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
          <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
          <Field label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label="Spending cap USD" value={form.spendingLimit} onChange={(spendingLimit) => setForm({ ...form, spendingLimit })} />
          <div className="field">
            <label>Company role</label>
            {rolesQuery.isLoading ? <div className="team-role-empty">Loading roles...</div> : (
              <div className="team-role-options">
                {roles.map((role) => (
                  <RoleOption
                    key={role.id}
                    role={role}
                    selected={form.roleIds.includes(role.id)}
                    onToggle={() => setForm((current) => ({
                      ...current,
                      roleIds: current.roleIds.includes(role.id)
                        ? current.roleIds.filter((id) => id !== role.id)
                        : [...current.roleIds, role.id],
                    }))}
                  />
                ))}
              </div>
            )}
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.sendInvite} onChange={(event) => setForm({ ...form, sendInvite: event.target.checked })} />
            Send invite link
          </label>
          {!form.sendInvite && <Field label="Initial password" value={form.password} onChange={(password) => setForm({ ...form, password })} type="password" />}
          <button className="btn primary" type="submit" disabled={!canSubmit || create.isPending || rolesQuery.isLoading}>
            <Plus size={14} /> {create.isPending ? 'Creating...' : 'Create team member'}
          </button>
        </form>
      </div>
    </>
  );
}

function RoleOption({ role, selected, onToggle }: { role: CustomerRole; selected: boolean; onToggle: () => void }) {
  const visiblePermissions = Object.entries(role.permissions)
    .filter(([, enabled]) => enabled)
    .map(([permission]) => PERMISSION_LABELS[permission] ?? permission)
    .slice(0, 5);
  return (
    <button type="button" className={`team-role-option${selected ? ' selected' : ''}`} onClick={onToggle}>
      <span className="team-role-check">{selected ? 'On' : ''}</span>
      <span className="team-role-body">
        <strong>{role.name}</strong>
        <small>{role.description ?? 'Custom account role'}</small>
        <span className="team-permission-list">
          {visiblePermissions.map((permission) => <em key={permission}>{permission}</em>)}
        </span>
      </span>
    </button>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return <div className="preview-empty"><div className="title">{title}</div><div className="note">{body}</div></div>;
}

function ErrorCard({ title, error, retry }: { title: string; error: unknown; retry: () => void }) {
  return (
    <div className="preview-empty">
      <AlertTriangle className="ico" size={24} />
      <div className="title">{title}</div>
      <div className="note">{apiErrorMessage(error)}</div>
      <button className="btn" type="button" onClick={retry} style={{ marginTop: 14 }}><RefreshCw size={14} /> Retry</button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (next: string) => void; type?: string }) {
  return <div className="field"><label>{label}</label><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function formatMoney(cents: number) {
  if (cents <= 0) return '$0';
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
