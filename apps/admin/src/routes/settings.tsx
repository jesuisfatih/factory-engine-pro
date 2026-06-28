import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { Tabs } from '@/components/Tabs';
import { PageHeader } from '@/components/PageHeader';

function SettingsLayout() {
  return (
    <>
      <PageHeader titleI18nKey="settings.title" subtitleI18nKey="settings.subtitle" />
      <Tabs
        tabs={[
          { to: '/settings/workspace', i18nKey: 'settings.tabs.workspace', id: 'tab-settings-workspace' },
          { to: '/settings/ai', i18nKey: 'settings.tabs.ai', id: 'tab-settings-ai' },
          { to: '/settings/aircall', i18nKey: 'settings.tabs.aircall', id: 'tab-settings-aircall' },
          { to: '/settings/shopify', i18nKey: 'settings.tabs.shopify', id: 'tab-settings-shopify' },
          { to: '/settings/initial-setup', i18nKey: 'settings.tabs.initial_setup', id: 'tab-settings-initial-setup' },
        ]}
      />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings') throw redirect({ to: '/settings/workspace' });
  },
});
