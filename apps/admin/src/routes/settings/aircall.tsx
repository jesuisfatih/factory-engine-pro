import { Outlet, createFileRoute, redirect, useRouterState } from '@tanstack/react-router';
import { Activity, Zap, Users as UsersIcon, Phone, Radio, History } from 'lucide-react';
import { IntegrationHeader } from '@/components/IntegrationHeader';
import { IntegrationTabs } from '@/components/IntegrationTabs';

const TABS = [
  { to: '/settings/aircall/connection', i18nKey: 'aircall_hub.tabs.connection', id: 'actab-connection', icon: Zap },
  { to: '/settings/aircall/users', i18nKey: 'aircall_hub.tabs.users', id: 'actab-users', icon: UsersIcon },
  { to: '/settings/aircall/numbers', i18nKey: 'aircall_hub.tabs.numbers', id: 'actab-numbers', icon: Phone },
  { to: '/settings/aircall/webhooks', i18nKey: 'aircall_hub.tabs.webhooks', id: 'actab-webhooks', icon: Radio },
  { to: '/settings/aircall/sync-logs', i18nKey: 'aircall_hub.tabs.sync_logs', id: 'actab-sync-logs', icon: History },
];

const SUBTITLE_BY_PATH: Array<{ test: RegExp; key: string }> = [
  { test: /\/users$/, key: 'aircall_hub.subtitle_users' },
  { test: /\/numbers$/, key: 'aircall_hub.subtitle_numbers' },
  { test: /\/webhooks$/, key: 'aircall_hub.subtitle_webhooks' },
  { test: /\/sync-logs$/, key: 'aircall_hub.subtitle_sync_logs' },
];

function AircallLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const subKey = SUBTITLE_BY_PATH.find((row) => row.test.test(pathname))?.key ?? 'aircall_hub.subtitle';

  return (
    <>
      <IntegrationHeader
        icon={Activity}
        tone="orange"
        labelI18nKey="aircall_hub.label"
        titleI18nKey="aircall_hub.title"
        subtitleI18nKey={subKey}
      />
      <IntegrationTabs tabs={TABS} />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute('/settings/aircall')({
  component: AircallLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings/aircall') throw redirect({ to: '/settings/aircall/connection' });
  },
});
