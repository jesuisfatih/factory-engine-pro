import { Outlet, createRootRoute, redirect, useRouterState } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { MEMBER_PERMISSIONS, memberSurfaceFromPermissions } from '@factory-engine-pro/contracts';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { handOffToPerson, readPersonSession, readSession } from '@/lib/api';

const TITLE_BY_PATH: Array<{ test: RegExp; key: string }> = [
  { test: /^\/rules/, key: 'nav.rules' },
  { test: /^\/orders/, key: 'nav.orders' },
  { test: /^\/customers/, key: 'nav.customers' },
  { test: /^\/pricing/, key: 'nav.pricing' },
  { test: /^\/mail-marketing/, key: 'nav.mail_marketing' },
  { test: /^\/system-mail/, key: 'nav.system_mail' },
  { test: /^\/dashboard/, key: 'nav.dashboard' },
  { test: /^\/team\/users\/add/, key: 'team.users.wizard.title' },
  { test: /^\/team/, key: 'nav.team' },
  { test: /^\/settings\/workspace/, key: 'nav.workspace_settings' },
  { test: /^\/settings/, key: 'nav.integrations' },
  { test: /^\/segments/, key: 'nav.segments' },
  { test: /^\/tasks\/messages/, key: 'messages.title' },
  { test: /^\/tasks\/calendar/, key: 'calendar_view.title' },
  { test: /^\/tasks/, key: 'nav.tasks' },
  { test: /^\/support/, key: 'nav.support' },
];

const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password'];
const ROUTE_PERMISSIONS: Array<{ test: RegExp; permission: string | string[] }> = [
  { test: /^\/team\/users\/add/, permission: MEMBER_PERMISSIONS.membersWrite },
  { test: /^\/team\/users/, permission: MEMBER_PERMISSIONS.membersRead },
  { test: /^\/team\/roles/, permission: MEMBER_PERMISSIONS.rolesRead },
  { test: /^\/team\/commissions/, permission: [MEMBER_PERMISSIONS.membersRead, MEMBER_PERMISSIONS.commissionSubmit] },
  { test: /^\/orders/, permission: MEMBER_PERMISSIONS.ordersRead },
  { test: /^\/customers/, permission: MEMBER_PERMISSIONS.customersRead },
  { test: /^\/pricing/, permission: MEMBER_PERMISSIONS.pricingRead },
  { test: /^\/segments/, permission: MEMBER_PERMISSIONS.segmentsRead },
  { test: /^\/support/, permission: MEMBER_PERMISSIONS.supportRead },
  { test: /^\/b2b-requests/, permission: MEMBER_PERMISSIONS.b2bAccessRead },
  { test: /^\/tasks/, permission: MEMBER_PERMISSIONS.taskAssign },
  { test: /^\/rules/, permission: MEMBER_PERMISSIONS.settingsWrite },
  { test: /^\/mail-marketing/, permission: MEMBER_PERMISSIONS.settingsRead },
  { test: /^\/system-mail/, permission: MEMBER_PERMISSIONS.settingsRead },
  { test: /^\/settings\/aircall/, permission: MEMBER_PERMISSIONS.settingsRead },
  { test: /^\/settings\/ai/, permission: MEMBER_PERMISSIONS.settingsRead },
  { test: /^\/settings\/shopify/, permission: MEMBER_PERMISSIONS.settingsRead },
  { test: /^\/settings\/workspace/, permission: MEMBER_PERMISSIONS.settingsRead },
];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

function redirectTarget(pathname: string, searchStr: string) {
  const target = `${pathname}${searchStr}`;
  return target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard';
}

function requiredPermission(pathname: string) {
  return ROUTE_PERMISSIONS.find((item) => item.test.test(pathname))?.permission;
}

function hasRoutePermission(permissions: string[], required: string | string[] | undefined) {
  if (!required) return true;
  return Array.isArray(required)
    ? required.some((permission) => permissions.includes(permission))
    : permissions.includes(required);
}

function RootLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const titleKey = useMemo(() => {
    for (const item of TITLE_BY_PATH) if (item.test.test(pathname)) return item.key;
    return 'nav.dashboard';
  }, [pathname]);

  const isAuth = isAuthRoute(pathname);
  if (isAuth) {
    return (
      <div className="auth-shell">
        <Outlet />
      </div>
    );
  }

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} />
      <div className="main">
        <Topbar titleI18nKey={titleKey} onToggleSidebar={() => setCollapsed((v) => !v)} />
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    const session = readSession();
    const personSession = readPersonSession();
    const hasSession = Boolean(session?.accessToken);
    const authRoute = isAuthRoute(location.pathname);

    if (session && memberSurfaceFromPermissions(session.principal.permissions) === 'person') {
      handOffToPerson(session);
      return;
    }

    if (!session && personSession && memberSurfaceFromPermissions(personSession.principal.permissions) === 'person') {
      window.location.assign('/staff/queue');
      return;
    }

    if (!hasSession && !authRoute) {
      throw redirect({
        to: '/login',
        search: { redirect: redirectTarget(location.pathname, location.searchStr) },
      });
    }

    if (hasSession && authRoute) {
      throw redirect({ to: '/dashboard' });
    }

    const permission = requiredPermission(location.pathname);
    if (hasSession && !authRoute && !hasRoutePermission(session?.principal.permissions ?? [], permission)) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: RootLayout,
});
