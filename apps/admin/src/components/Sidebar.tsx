import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Settings as SettingsIcon, Tag, ClipboardList, LogOut, LifeBuoy, DollarSign,
  ShoppingCart, UserSquare2, Workflow, Sparkles, Cable, KeyRound, Store, FileCheck2,
  Mail,
} from 'lucide-react';
import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';
import { adminTokenStore } from '@/lib/api';
import { adminRoleLabel, principalInitials, useCurrentPrincipal } from '@/lib/current-principal';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

interface NavLeaf {
  to: string;
  matchPrefix: string;
  i18nKey: string;
  id: string;
  icon: typeof LayoutDashboard;
  permission?: string;
}

const NAV: { groupKey: string; children: NavLeaf[] }[] = [
  {
    groupKey: 'nav.group_overview',
    children: [
      { to: '/dashboard', matchPrefix: '/dashboard', i18nKey: 'nav.dashboard', id: 'nav-dashboard', icon: LayoutDashboard },
    ],
  },
  {
    groupKey: 'nav.group_commerce',
    children: [
      { to: '/orders', matchPrefix: '/orders', i18nKey: 'nav.orders', id: 'nav-orders', icon: ShoppingCart, permission: 'orders.read' },
      { to: '/customers', matchPrefix: '/customers', i18nKey: 'nav.customers', id: 'nav-customers', icon: UserSquare2, permission: 'customers.read' },
      { to: '/pricing', matchPrefix: '/pricing', i18nKey: 'nav.pricing', id: 'nav-pricing', icon: DollarSign, permission: 'pricing.read' },
    ],
  },
  {
    groupKey: 'nav.group_operations',
    children: [
      { to: '/segments', matchPrefix: '/segments', i18nKey: 'nav.segments', id: 'nav-segments', icon: Tag, permission: 'segments.read' },
      { to: '/support', matchPrefix: '/support', i18nKey: 'nav.support', id: 'nav-support', icon: LifeBuoy, permission: 'support.read' },
      { to: '/b2b-requests', matchPrefix: '/b2b-requests', i18nKey: 'nav.b2b_applications', id: 'nav-b2b-requests', icon: FileCheck2, permission: 'b2b_access.read' },
      { to: '/tasks/customer', matchPrefix: '/tasks', i18nKey: 'nav.tasks', id: 'nav-tasks', icon: ClipboardList, permission: 'task.assign' },
    ],
  },
  {
    groupKey: 'nav.group_automation',
    children: [
      { to: '/rules', matchPrefix: '/rules', i18nKey: 'nav.rules', id: 'nav-rules', icon: Workflow, permission: 'settings.write' },
    ],
  },
  {
    groupKey: 'nav.group_organization',
    children: [
      { to: '/team/users', matchPrefix: '/team/users', i18nKey: 'nav.team_members', id: 'nav-team-users', icon: Users, permission: 'members.read' },
      { to: '/team/roles', matchPrefix: '/team/roles', i18nKey: 'nav.team_roles', id: 'nav-team-roles', icon: KeyRound, permission: 'roles.read' },
      { to: '/team/commissions', matchPrefix: '/team/commissions', i18nKey: 'nav.team_commissions', id: 'nav-team-commissions', icon: DollarSign, permission: MEMBER_PERMISSIONS.membersRead },
    ],
  },
  {
    groupKey: 'nav.group_transactional_mail',
    children: [
      { to: '/system-mail', matchPrefix: '/system-mail', i18nKey: 'nav.system_mail', id: 'nav-system-mail', icon: Mail, permission: 'settings.read' },
    ],
  },
  {
    groupKey: 'nav.group_system',
    children: [
      { to: '/settings/workspace', matchPrefix: '/settings/workspace', i18nKey: 'nav.workspace_settings', id: 'nav-workspace', icon: SettingsIcon, permission: 'settings.read' },
      { to: '/settings/aircall', matchPrefix: '/settings/aircall', i18nKey: 'nav.aircall_settings', id: 'nav-aircall', icon: Cable, permission: MEMBER_PERMISSIONS.settingsRead },
      { to: '/settings/ai', matchPrefix: '/settings/ai', i18nKey: 'nav.ai_settings_legacy', id: 'nav-ai-old', icon: Sparkles, permission: 'settings.read' },
      { to: '/settings/shopify', matchPrefix: '/settings/shopify', i18nKey: 'nav.shopify_settings', id: 'nav-shopify', icon: Store, permission: 'settings.read' },
    ],
  },
];

interface Props { collapsed: boolean; }

export function Sidebar({ collapsed }: Props) {
  const { t } = useTranslation();
  const router = useRouterState({ select: (s) => s.location.pathname });
  const principal = useCurrentPrincipal().data;
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const permissions = new Set(principal?.permissions ?? []);
  const can = (permission?: string) => !permission || permissions.has(permission);
  const sections = NAV.map((section) => ({
    ...section,
    children: section.children.filter((leaf) => can(leaf.permission)),
  })).filter((section) => section.children.length > 0);
  const roleLabel = adminRoleLabel(principal);
  const logout = () => {
    adminTokenStore.clear();
    window.location.assign('/login');
  };

  return (
    <aside className="sidebar" data-i18n-section="sidebar">
      <div className="workspace">
        {brandQuery.data?.brandLogo ? <img className="ws-logo" src={brandQuery.data.brandLogo} alt="" /> : <div className="ws-badge">{brandBadge}</div>}
        <div className="ws-meta">
          <div className="name">{brandName}</div>
          <div className="role">{brandQuery.isError ? t('workspace.brand_unavailable') : t('workspace.back_panel')}</div>
        </div>
      </div>

      <div className="nav-list">
        {sections.map((section) => (
          <div key={section.groupKey}>
            <div className="group-label">{t(section.groupKey)}</div>
            {section.children.map((leaf) => {
              const Icon = leaf.icon;
              const active = router === leaf.matchPrefix || router.startsWith(`${leaf.matchPrefix}/`);
              return (
                <Link
                  key={leaf.to}
                  to={leaf.to}
                  id={leaf.id}
                  data-i18n-key={leaf.i18nKey}
                  className={`nav-item${active ? ' active' : ''}`}
                >
                  <Icon size={16} className="ico" />
                  <span className="nav-label">{t(leaf.i18nKey)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="user-card">
        <div className="user-avatar">{principalInitials(principal)}</div>
        <div className="user-meta">
          <div className="name">{principal?.email ?? 'No active session'}</div>
          <div className="role">{roleLabel}</div>
          {permissions.has(MEMBER_PERMISSIONS.settingsRead) && (
            <Link id="link-workspace-settings" to="/settings/workspace" className="user-settings-link">
              <SettingsIcon size={11} />
              <span>{t('workspace.settings_link')}</span>
            </Link>
          )}
        </div>
        <button id="btn-logout" data-i18n-key="common.logout" type="button" className="logout" title={t('common.logout')} onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>
      {collapsed ? null : null}
    </aside>
  );
}
