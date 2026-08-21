import { Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { accountsTokenStore, readSession } from '@/lib/api';
import { accountRouteAccess, useCurrentPrincipal } from '@/lib/current-principal';
import { useOrderHistoryPortalMode } from '@/lib/workspace-brand';

const TITLE_BY_PATH: Array<{ test: RegExp; key: string }> = [
  { test: /^\/$/, key: 'nav.home' },
  { test: /^\/addresses/, key: 'nav.addresses' },
  { test: /^\/support/, key: 'nav.support' },
  { test: /^\/team/, key: 'nav.team' },
  { test: /^\/profile/, key: 'nav.profile' },
  { test: /^\/orders/, key: 'nav.orders' },
  { test: /^\/cart/, key: 'nav.cart' },
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
  const orderHistoryMode = useOrderHistoryPortalMode();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('accounts-theme') === 'dark' ? 'dark' : 'light');
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const titleKey = useMemo(() => {
    for (const item of TITLE_BY_PATH) if (item.test.test(pathname)) return item.key;
    return 'app.brand';
  }, [pathname]);

  const isAuth = AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));
  const hasSession = Boolean(readSession()?.accessToken);
  const principalQuery = useCurrentPrincipal();

  useEffect(() => {
    if (!orderHistoryMode) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('accounts-theme', theme);
  }, [orderHistoryMode, theme]);

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

  if (principalQuery.isLoading && !principalQuery.data) {
    return <PortalGate title="Checking your portal access" body="Loading your live account permissions." />;
  }

  if (principalQuery.isError && !principalQuery.data) {
    return (
      <PortalGate
        title="Please sign in again"
        body="Your account session could not be verified."
        action={<button className="btn primary" type="button" onClick={() => { accountsTokenStore.clear(); window.location.assign('/login'); }}>Sign in</button>}
      />
    );
  }

  const access = accountRouteAccess(pathname, principalQuery.data);
  const blockedOrderHistoryRoute = orderHistoryMode && ['/cart', '/reorder', '/pickup'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (blockedOrderHistoryRoute) {
    window.location.replace(pathname.startsWith('/pickup') ? '/tracking' : '/orders');
    return null;
  }

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}${orderHistoryMode ? ' portal-order-history' : ''}`}>
      <Sidebar collapsed={collapsed} />
      <div className="main">
        <Topbar
          titleI18nKey={titleKey}
          onToggleSidebar={() => setCollapsed((current) => !current)}
          orderHistoryMode={orderHistoryMode}
          theme={theme}
          onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        />
        <div className="content">
          {access.allowed ? <Outlet /> : (
            <div className="preview-empty">
              <div className="title">{access.title}</div>
              <div className="note">{access.body}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({ component: RootLayout });

function PortalGate({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="preview-empty">
        <div className="title">{title}</div>
        <div className="note">{body}</div>
        {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
      </div>
    </div>
  );
}
