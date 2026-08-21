import { useTranslation } from 'react-i18next';
import { PanelLeft, Bell, LogOut, Moon, Sun } from 'lucide-react';
import { resolveBrandLogoUrl } from '@factory-engine-pro/contracts';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';
import { accountsTokenStore } from '@/lib/api';

interface Props {
  titleI18nKey: string;
  onToggleSidebar: () => void;
  orderHistoryMode?: boolean;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export function Topbar({ titleI18nKey, onToggleSidebar, orderHistoryMode = false, theme = 'light', onToggleTheme }: Props) {
  const { t } = useTranslation();
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const brandLogo = brandQuery.data?.brandAssets.squareLogoUrl?.trim()
    || resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, 'light');
  return (
    <header className="topbar" data-i18n-section="topbar">
      <button id="btn-toggle-sidebar" type="button" className="toggle" onClick={onToggleSidebar}>
        <PanelLeft size={16} />
      </button>
      <h1 data-i18n-key={titleI18nKey}>{t(titleI18nKey)}</h1>
      <input
        id="topbar-search"
        className="search"
        placeholder={t('common.search_placeholder')}
        data-i18n-key="common.search_placeholder"
      />
      <div className="right">
        <div className="topbar-workspace" title={brandName}>
          {brandLogo ? <img src={brandLogo} alt="" /> : <span>{brandBadge}</span>}
          <strong>{brandName}</strong>
        </div>
        <button id="btn-notifications" type="button" className="icon-btn" title={t('common.notifications')}>
          <Bell size={16} />
        </button>
        {orderHistoryMode ? <button id="btn-theme" type="button" className="icon-btn" title={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={onToggleTheme}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button> : null}
        {orderHistoryMode ? <button id="btn-logout" type="button" className="topbar-logout" onClick={() => { accountsTokenStore.clear(); window.location.assign('/login'); }}>
          <LogOut size={14} /> {t('common.logout')}
        </button> : null}
      </div>
    </header>
  );
}
