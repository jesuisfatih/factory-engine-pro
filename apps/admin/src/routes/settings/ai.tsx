import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { Brain, Activity, FileText, Wallet, Heart, Settings as Cog, ClipboardList, ScrollText } from 'lucide-react';
import { IntegrationHeader } from '@/components/IntegrationHeader';
import { IntegrationTabs } from '@/components/IntegrationTabs';

const TABS = [
  { to: '/settings/ai/tasks', i18nKey: 'ai.tabs.tasks', id: 'aitab-tasks', icon: ClipboardList },
  { to: '/settings/ai/usage-log', i18nKey: 'ai.tabs.usage_log', id: 'aitab-usage-log', icon: ScrollText },
  { to: '/settings/ai/services', i18nKey: 'ai.tabs.services', id: 'aitab-services', icon: Activity },
  { to: '/settings/ai/prompts', i18nKey: 'ai.tabs.prompts', id: 'aitab-prompts', icon: FileText },
  { to: '/settings/ai/budget', i18nKey: 'ai.tabs.budget', id: 'aitab-budget', icon: Wallet },
  { to: '/settings/ai/health', i18nKey: 'ai.tabs.health', id: 'aitab-health', icon: Heart },
  { to: '/settings/ai/settings', i18nKey: 'ai.tabs.settings', id: 'aitab-settings', icon: Cog },
];

function AiHubLayout() {
  return (
    <>
      <IntegrationHeader
        icon={Brain}
        tone="violet"
        labelI18nKey="ai.header.label"
        titleI18nKey="ai.header.title"
        subtitleI18nKey="ai.header.subtitle"
      />
      <IntegrationTabs tabs={TABS} />
      <Outlet />
    </>
  );
}

export const Route = createFileRoute('/settings/ai')({
  component: AiHubLayout,
  beforeLoad: ({ location }) => {
    if (location.pathname === '/settings/ai') throw redirect({ to: '/settings/ai/services' });
  },
});
