import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Settings as SettingsIcon, Tag, ClipboardList, LogOut, LifeBuoy, DollarSign,
  ShoppingCart, UserSquare2, Workflow, KeyRound, FileCheck2,
  FileText, Mail,
} from 'lucide-react';
import { MEMBER_PERMISSIONS, resolveBrandLogoUrl } from '@factory-engine-pro/contracts';
import { adminApi, clearSurfaceSessions } from '@/lib/api';
import { adminRoleLabel, principalInitials, useCurrentPrincipal } from '@/lib/current-principal';
import {
  MAIL_MARKETING_PERMISSIONS,
  MAIL_TEMPLATE_PERMISSIONS,
  SYSTEM_MAIL_PERMISSIONS,
  hasAnyPermission,
} from '@/lib/permission-groups';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

interface NavLeaf {
  to: string;
  matchPrefix: string;
  i18nKey: string;
  id: string;
  icon: typeof LayoutDashboard;
  permission?: string | readonly string[];
  search?: Record<string, string>;
  activeTabs?: string[];
  exact?: boolean;
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
      { to: '/call-center', matchPrefix: '/call-center', i18nKey: 'nav.call_center', id: 'nav-call-center', icon: ClipboardList, permission: 'task.assign' },
    ],
  },
  {
    groupKey: 'nav.group_automation',
    children: [
      { to: '/rules', matchPrefix: '/rules', i18nKey: 'nav.rules', id: 'nav-rules', icon: Workflow, permission: 'settings.read' },
    ],
  },
  {
    groupKey: 'nav.group_organization',
    children: [
      { to: '/team/users', matchPrefix: '/team/users', i18nKey: 'nav.team_members', id: 'nav-team-users', icon: Users, permission: 'members.read' },
      { to: '/team/roles', matchPrefix: '/team/roles', i18nKey: 'nav.team_roles', id: 'nav-team-roles', icon: KeyRound, permission: 'roles.read' },
      {
        to: '/team/commissions',
        matchPrefix: '/team/commissions',
        i18nKey: 'nav.team_commissions',
        id: 'nav-team-commissions',
        icon: DollarSign,
        permission: [MEMBER_PERMISSIONS.membersRead, MEMBER_PERMISSIONS.commissionSubmit],
      },
    ],
  },
  {
    groupKey: 'nav.group_transactional_mail',
    children: [
      { to: '/system-mail', matchPrefix: '/system-mail', i18nKey: 'nav.system_mail', id: 'nav-system-mail', icon: Mail, permission: SYSTEM_MAIL_PERMISSIONS },
      { to: '/mail-marketing', matchPrefix: '/mail-marketing', i18nKey: 'nav.mail_templates', id: 'nav-mail-templates', icon: FileText, permission: MAIL_TEMPLATE_PERMISSIONS, search: { tab: 'templates' }, activeTabs: ['templates'] },
      { to: '/mail-marketing', matchPrefix: '/mail-marketing', i18nKey: 'nav.mail_marketing', id: 'nav-mail-marketing', icon: Mail, permission: MAIL_MARKETING_PERMISSIONS, search: { tab: 'overview' }, activeTabs: ['overview', 'contacts', 'audiences', 'campaigns', 'flows', 'settings'] },
    ],
  },
  {
    groupKey: 'nav.group_system',
    children: [
      { to: '/settings/workspace', matchPrefix: '/settings', i18nKey: 'nav.workspace_settings', id: 'nav-workspace', icon: SettingsIcon, permission: 'settings.read' },
    ],
  },
];

interface Props { collapsed: boolean; }

export function Sidebar({ collapsed }: Props) {
  const { t } = useTranslation();
  const router = useRouterState({ select: (s) => ({ pathname: s.location.pathname, search: s.location.search as Record<string, unknown> }) });
  const principal = useCurrentPrincipal().data;
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const brandAssets = brandQuery.data?.brandAssets;
  const compactLogo = brandAssets?.squareLogoUrl
    || (brandAssets?.systemIconSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brandAssets.systemIconSvg)}` : '')
    || resolveBrandLogoUrl(brandAssets, brandQuery.data?.brandLogo, 'dark');
  const permissions = new Set(principal?.permissions ?? []);
  const can = (permission?: string | readonly string[]) => hasAnyPermission(permissions, permission);
  const sections = NAV.map((section) => ({
    ...section,
    children: section.children.filter((leaf) => can(leaf.permission)),
  })).filter((section) => section.children.length > 0);
  const roleLabel = adminRoleLabel(principal);
  const logout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // Local session cleanup must still happen if the server token is already expired.
    } finally {
      clearSurfaceSessions();
      window.location.replace('/login');
    }
  };

  return (
    <aside className="sidebar" data-i18n-section="sidebar">
      <div className="workspace">
        {compactLogo ? <img className="ws-logo" src={compactLogo} alt={brandAssets?.logoAltText || brandName} /> : <div className="ws-badge">{brandBadge}</div>}
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
              const currentTab = typeof router.search.tab === 'string' ? router.search.tab : 'overview';
              const pathActive = leaf.exact ? router.pathname === leaf.matchPrefix : router.pathname === leaf.matchPrefix || router.pathname.startsWith(`${leaf.matchPrefix}/`);
              const active = pathActive && (!leaf.activeTabs || leaf.activeTabs.includes(currentTab));
              return (
                <Link
                  key={leaf.id}
                  to={leaf.to}
                  search={leaf.search as never}
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
        <button id="btn-logout" data-i18n-key="common.logout" type="button" className="logout" title={t('common.logout')} onClick={() => void logout()}>
          <LogOut size={14} />
        </button>
      </div>
      {collapsed ? null : null}
    </aside>
  );
}
