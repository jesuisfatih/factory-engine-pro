import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ArrowLeft, Tag, Truck, ShieldCheck, MapPin, Upload } from 'lucide-react';
import { accountsApi, apiErrorMessage } from '@/lib/api';

interface FormShape {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  legalName: string;
  website: string;
  industry: string;
  estimatedMonthlyVolume: string;
  password: string;
  confirmPassword: string;
  taxCertificate: File | null;
  message: string;
}

const EMPTY: FormShape = {
  firstName: '', lastName: '', email: '', phone: '',
  companyName: '', legalName: '', website: '',
  industry: 'Apparel', estimatedMonthlyVolume: '',
  password: '', confirmPassword: '', taxCertificate: null, message: '',
};

const BENEFIT_ICONS = [Tag, ShieldCheck, Truck, MapPin] as const;

function RequestInvitationView() {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormShape>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const benefits = t('auth.invite.hero_benefits', { returnObjects: true }) as string[];
  const industries = t('auth.invite.industries', { returnObjects: true }) as string[];
  const update = (patch: Partial<FormShape>) => setForm((current) => ({ ...current, ...patch }));

  const canSubmit = form.firstName && form.lastName && form.email && form.companyName
    && form.password && form.password === form.confirmPassword;

  if (submitted) {
    return (
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <div className="auth-brand">
          <div className="ws-badge" style={{ width: 40, height: 40, fontSize: 14 }}>DB</div>
          <div>
            <div className="name">DTF BANK</div>
            <div className="muted">Buyer portal</div>
          </div>
        </div>
        <div className="auth-icon-circle success">
          <CheckCircle2 size={32} />
        </div>
        <h2>{t('auth.invite.success_title')}</h2>
        <p className="muted">{t('auth.invite.success_body', { email: form.email })}</p>
        <a className="btn primary" href="#" style={{ marginTop: 16, justifyContent: 'center' }}>
          <ArrowLeft size={14} /> {t('auth.invite.back_to_login')}
        </a>
      </div>
    );
  }

  return (
    <div className="invite-shell">
      <aside className="invite-hero">
        <div className="invite-brand">
          <div className="ws-badge" style={{ width: 44, height: 44, fontSize: 14 }}>DB</div>
          <div>
            <div className="name">DTF BANK</div>
            <div className="muted">Buyer portal</div>
          </div>
        </div>

        <div className="invite-hero-body">
          <div className="eyebrow">{t('auth.invite.hero_eyebrow')}</div>
          <h1>{t('auth.invite.hero_title')}</h1>
          <p>{t('auth.invite.hero_subtitle')}</p>

          <ul className="invite-benefits">
            {benefits.map((benefit, index) => {
              const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length];
              return (
                <li key={benefit}>
                  <span className="ico"><Icon size={14} /></span>
                  {benefit}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <main className="invite-form">
        <header>
          <h2>{t('auth.invite.form_title')}</h2>
          <p className="muted">{t('auth.invite.form_subtitle')}</p>
        </header>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (!canSubmit) return;
            setSubmitting(true);
            try {
              await accountsApi.submitB2BAccessRequest({
                firstName: form.firstName,
                lastName: form.lastName,
                email: form.email,
                phone: form.phone || undefined,
                companyName: form.companyName,
                legalName: form.legalName || form.companyName,
                website: form.website || undefined,
                industry: form.industry || undefined,
                estimatedMonthlyVolume: form.estimatedMonthlyVolume || undefined,
                password: form.password,
                message: form.message || undefined,
                flowIntent: 'request-invitation',
                sourceSurface: 'accounts-request-invitation',
                sourcePath: '/request-invitation',
              }, form.taxCertificate ?? undefined);
              setSubmitted(true);
            } catch (requestError) {
              setError(apiErrorMessage(requestError));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="field-row">
            <div className="field">
              <label htmlFor="iv-first">{t('auth.invite.field_first')}</label>
              <input id="iv-first" value={form.firstName} onChange={(event) => update({ firstName: event.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="iv-last">{t('auth.invite.field_last')}</label>
              <input id="iv-last" value={form.lastName} onChange={(event) => update({ lastName: event.target.value })} required />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="iv-email">{t('auth.invite.field_email')}</label>
              <input id="iv-email" type="email" value={form.email} onChange={(event) => update({ email: event.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="iv-phone">{t('auth.invite.field_phone')}</label>
              <input id="iv-phone" value={form.phone} onChange={(event) => update({ phone: event.target.value })} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="iv-company">{t('auth.invite.field_company')}</label>
              <input id="iv-company" value={form.companyName} onChange={(event) => update({ companyName: event.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="iv-legal">{t('auth.invite.field_legal')}</label>
              <input id="iv-legal" value={form.legalName} onChange={(event) => update({ legalName: event.target.value })} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="iv-website">{t('auth.invite.field_website')}</label>
              <input id="iv-website" type="url" value={form.website} onChange={(event) => update({ website: event.target.value })} placeholder="https://" />
            </div>
            <div className="field">
              <label htmlFor="iv-industry">{t('auth.invite.field_industry')}</label>
              <select id="iv-industry" value={form.industry} onChange={(event) => update({ industry: event.target.value })}>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>{industry}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="iv-volume">{t('auth.invite.field_volume')}</label>
            <input id="iv-volume" value={form.estimatedMonthlyVolume} onChange={(event) => update({ estimatedMonthlyVolume: event.target.value })} placeholder="e.g. $5,000 / month" />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="iv-pwd">{t('auth.invite.field_password')}</label>
              <input id="iv-pwd" type="password" value={form.password} onChange={(event) => update({ password: event.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor="iv-pwd-confirm">{t('auth.invite.field_confirm')}</label>
              <input id="iv-pwd-confirm" type="password" value={form.confirmPassword} onChange={(event) => update({ confirmPassword: event.target.value })} required />
            </div>
          </div>

          <div className="field">
            <label htmlFor="iv-tax">{t('auth.invite.field_tax_cert')}</label>
            <label className="upload-dropzone" htmlFor="iv-tax">
              <Upload size={14} />
              <span>{form.taxCertificate?.name ?? 'Click to upload'}</span>
              <input
                id="iv-tax"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(event) => update({ taxCertificate: event.target.files?.[0] ?? null })}
              />
            </label>
          </div>

          <div className="field">
            <label htmlFor="iv-message">{t('auth.invite.field_message')}</label>
            <textarea id="iv-message" rows={3} value={form.message} onChange={(event) => update({ message: event.target.value })} />
          </div>

          {error ? <div className="error-state">{error}</div> : null}

          <button type="submit" className="save-btn" disabled={!canSubmit || submitting} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            {submitting ? t('common.loading') : t('auth.invite.submit')}
          </button>

          <a href="#" className="auth-link" style={{ justifyContent: 'center' }}>
            {t('auth.invite.back_to_login')}
          </a>
        </form>
      </main>
    </div>
  );
}

export const Route = createFileRoute('/request-invitation')({ component: RequestInvitationView });
