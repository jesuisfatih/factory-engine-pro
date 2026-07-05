import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, MapPin, LifeBuoy, Users2, LogOut, ShoppingCart, FileText,
  RotateCw, MapPinned, Truck, FileSpreadsheet, FolderArchive, UserCircle,
  Tag,
} from 'lucide-react';
import { accountsTokenStore } from '@/lib/api';
import { customerRoleLabel, principalInitials, useCurrentPrincipal } from '@/lib/current-principal';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

interface NavLeaf {
  to: string;
  matchPrefix: string;
  i18nKey: string;
  id: string;
  icon: typeof LayoutDashboard;
}

const NAV: { groupKey: string; children: NavLeaf[] }[] = [
  {
    groupKey: 'nav.group_commerce',
    children: [
      { to: '/', matchPrefix: '/', i18nKey: 'nav.home', id: 'nav-home', icon: LayoutDashboard },
      { to: '/orders', matchPrefix: '/orders', i18nKey: 'nav.orders', id: 'nav-orders', icon: ShoppingCart },
      { to: '/cart', matchPrefix: '/cart', i18nKey: 'nav.cart', id: 'nav-cart', icon: ShoppingCart },
      { to: '/products', matchPrefix: '/products', i18nKey: 'nav.products', id: 'nav-products', icon: Tag },
      { to: '/reorder', matchPrefix: '/reorder', i18nKey: 'nav.reorder', id: 'nav-reorder', icon: RotateCw },
    ],
  },
  {
    groupKey: 'nav.group_logistics',
    children: [
      { to: '/tracking', matchPrefix: '/tracking', i18nKey: 'nav.tracking', id: 'nav-tracking', icon: Truck },
      { to: '/pickup', matchPrefix: '/pickup', i18nKey: 'nav.pickup', id: 'nav-pickup', icon: MapPinned },
    ],
  },
  {
    groupKey: 'nav.group_billing',
    children: [
      { to: '/invoices', matchPrefix: '/invoices', i18nKey: 'nav.invoices', id: 'nav-invoices', icon: FileSpreadsheet },
      { to: '/documents', matchPrefix: '/documents', i18nKey: 'nav.documents', id: 'nav-documents', icon: FolderArchive },
    ],
  },
  {
    groupKey: 'nav.group_account',
    children: [
      { to: '/profile', matchPrefix: '/profile', i18nKey: 'nav.profile', id: 'nav-profile', icon: UserCircle },
      { to: '/addresses', matchPrefix: '/addresses', i18nKey: 'nav.addresses', id: 'nav-addresses', icon: MapPin },
      { to: '/team', matchPrefix: '/team', i18nKey: 'nav.team', id: 'nav-team', icon: Users2 },
    ],
  },
  {
    groupKey: 'nav.group_help',
    children: [
      { to: '/support', matchPrefix: '/support', i18nKey: 'nav.support', id: 'nav-support', icon: LifeBuoy },
    ],
  },
];

void FileText;

interface Props { collapsed: boolean; }

export function Sidebar({ collapsed }: Props) {
  const { t } = useTranslation();
  const router = useRouterState({ select: (s) => s.location.pathname });
  const principal = useCurrentPrincipal().data;
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const roleLabel = customerRoleLabel(principal);
  const logout = () => {
    accountsTokenStore.clear();
    window.location.assign('/login');
  };

  return (
    <aside className="sidebar" data-i18n-section="sidebar">
      <div className="workspace">
        {brandQuery.data?.brandLogo ? <img className="ws-logo" src={brandQuery.data.brandLogo} alt="" /> : <div className="ws-badge">{brandBadge}</div>}
        <div className="ws-meta">
          <div className="name">{brandName}</div>
          <div className="role">{t('app.workspace')}</div>
        </div>
      </div>

      <div className="nav-list">
        {NAV.map((section) => (
          <div key={section.groupKey}>
            <div className="group-label">{t(section.groupKey)}</div>
            {section.children.map((leaf) => {
              const Icon = leaf.icon;
              const active = leaf.matchPrefix === '/'
                ? router === '/'
                : router === leaf.matchPrefix || router.startsWith(`${leaf.matchPrefix}/`);
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
        </div>
        <button id="btn-logout" type="button" className="logout" title={t('common.logout')} onClick={logout}>
          <LogOut size={14} />
        </button>
      </div>
      {collapsed ? null : null}
    </aside>
  );
}
