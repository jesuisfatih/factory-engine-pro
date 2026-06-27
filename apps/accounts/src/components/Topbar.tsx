import { useTranslation } from 'react-i18next';
import { PanelLeft, Bell } from 'lucide-react';

interface Props {
  titleI18nKey: string;
  onToggleSidebar: () => void;
}

export function Topbar({ titleI18nKey, onToggleSidebar }: Props) {
  const { t } = useTranslation();
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
        <button id="btn-notifications" type="button" className="icon-btn" title={t('common.notifications')}>
          <Bell size={16} />
        </button>
      </div>
    </header>
  );
}
