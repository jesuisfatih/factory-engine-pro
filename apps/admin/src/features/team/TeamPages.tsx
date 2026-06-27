import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, Check, Edit2, Mail, Plus, RefreshCw, Save, Search, Trash2, X } from 'lucide-react';
import { MEMBER_PERMISSIONS, type AircallUsersResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import { useCan } from '@/lib/permissions';

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
  invitation?: { token: string; expiresAt: string; delivery: { id: string; status: string } } | null;
};

const roleQuery = { queryKey: ['identity', 'member-roles'], queryFn: () => adminApi.memberRoles() as Promise<Role[]> };
const memberQuery = { queryKey: ['identity', 'members'], queryFn: () => adminApi.members() as Promise<Member[]> };
const inviteSteps = [
  { labelKey: 'team.users.wizard.step1_label', titleKey: 'team.users.wizard.step1_title', subtitleKey: 'team.users.wizard.step1_subtitle' },
  { labelKey: 'team.users.wizard.step2_label', titleKey: 'team.users.wizard.step2_title', subtitleKey: 'team.users.wizard.step2_subtitle' },
  { labelKey: 'team.users.wizard.step3_label', titleKey: 'team.users.wizard.step3_title', subtitleKey: 'team.users.wizard.step3_subtitle' },
  { labelKey: 'team.users.wizard.step4_label', titleKey: 'team.users.wizard.step4_title', subtitleKey: 'team.users.wizard.step4_subtitle' },
] as const;

