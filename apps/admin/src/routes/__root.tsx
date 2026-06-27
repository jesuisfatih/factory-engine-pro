import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';

const TITLE_BY_PATH: Array<{ test: RegExp; key: string }> = [
  { test: /^\/rules/, key: 'nav.rules' },
  { test: /^\/orders/, key: 'nav.orders' },
  { test: /^\/customers/, key: 'nav.customers' },
  { test: /^\/pricing/, key: 'nav.pricing' },
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

function RootLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const titleKey = useMemo(() => {
    for (const item of TITLE_BY_PATH) if (item.test.test(pathname)) return item.key;
    return 'nav.dashboard';
  }, [pathname]);

  const isAuth = AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));
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

export const Route = createRootRoute({ component: RootLayout });
