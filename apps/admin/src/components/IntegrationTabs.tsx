import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';

interface Tab {
  to: string;
  i18nKey: string;
  id: string;
  icon: LucideIcon;
}
interface Props { tabs: Tab[]; }

export function IntegrationTabs({ tabs }: Props) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="integration-tabs" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            id={tab.id}
            data-i18n-key={tab.i18nKey}
            className={`tab${active ? ' active' : ''}`}
            role="tab"
          >
            <Icon size={13} />
            <span>{t(tab.i18nKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
