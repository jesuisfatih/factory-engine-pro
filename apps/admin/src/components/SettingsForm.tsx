import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export interface SettingField {
  id: string;
  labelKey: string;
  type?: 'text' | 'password' | 'number' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  initial?: string | number;
  hint?: string;
}

interface Props {
  formId: string;
  titleKey: string;
  subtitleKey: string;
  fields: SettingField[];
  onSubmit?: (values: Record<string, string | number>) => void;
}

export function SettingsForm({ formId, titleKey, subtitleKey, fields, onSubmit }: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string | number>>(() =>
    fields.reduce<Record<string, string | number>>((acc, field) => {
      acc[field.id] = field.initial ?? '';
      return acc;
    }, {}),
  );

  const handle = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.(values);
    toast.success(t(titleKey) + ' saved', { description: 'Changes will apply on the next request.' });
  };

  return (
    <form id={formId} className="section" onSubmit={handle}>
      <h3 data-i18n-key={titleKey}>{t(titleKey)}</h3>
      <p className="subtitle" data-i18n-key={subtitleKey} style={{ marginTop: -4, marginBottom: 18 }}>
        {t(subtitleKey)}
      </p>

      {fields.map((field) => (
        <div className="field" key={field.id}>
          <label htmlFor={field.id} data-i18n-key={field.labelKey}>{t(field.labelKey)}</label>
          {field.type === 'select' ? (
            <select
              id={field.id}
              data-i18n-key={field.labelKey}
              value={String(values[field.id] ?? '')}
              onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              id={field.id}
              data-i18n-key={field.labelKey}
              type={field.type ?? 'text'}
              placeholder={field.placeholder}
              value={String(values[field.id] ?? '')}
              onChange={(e) => setValues((v) => ({ ...v, [field.id]: field.type === 'number' ? Number(e.target.value) : e.target.value }))}
            />
          )}
          {field.hint && <div className="hint">{field.hint}</div>}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <button id={`${formId}-cancel`} data-i18n-key="common.cancel" type="button" className="btn ghost">{t('common.cancel')}</button>
        <button id={`${formId}-save`} data-i18n-key="common.save" type="submit" className="btn primary">{t('common.save')}</button>
      </div>
    </form>
  );
}
