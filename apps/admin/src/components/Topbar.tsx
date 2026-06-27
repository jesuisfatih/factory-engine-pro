import { useTranslation } from 'react-i18next';
import { PanelLeft, Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { adminRoleLabel, useCurrentPrincipal } from '@/lib/current-principal';

interface Props {
  titleI18nKey: string;
  onToggleSidebar: () => void;
}

export function Topbar({ titleI18nKey, onToggleSidebar }: Props) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const principal = useCurrentPrincipal().data;
  const roleLabel = adminRoleLabel(principal);

  return (
    <header className="topbar" data-i18n-section="topbar">
      <button id="btn-toggle-sidebar" type="button" className="toggle" onClick={onToggleSidebar} title={t('common.search')}>
        <PanelLeft size={16} />
      </button>
      <h1 data-i18n-key={titleI18nKey}>{t(titleI18nKey)}</h1>
      <input
        id="topbar-search"
        data-i18n-key="common.search_placeholder"
        className="search"
        placeholder={t('common.search_placeholder')}
      />
      <div className="right">
        <span className="role-badge">{roleLabel}</span>
        <button id="btn-notifications" type="button" className="icon-btn" title={t('common.notifications')}>
          <Bell size={16} />
        </button>
        <button
          id="btn-theme-toggle"
          type="button"
          className="icon-btn"
          onClick={toggle}
          title={theme === 'dark' ? t('common.switch_to_light') : t('common.switch_to_dark')}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
