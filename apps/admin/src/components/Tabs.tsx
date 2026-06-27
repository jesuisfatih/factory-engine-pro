import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

interface Tab { to: string; i18nKey: string; id: string; }
interface Props { tabs: Tab[]; }

export function Tabs({ tabs }: Props) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => {
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
            {t(tab.i18nKey)}
          </Link>
        );
      })}
    </div>
  );
}
