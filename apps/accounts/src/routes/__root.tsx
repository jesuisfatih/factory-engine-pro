import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { readSession } from '@/lib/api';

const TITLE_BY_PATH: Array<{ test: RegExp; key: string }> = [
  { test: /^\/addresses/, key: 'nav.addresses' },
  { test: /^\/support/, key: 'nav.support' },
  { test: /^\/team/, key: 'nav.team' },
  { test: /^\/profile/, key: 'nav.profile' },
  { test: /^\/orders/, key: 'nav.orders' },
  { test: /^\/products/, key: 'nav.products' },
  { test: /^\/reorder/, key: 'nav.reorder' },
  { test: /^\/invoices/, key: 'nav.invoices' },
  { test: /^\/documents/, key: 'nav.documents' },
  { test: /^\/tracking/, key: 'nav.tracking' },
  { test: /^\/pickup/, key: 'nav.pickup' },
];

/** Routes that render without the buyer-portal chrome (sidebar + topbar). */
const AUTH_ROUTES = ['/login', '/forgot-password', '/reset-password', '/register', '/request-invitation'];

function RootLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const titleKey = useMemo(() => {
    for (const item of TITLE_BY_PATH) if (item.test.test(pathname)) return item.key;
    return 'app.brand';
  }, [pathname]);

  const isAuth = AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));
  const hasSession = Boolean(readSession()?.accessToken);

  if (isAuth) {
    if (hasSession) {
      window.location.assign('/');
      return null;
    }
    return (
      <div className="auth-shell">
        <Outlet />
      </div>
    );
  }

  if (!hasSession) {
    window.location.assign('/login');
    return null;
  }

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} />
      <div className="main">
        <Topbar titleI18nKey={titleKey} onToggleSidebar={() => setCollapsed((current) => !current)} />
        <div className="content"><Outlet /></div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({ component: RootLayout });
