import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  icon: LucideIcon;
  tone: 'orange' | 'violet' | 'emerald';
  labelI18nKey: string;
  titleI18nKey: string;
  subtitleI18nKey: string;
  actions?: ReactNode;
}

export function IntegrationHeader({ icon: Icon, tone, labelI18nKey, titleI18nKey, subtitleI18nKey, actions }: Props) {
  const { t } = useTranslation();
  return (
    <div className={`integration-header ${tone}`} data-i18n-section="integration-header">
      <div className={`ico-wrap ${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <div className="label" data-i18n-key={labelI18nKey}>{t(labelI18nKey)}</div>
        <h2 data-i18n-key={titleI18nKey}>{t(titleI18nKey)}</h2>
        <div className="sub" data-i18n-key={subtitleI18nKey}>{t(subtitleI18nKey)}</div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
