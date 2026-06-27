import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

interface Props {
  titleI18nKey: string;
  subtitleI18nKey?: string;
  actions?: ReactNode;
}

export function PageHeader({ titleI18nKey, subtitleI18nKey, actions }: Props) {
  const { t } = useTranslation();
  return (
    <div className="page-head">
      <div>
        <h2 data-i18n-key={titleI18nKey}>{t(titleI18nKey)}</h2>
        {subtitleI18nKey && (
          <div className="subtitle" data-i18n-key={subtitleI18nKey}>{t(subtitleI18nKey)}</div>
        )}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