export function TeamUsersPage() {
  const [search, setSearch] = useState('');
  const query = useQuery(memberQuery);
  const canWrite = useCan(MEMBER_PERMISSIONS.membersWrite);
  const users = query.data ?? [];
  const filtered = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return users;
    return users.filter((user) => `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(text));
  }, [search, users]);

  return (
    <>
      <TeamHeader action={canWrite ? <Link to="/team/users/add" className="btn primary"><Plus size={14} /> Invite member</Link> : undefined} />
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
        <StateCard
          title="No members yet"
          body={canWrite ? 'Invite the first owner, admin, or agent to start using this tenant.' : 'No team members are available for your current permissions.'}
          action={canWrite ? <Link to="/team/users/add" className="btn primary"><Plus size={14} /> Invite first member</Link> : undefined}
        />
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const roles = useQuery(roleQuery);
  const canWrite = useCan(MEMBER_PERMISSIONS.membersWrite);
  const canManageRoles = useCan(MEMBER_PERMISSIONS.rolesWrite);
  const aircallUsers = useQuery({
    queryKey: ['aircall', 'users', 'team-invite'],
    queryFn: () => adminApi.aircallUsers() as Promise<AircallUsersResponse>,
    retry: false,
  });
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', roleId: '', password: '', sendInvite: true, aircallUserId: '' });
  const [step, setStep] = useState(0);
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<Member | null>(null);
  const selectedRole = useMemo(() => roles.data?.find((role) => role.id === form.roleId) ?? null, [roles.data, form.roleId]);
  const permissionKeys = useMemo(() => {
    const keys = new Set<string>(Object.values(MEMBER_PERMISSIONS));
    Object.keys(selectedRole?.permissions ?? {}).forEach((permission) => keys.add(permission));
    Object.keys(selectedPermissions).forEach((permission) => keys.add(permission));
    return Array.from(keys).sort();
  }, [selectedRole, selectedPermissions]);
  const permissionOverrides = Boolean(selectedRole) && permissionKeys.some((permission) => Boolean(selectedPermissions[permission]) !== Boolean(selectedRole?.permissions[permission]));
  const selectedAircallUser = aircallUsers.data?.users.find((user) => user.aircallUserId === form.aircallUserId) ?? null;
  const canSubmit = Boolean(form.firstName && form.lastName && form.email && form.roleId && (form.sendInvite || form.password.length >= 8) && canWrite);
  const stepValid = [
    Boolean(form.roleId),
    Boolean(form.firstName && form.lastName && form.email && (form.sendInvite || form.password.length >= 8)),
    true,
    canSubmit,
  ];
  const create = useMutation({
    mutationFn: async () => {
      let roleId = form.roleId;
      if (selectedRole && permissionOverrides) {
        const customRole = await adminApi.createMemberRole({
          name: t('team.users.wizard.custom_role_name', { name: `${form.firstName} ${form.lastName}`.trim() || form.email }),
          slug: slugify(`${selectedRole.slug}_${form.email.split('@')[0]}_${Date.now().toString(36)}`),
          description: t('team.users.wizard.custom_role_description', { role: selectedRole.name }),
          permissions: selectedPermissions,
        }) as Role;
        roleId = customRole.id;
      }
      return adminApi.createMember({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        roleIds: [roleId],
        password: form.sendInvite ? undefined : form.password,
        sendInvite: form.sendInvite,
        aircallUserId: form.aircallUserId || undefined,
      }) as Promise<Member>;
    },
    onSuccess: (member) => {
      setCreated(member);
      qc.invalidateQueries({ queryKey: memberQuery.queryKey });
      qc.invalidateQueries({ queryKey: roleQuery.queryKey });
      toast.success(t('team.users.member_created_toast'), { description: member.email });
    },
    onError: (error) => toast.error(t('team.users.member_create_failed'), { description: apiErrorMessage(error) }),
  });

  const chooseRole = (role: Role) => {
    setForm({ ...form, roleId: role.id });
    setSelectedPermissions(role.permissions);
  };

  const goNext = () => setStep((current) => Math.min(current + 1, inviteSteps.length - 1));
  const goBack = () => setStep((current) => Math.max(current - 1, 0));
  const resetPermissions = () => setSelectedPermissions(selectedRole?.permissions ?? {});

  if (created) {
    return (
      <>
        <PageHeader titleI18nKey="team.users.wizard.title" subtitleI18nKey="team.subtitle" />
        <StateCard
          title={t('team.users.invite_created_title')}
          body={created.invitation ? t('team.users.invite_created_body', { email: created.email, status: created.invitation.delivery.status }) : t('team.users.password_created_body', { email: created.email })}
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" type="button" onClick={() => navigate({ to: '/team/users' })}><Check size={14} /> {t('team.users.view_users')}</button>
              {created.invitation && <Link className="btn" to="/system-mail">{t('team.users.open_mail_center')}</Link>}
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader titleI18nKey="team.users.wizard.title" subtitleI18nKey="team.subtitle" />
      {roles.isLoading && <StateCard title={t('team.users.loading_roles_title')} body={t('team.users.loading_roles_body')} />}
      {roles.isError && <ErrorCard error={roles.error} retry={() => roles.refetch()} />}
      {roles.isSuccess && roles.data.length === 0 && <StateCard title={t('team.users.no_roles_title')} body={t('team.users.no_roles_body')} action={<Link to="/team/roles" className="btn primary">{t('team.users.create_role')}</Link>} />}
      {roles.isSuccess && roles.data.length > 0 && (
        <form className="wizard" onSubmit={(event) => { event.preventDefault(); if (step === inviteSteps.length - 1) create.mutate(); }}>
          <div className="wizard-steps">
            {inviteSteps.map((item, index) => (
              <button
                key={item.labelKey}
                type="button"
                className={`step${index === step ? ' active' : ''}${index < step ? ' done' : ''}`}
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
              >
                <span className="step-no">{index < step ? <Check size={12} /> : index + 1}</span>
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <div className="wizard-pane">
            <h3>{t(inviteSteps[step].titleKey)}</h3>
            <div className="sub">{t(inviteSteps[step].subtitleKey)}</div>
            <div className="body">
              {step === 0 && (
                <div className="role-grid">
                  {roles.data.map((role) => (
                    <button key={role.id} type="button" className={`role-card${form.roleId === role.id ? ' selected' : ''}`} onClick={() => chooseRole(role)}>
                      <div className="label">{role.name}</div>
                      <div className="meta">{role.description ?? t('team.users.wizard.no_role_description')}</div>
                      <div className="meta">{t('team.users.wizard.permission_count', { count: Object.values(role.permissions).filter(Boolean).length })}</div>
                    </button>
                  ))}
                </div>
              )}

              {step === 1 && (
                <>
                  <div className="field-row">
                    <Field label={t('team.users.wizard.field_first_name')} value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
                    <Field label={t('team.users.wizard.field_last_name')} value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
                  </div>
                  <div className="field-row">
                    <Field label={t('team.users.wizard.field_email')} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
                    <Field label={t('team.users.wizard.field_phone')} value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>{t('team.users.field_aircall_user')}</label>
                      <select
                        value={form.aircallUserId}
                        onChange={(event) => setForm({ ...form, aircallUserId: event.target.value })}
                        disabled={aircallUsers.isLoading || aircallUsers.isError}
                      >
                        <option value="">{aircallUsers.isLoading ? t('common.loading') : t('team.users.aircall_none')}</option>
                        {(aircallUsers.data?.users ?? [])
                          .filter((user) => !user.linkedMember || user.aircallUserId === form.aircallUserId)
                          .map((user) => <option key={user.aircallUserId} value={user.aircallUserId}>{user.name} - {user.email ?? user.aircallUserId}</option>)}
                      </select>
                      {aircallUsers.isError && (
                        <div className="muted" style={{ marginTop: 6, color: 'var(--danger)' }}>
                          {t('team.users.aircall_load_failed')}: {apiErrorMessage(aircallUsers.error)}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="checkbox-row" style={{ marginTop: 26 }}>
                        <input type="checkbox" checked={form.sendInvite} onChange={(event) => setForm({ ...form, sendInvite: event.target.checked })} />
                        {t('team.users.wizard.send_invite_link')}
                      </label>
                      {!form.sendInvite && <Field label={t('team.users.wizard.field_initial_password')} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />}
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  {permissionOverrides && <div className="empty-state" style={{ marginBottom: 12 }}><strong>{t('team.users.wizard.custom_role_notice_title')}</strong><div>{t('team.users.wizard.custom_role_notice_body')}</div></div>}
                  {!canManageRoles && <div className="error-state">{t('team.users.wizard.no_roles_write_permission')}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span className="pill accent">{selectedRole ? selectedRole.name : t('team.users.wizard.select_role')}</span>
                    {canManageRoles && selectedRole && permissionOverrides && (
                      <button className="btn" type="button" onClick={resetPermissions}>{t('team.users.wizard.reset_permissions')}</button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    {permissionKeys.map((permission) => {
                      const inherited = Boolean(selectedRole?.permissions[permission]);
                      const enabled = Boolean(selectedPermissions[permission]);
                      return (
                        <label key={permission} className="checkbox-row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 0 }}>
                          {canManageRoles ? (
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) => setSelectedPermissions({ ...selectedPermissions, [permission]: event.target.checked })}
                            />
                          ) : (
                            <span className={`pill ${enabled ? 'success' : ''}`}>{enabled ? 'on' : 'off'}</span>
                          )}
                          <span style={{ flex: 1 }}>{permission}</span>
                          <span className={`pill ${inherited ? 'info' : 'accent'}`}>{inherited ? t('team.users.wizard.inherited') : t('team.users.wizard.custom')}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="workspace-preview">
                  {!canWrite && <div className="error-state">{t('team.users.wizard.no_write_permission')}</div>}
                  <div className="preview-row">
                    <strong>{t('team.users.wizard.review_identity')}</strong>
                    <div className="muted">{`${form.firstName} ${form.lastName}`.trim()} - {form.email}</div>
                    <div className="muted">{form.phone || t('team.users.wizard.no_phone')}</div>
                  </div>
                  <div className="preview-row">
                    <strong>{t('team.users.wizard.review_access')}</strong>
                    <div className="muted">{selectedRole?.name ?? t('team.users.wizard.select_role')}</div>
                    <div className="muted">{permissionOverrides ? t('team.users.wizard.review_custom_role') : t('team.users.wizard.review_inherited_role')}</div>
                    <div className="muted">{t('team.users.wizard.permission_count', { count: Object.values(selectedPermissions).filter(Boolean).length })}</div>
                  </div>
                  <div className="preview-row">
                    <strong>{t('team.users.wizard.review_delivery')}</strong>
                    <div className="muted">{form.sendInvite ? t('team.users.wizard.review_invite_email') : t('team.users.wizard.review_password_set')}</div>
                    <div className="muted">{selectedAircallUser ? `${selectedAircallUser.name} - ${selectedAircallUser.email ?? selectedAircallUser.aircallUserId}` : t('team.users.aircall_none')}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="nav">
              <button className="btn" type="button" onClick={goBack} disabled={step === 0 || create.isPending}>{t('common.back')}</button>
              {step < inviteSteps.length - 1 ? (
                <button className="btn primary" type="button" onClick={goNext} disabled={!stepValid[step]}>{t('common.continue')}</button>
              ) : (
                <button className="btn primary" type="submit" disabled={!canSubmit || create.isPending}><Mail size={14} /> {create.isPending ? t('team.users.wizard.creating') : t('team.users.wizard.create_member')}</button>
              )}
            </div>
          </div>
        </form>
      )}
    </>
  );
}

export function TeamRolesPage() {
  const roles = useQuery(roleQuery);
  const qc = useQueryClient();
  const canManageRoles = useCan(MEMBER_PERMISSIONS.rolesWrite);
  const [draft, setDraft] = useState({ id: '', name: '', description: '', permissions: {} as Record<string, boolean> });
  const isEditing = Boolean(draft.id);
  const resetDraft = () => setDraft({ id: '', name: '', description: '', permissions: {} });
  const chooseRole = (role: Role) => setDraft({
    id: role.id,
    name: role.name,
    description: role.description ?? '',
    permissions: { ...role.permissions },
  });
  const togglePermission = (permission: string, checked: boolean) => {
    setDraft((current) => ({ ...current, permissions: { ...current.permissions, [permission]: checked } }));
  };
  const saveRole = useMutation({
    mutationFn: () => {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        permissions: draft.permissions,
      };
      if (draft.id) return adminApi.updateMemberRole(draft.id, payload);
      return adminApi.createMemberRole({
        ...payload,
        slug: slugify(`${draft.name}_${Date.now().toString(36)}`),
      });
    },
    onSuccess: () => {
      resetDraft();
      qc.invalidateQueries({ queryKey: roleQuery.queryKey });
      toast.success(isEditing ? 'Role updated' : 'Role created');
    },
    onError: (error) => toast.error(isEditing ? 'Role update failed' : 'Role create failed', { description: apiErrorMessage(error) }),
  });
  const deleteRole = useMutation({
    mutationFn: (role: Role) => adminApi.deleteMemberRole(role.id),
    onSuccess: (_result, role) => {
      if (draft.id === role.id) resetDraft();
      qc.invalidateQueries({ queryKey: roleQuery.queryKey });
      qc.invalidateQueries({ queryKey: memberQuery.queryKey });
      toast.success('Role deleted', { description: role.name });
    },
    onError: (error) => toast.error('Role delete failed', { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <TeamHeader />
      <TeamTabs />
      {roles.isLoading && <StateCard title="Loading roles" body="Fetching live RBAC roles." />}
      {roles.isError && <ErrorCard error={roles.error} retry={() => roles.refetch()} />}
      {roles.isSuccess && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="data-card">
            {roles.data.length === 0 ? (
              <StateCard title="No roles yet" body="Default roles are created during tenant bootstrap. Create a custom role here if needed." />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Type</th>
                    <th>Permissions</th>
                    {canManageRoles && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {roles.data.map((role) => (
                    <tr key={role.id}>
                      <td><div className="name">{role.name}</div><div className="muted">role.{role.slug}</div></td>
                      <td><span className={`pill ${role.isSystem ? 'info' : 'accent'}`}>{role.isSystem ? 'system' : 'custom'}</span></td>
                      <td>{Object.values(role.permissions).filter(Boolean).length}</td>
                      {canManageRoles && (
                        <td>
                          {!role.isSystem && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button id={`btn-edit-role-${role.slug}`} className="btn" type="button" onClick={() => chooseRole(role)}>
                                <Edit2 size={13} /> Edit
                              </button>
                              <button
                                id={`btn-delete-role-${role.slug}`}
                                className="btn danger-outline"
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Delete this role? Assigned members will lose this role.')) deleteRole.mutate(role);
                                }}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {canManageRoles ? (
            <form className="data-card" style={{ padding: 16 }} onSubmit={(event) => { event.preventDefault(); saveRole.mutate(); }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ marginTop: 0 }}>{isEditing ? 'Edit role' : 'Create role'}</h3>
                {isEditing && (
                  <button className="btn" type="button" onClick={resetDraft}>
                    <X size={13} /> Cancel
                  </button>
                )}
              </div>
              <Field label="Role name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
              <Field label="Description" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
              <div className="field">
                <label>Permissions</label>
                <div style={{ display: 'grid', gap: 8 }}>
                  {Object.values(MEMBER_PERMISSIONS).map((permission) => (
                    <label key={permission} className="checkbox-row">
                      <input type="checkbox" checked={draft.permissions[permission] === true} onChange={(event) => togglePermission(permission, event.target.checked)} />
                      {permission}
                    </label>
                  ))}
                </div>
              </div>
              <button id="btn-save-role" className="btn primary" type="submit" disabled={!draft.name.trim() || saveRole.isPending}>
                <Save size={14} /> {saveRole.isPending ? 'Saving role' : 'Save role'}
              </button>
            </form>
          ) : (
            <StateCard title="Role management unavailable" body="You need roles.write permission to create, edit, or delete roles." />
          )}
        </div>
      )}
    </>
  );
}

function TeamHeader({ action }: { action?: React.ReactNode }) {
  return <PageHeader titleI18nKey="team.title" subtitleI18nKey="team.subtitle" actions={action} />;
}

function TeamTabs() {
  const canReadRoles = useCan(MEMBER_PERMISSIONS.rolesRead);
  const canReadMembers = useCan(MEMBER_PERMISSIONS.membersRead);
  const tabs = [
    canReadRoles && { to: '/team/roles', i18nKey: 'team.tabs.roles', id: 'tab-team-roles' },
    canReadMembers && { to: '/team/users', i18nKey: 'team.tabs.users', id: 'tab-team-users' },
    canReadMembers && { to: '/team/commissions', i18nKey: 'team.tabs.commissions', id: 'tab-team-commissions' },
  ].filter(Boolean) as Array<{ to: string; i18nKey: string; id: string }>;
  return (
    <Tabs
      tabs={tabs}
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
