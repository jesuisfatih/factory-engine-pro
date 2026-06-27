import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, Users, Settings as SettingsIcon, Tag, ClipboardList, LogOut, LifeBuoy, DollarSign,
  ShoppingCart, UserSquare2, Workflow, Sparkles, Cable, KeyRound, Store,
} from 'lucide-react';
import { useCurrentRole } from '@/lib/permissions';

interface NavLeaf {
  to: string;
  matchPrefix: string;
  i18nKey: string;
  id: string;
  icon: typeof LayoutDashboard;
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
      { to: '/orders', matchPrefix: '/orders', i18nKey: 'nav.orders', id: 'nav-orders', icon: ShoppingCart },
      { to: '/customers', matchPrefix: '/customers', i18nKey: 'nav.customers', id: 'nav-customers', icon: UserSquare2 },
      { to: '/pricing', matchPrefix: '/pricing', i18nKey: 'nav.pricing', id: 'nav-pricing', icon: DollarSign },
    ],
  },
  {
    groupKey: 'nav.group_operations',
    children: [
      { to: '/segments', matchPrefix: '/segments', i18nKey: 'nav.segments', id: 'nav-segments', icon: Tag },
      { to: '/support', matchPrefix: '/support', i18nKey: 'nav.support', id: 'nav-support', icon: LifeBuoy },
      { to: '/tasks/customer', matchPrefix: '/tasks', i18nKey: 'nav.tasks', id: 'nav-tasks', icon: ClipboardList },
    ],
  },
  {
    groupKey: 'nav.group_automation',
    children: [
      { to: '/rules', matchPrefix: '/rules', i18nKey: 'nav.rules', id: 'nav-rules', icon: Workflow },
    ],
  },
  {
    groupKey: 'nav.group_organization',
    children: [
      { to: '/team/users', matchPrefix: '/team/users', i18nKey: 'nav.team_members', id: 'nav-team-users', icon: Users },
      { to: '/team/roles', matchPrefix: '/team/roles', i18nKey: 'nav.team_roles', id: 'nav-team-roles', icon: KeyRound },
      { to: '/team/commissions', matchPrefix: '/team/commissions', i18nKey: 'nav.team_commissions', id: 'nav-team-commissions', icon: DollarSign },
    ],
  },
  {
    groupKey: 'nav.group_system',
    children: [
      { to: '/settings/aircall', matchPrefix: '/settings/aircall', i18nKey: 'nav.aircall_settings', id: 'nav-aircall', icon: Cable },
      { to: '/settings/ai', matchPrefix: '/settings/ai', i18nKey: 'nav.ai_settings_legacy', id: 'nav-ai-old', icon: Sparkles },
      { to: '/settings/shopify', matchPrefix: '/settings/shopify', i18nKey: 'nav.shopify_settings', id: 'nav-shopify', icon: Store },
    ],
  },
];

interface Props { collapsed: boolean; }

export function Sidebar({ collapsed }: Props) {
  const { t } = useTranslation();
  const router = useRouterState({ select: (s) => s.location.pathname });
  const role = useCurrentRole();

  return (
    <aside className="sidebar" data-i18n-section="sidebar">
      <div className="workspace">
        <div className="ws-badge">DB</div>
        <div className="ws-meta">
          <div className="name">{t('app.brand')}</div>
          <div className="role">{t('app.workspace')}</div>
        </div>
      </div>

      <div className="nav-list">
        {NAV.map((section) => (
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
        <div className="user-avatar">{role.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</div>
        <div className="user-meta">
          <div className="name">{role.email}</div>
          <div className="role">{role.label}</div>
        </div>
        <button id="btn-logout" data-i18n-key="common.logout" type="button" className="logout" title={t('common.logout')}>
          <LogOut size={14} />
        </button>
      </div>
      {collapsed ? null : null}
    </aside>
  );
}
