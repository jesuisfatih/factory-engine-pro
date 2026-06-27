import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Mail, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';

type Role = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
};

type Member = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  status: string;
  lastLoginAt?: string | null;
  aircallUserId?: string | null;
  roleAssignments: Array<{ role: Role }>;
  invitation?: { token: string; expiresAt: string } | null;
};

const roleQuery = { queryKey: ['identity', 'member-roles'], queryFn: () => adminApi.memberRoles() as Promise<Role[]> };
const memberQuery = { queryKey: ['identity', 'members'], queryFn: () => adminApi.members() as Promise<Member[]> };

export function TeamUsersPage() {
  const [search, setSearch] = useState('');
  const query = useQuery(memberQuery);
  const users = query.data ?? [];
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return users;
    return users.filter((user) => `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(text));
  }, [search, users]);

  return (
    <>
      <TeamHeader action={<Link to="/team/users/add" className="btn primary"><Plus size={14} /> Invite member</Link>} />
      <TeamTabs />
      <div className="orders-toolbar">
        <div className="orders-search" style={{ flex: 1 }}>
          <Search size={14} />
          <input placeholder="Search members" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      {query.isLoading && <StateCard title="Loading members" body="Fetching live team data from the API." />}
      {query.isError && <ErrorCard error={query.error} retry={() => query.refetch()} />}
      {query.isSuccess && users.length === 0 && (
        <StateCard title="No members yet" body="Invite the first owner, admin, or agent to start using this tenant." action={<Link to="/team/users/add" className="btn primary"><Plus size={14} /> Invite first member</Link>} />
      )}
      {query.isSuccess && users.length > 0 && (
        <div className="data-card">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Status</th><th>Aircall</th><th>Last login</th></tr></thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td><div className="name">{user.firstName} {user.lastName}</div><div className="muted">{user.phone ?? 'No phone'}</div></td>
                  <td>{user.email}</td>
                  <td>{user.roleAssignments.map((assignment) => <span key={assignment.role.id} className="pill accent" style={{ marginRight: 4 }}>{assignment.role.name}</span>)}</td>
                  <td><span className={`pill dot ${user.status === 'active' ? 'success' : user.status === 'invited' ? 'info' : 'danger'}`}>{user.status}</span></td>
                  <td>{user.aircallUserId ? <span className="pill success">{user.aircallUserId}</span> : <span className="pill">Not linked</span>}</td>
                  <td className="muted">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.isSuccess && users.length > 0 && filtered.length === 0 && <StateCard title="No matching members" body="Clear the search to see the full team list." />}
    </>
  );
}

export function TeamUserCreatePage() {
  const navigate = useNavigate();
  const roles = useQuery(roleQuery);
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', roleId: '', password: '', sendInvite: true, aircallUserId: '' });
  const [created, setCreated] = useState<Member | null>(null);
  const create = useMutation({
    mutationFn: () => adminApi.createMember({
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone || undefined,
      roleIds: [form.roleId],
      password: form.sendInvite ? undefined : form.password,
      sendInvite: form.sendInvite,
      aircallUserId: form.aircallUserId || undefined,
    }) as Promise<Member>,
    onSuccess: (member) => {
      setCreated(member);
      qc.invalidateQueries({ queryKey: memberQuery.queryKey });
      toast.success('Member created', { description: member.email });
    },
    onError: (error) => toast.error('Member create failed', { description: apiErrorMessage(error) }),
  });

  const canSubmit = form.firstName && form.lastName && form.email && form.roleId && (form.sendInvite || form.password.length >= 8);

  if (created) {
    return (
      <>
        <PageHeader titleI18nKey="team.users.wizard.title" subtitleI18nKey="team.subtitle" />
        <StateCard
          title="Member created"
          body={created.invitation ? `Invite token created. Local token: ${created.invitation.token}` : `${created.email} can sign in with the password you set.`}
          action={<button className="btn primary" type="button" onClick={() => navigate({ to: '/team/users' })}><Check size={14} /> View users</button>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader titleI18nKey="team.users.wizard.title" subtitleI18nKey="team.subtitle" />
      {roles.isLoading && <StateCard title="Loading roles" body="Fetching role choices from the API." />}
      {roles.isError && <ErrorCard error={roles.error} retry={() => roles.refetch()} />}
      {roles.isSuccess && roles.data.length === 0 && <StateCard title="No roles available" body="Create a member role before inviting users." action={<Link to="/team/roles" className="btn primary">Create role</Link>} />}
      {roles.isSuccess && roles.data.length > 0 && (
        <form className="data-card" style={{ padding: 16 }} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
          <div className="field-row">
            <Field label="First name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
            <Field label="Last name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
          </div>
          <div className="field-row">
            <Field label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
            <Field label="Phone" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Role</label>
              <select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
                <option value="">Select role</option>
                {roles.data.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </div>
            <Field label="Aircall user ID" value={form.aircallUserId} onChange={(aircallUserId) => setForm({ ...form, aircallUserId })} />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.sendInvite} onChange={(event) => setForm({ ...form, sendInvite: event.target.checked })} />
            Send invite link instead of setting password now
          </label>
          {!form.sendInvite && <Field label="Initial password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />}
          <button className="btn primary" type="submit" disabled={!canSubmit || create.isPending}><Mail size={14} /> {create.isPending ? 'Creating...' : 'Create member'}</button>
        </form>
      )}
    </>
  );
}

export function TeamRolesPage() {
  const roles = useQuery(roleQuery);
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const create = useMutation({
    mutationFn: () => adminApi.createMemberRole({
      name,
      slug: slugify(name),
      permissions,
      description: 'Custom role',
    }),
    onSuccess: () => {
      setName('');
      setPermissions({});
      qc.invalidateQueries({ queryKey: roleQuery.queryKey });
      toast.success('Role created');
    },
    onError: (error) => toast.error('Role create failed', { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <TeamHeader />
      <TeamTabs />
      {roles.isLoading && <StateCard title="Loading roles" body="Fetching live RBAC roles." />}
      {roles.isError && <ErrorCard error={roles.error} retry={() => roles.refetch()} />}
      {roles.isSuccess && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 16 }}>
          <div className="data-card">
            {roles.data.length === 0 ? (
              <StateCard title="No roles yet" body="Default roles are created during tenant bootstrap. Create a custom role here if needed." />
            ) : (
              <table className="data-table">
                <thead><tr><th>Role</th><th>Type</th><th>Permissions</th></tr></thead>
                <tbody>
                  {roles.data.map((role) => (
                    <tr key={role.id}>
                      <td><div className="name">{role.name}</div><div className="muted">role.{role.slug}</div></td>
                      <td><span className={`pill ${role.isSystem ? 'info' : 'accent'}`}>{role.isSystem ? 'system' : 'custom'}</span></td>
                      <td>{Object.values(role.permissions).filter(Boolean).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <form className="data-card" style={{ padding: 16 }} onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <h3 style={{ marginTop: 0 }}>Create role</h3>
            <Field label="Role name" value={name} onChange={setName} />
            <div className="field">
              <label>Permissions</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.values(MEMBER_PERMISSIONS).map((permission) => (
                  <label key={permission} className="checkbox-row">
                    <input type="checkbox" checked={permissions[permission] === true} onChange={(event) => setPermissions({ ...permissions, [permission]: event.target.checked })} />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
            <button className="btn primary" type="submit" disabled={!name || create.isPending}><Save size={14} /> Save role</button>
          </form>
        </div>
      )}
    </>
  );
}

function TeamHeader({ action }: { action?: React.ReactNode }) {
  return <PageHeader titleI18nKey="team.title" subtitleI18nKey="team.subtitle" actions={action} />;
}

function TeamTabs() {
  return (
    <Tabs
      tabs={[
        { to: '/team/roles', i18nKey: 'team.tabs.roles', id: 'tab-team-roles' },
        { to: '/team/users', i18nKey: 'team.tabs.users', id: 'tab-team-users' },
        { to: '/team/commissions', i18nKey: 'team.tabs.commissions', id: 'tab-team-commissions' },
      ]}
    />
  );
}

function StateCard({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="preview-empty">
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function ErrorCard({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="preview-empty">
      <AlertTriangle className="ico" size={24} />
      <div className="title">Could not load team data</div>
      <div className="note">{apiErrorMessage(error)}</div>
      <button className="btn" type="button" onClick={retry} style={{ marginTop: 14 }}><RefreshCw size={14} /> Retry</button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (next: string) => void; type?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_role';
}
