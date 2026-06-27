import { useTranslation } from 'react-i18next';

interface Props {
  labelI18nKey: string;
  value: string | number;
  subI18nKey?: string;
  id: string;
}

export function Kpi({ labelI18nKey, value, subI18nKey, id }: Props) {
  const { t } = useTranslation();
  return (
    <div id={id} className="kpi" data-i18n-key={labelI18nKey}>
      <div className="label">{t(labelI18nKey)}</div>
      <div className="val">{value}</div>
      {subI18nKey && <div className="sub" data-i18n-key={subI18nKey}>{t(subI18nKey)}</div>}
    </div>
  );
}
