import { useState } from 'react';
import {
  BadgeCheck,
  BadgeDollarSign,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock3,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Headphones,
  HeartHandshake,
  Landmark,
  Mail,
  Monitor,
  PackageCheck,
  Palette,
  PhoneCall,
  Plus,
  Rocket,
  RotateCcw,
  ShoppingBag,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Truck,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { DEFAULT_ACCOUNT_PORTAL_EXPERIENCE, resolveBrandLogoUrl } from '@factory-engine-pro/contracts';
import type {
  AccountPortalBenefit,
  AccountPortalExperience,
  AccountPortalIcon,
  AccountPortalPage,
  AccountPortalRequestField,
  BrandAssets,
} from '@factory-engine-pro/contracts';

type Surface = 'login' | 'register' | 'requestAccess';

const SURFACES: Array<{ id: Surface; label: string; description: string; path: string }> = [
  { id: 'login', label: 'Login', description: 'Existing customer sign-in page', path: '/login' },
  { id: 'register', label: 'Create account', description: 'New customer self-registration page', path: '/register' },
  { id: 'requestAccess', label: 'B2B application', description: 'Business account request form', path: '/request-invitation' },
];

const ICONS: Record<AccountPortalIcon, LucideIcon> = {
  'badge-check': BadgeCheck,
  'badge-dollar-sign': BadgeDollarSign,
  'calendar-clock': CalendarClock,
  'circle-check': CircleCheck,
  'clock-3': Clock3,
  'credit-card': CreditCard,
  'file-check-2': FileCheck2,
  headphones: Headphones,
  'heart-handshake': HeartHandshake,
  landmark: Landmark,
  mail: Mail,
  'package-check': PackageCheck,
  palette: Palette,
  'phone-call': PhoneCall,
  rocket: Rocket,
  'shopping-bag': ShoppingBag,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  truck: Truck,
  users: Users,
  'wallet-cards': WalletCards,
};

const ICON_OPTIONS = Object.keys(ICONS) as AccountPortalIcon[];

export function AccountPortalExperienceEditor({
  value,
  onChange,
  workspaceName,
  brandBadge,
  brandLogo,
  brandAssets,
  disabled,
}: {
  value: AccountPortalExperience;
  onChange: (next: AccountPortalExperience) => void;
  workspaceName: string;
  brandBadge: string;
  brandLogo: string;
  brandAssets: BrandAssets;
  disabled: boolean;
}) {
  const [surface, setSurface] = useState<Surface>('login');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const page = value[surface];
  const surfaceMeta = SURFACES.find((item) => item.id === surface) ?? SURFACES[0];
  const setPage = (next: AccountPortalPage) => onChange({ ...value, [surface]: next });
  const setPageField = <K extends keyof AccountPortalPage>(field: K, next: AccountPortalPage[K]) => {
    setPage({ ...page, [field]: next });
  };

  const updateBenefit = (index: number, next: AccountPortalBenefit) => {
    const benefits = [...page.benefits];
    benefits[index] = next;
    setPageField('benefits', benefits);
  };

  const moveBenefit = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= page.benefits.length) return;
    const benefits = [...page.benefits];
    [benefits[index], benefits[target]] = [benefits[target], benefits[index]];
    setPageField('benefits', benefits);
  };

  const addBenefit = () => {
    if (page.benefits.length >= 8) return;
    setPageField('benefits', [
      ...page.benefits,
      { icon: 'badge-check', title: 'New benefit', body: 'Explain the value customers receive.', tone: 'blue' },
    ]);
  };

  const updateRequestField = (index: number, patch: Partial<AccountPortalRequestField>) => {
    const formFields = [...value.requestAccess.formFields];
    formFields[index] = { ...formFields[index], ...patch };
    onChange({ ...value, requestAccess: { ...value.requestAccess, formFields } });
  };

  const moveRequestField = (index: number, direction: -1 | 1) => {
    const fields = [...value.requestAccess.formFields];
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    onChange({ ...value, requestAccess: { ...value.requestAccess, formFields: fields } });
  };

  return (
    <section className="portal-editor" aria-label="Customer portal page editor">
      <div className="portal-editor-heading">
        <div>
          <h3>Customer portal pages</h3>
          <p>Customize tenant login, registration, and B2B request presentation without changing authentication behavior.</p>
        </div>
        <div className="portal-editor-heading-actions">
          <button type="button" className="btn" disabled={disabled} onClick={() => onChange(JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_PORTAL_EXPERIENCE)) as AccountPortalExperience)}><RotateCcw size={14} /> Reset defaults</button>
          <div className="portal-viewport-toggle" aria-label="Preview viewport">
            <button type="button" className={viewport === 'desktop' ? 'active' : ''} onClick={() => setViewport('desktop')} title="Desktop preview"><Monitor size={15} /></button>
            <button type="button" className={viewport === 'mobile' ? 'active' : ''} onClick={() => setViewport('mobile')} title="Mobile preview"><Smartphone size={15} /></button>
          </div>
        </div>
      </div>

      <div className="portal-surface-tabs" role="tablist">
        {SURFACES.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={surface === item.id} className={surface === item.id ? 'active' : ''} onClick={() => setSurface(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="portal-surface-context">
        <div><strong>{surfaceMeta.label}</strong><span>{surfaceMeta.description}. Changes here do not alter the other two pages.</span></div>
        <a className="btn" href={publicPortalUrl(surfaceMeta.path)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open page</a>
      </div>

      <div className="portal-editor-grid">
        <div className="portal-editor-controls">
          <div className="portal-control-section">
            <div className="portal-control-title">Layout and theme</div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="portal-layout">Layout</label>
                <select id="portal-layout" value={page.layout} disabled={disabled} onChange={(event) => setPageField('layout', event.target.value as AccountPortalPage['layout'])}>
                  <option value="split">Split showcase</option>
                  <option value="centered">Centered form</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="portal-density">Density</label>
                <select id="portal-density" value={value.theme.density} disabled={disabled} onChange={(event) => onChange({ ...value, theme: { ...value.theme, density: event.target.value as AccountPortalExperience['theme']['density'] } })}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="portal-radius">Corner style</label>
              <select id="portal-radius" value={value.theme.radius} disabled={disabled} onChange={(event) => onChange({ ...value, theme: { ...value.theme, radius: event.target.value as AccountPortalExperience['theme']['radius'] } })}>
                <option value="compact">Compact</option><option value="standard">Standard</option><option value="soft">Soft</option>
              </select>
            </div>
            <div className="portal-color-grid">
              <ColorInput label="Brand" value={value.theme.primaryColor} disabled={disabled} onChange={(primaryColor) => onChange({ ...value, theme: { ...value.theme, primaryColor } })} />
              <ColorInput label="Accent" value={value.theme.accentColor} disabled={disabled} onChange={(accentColor) => onChange({ ...value, theme: { ...value.theme, accentColor } })} />
              <ColorInput label="Page" value={value.theme.pageBackground} disabled={disabled} onChange={(pageBackground) => onChange({ ...value, theme: { ...value.theme, pageBackground } })} />
              <ColorInput label="Panel" value={value.theme.panelBackground} disabled={disabled} onChange={(panelBackground) => onChange({ ...value, theme: { ...value.theme, panelBackground } })} />
              <ColorInput label="Text" value={value.theme.textColor} disabled={disabled} onChange={(textColor) => onChange({ ...value, theme: { ...value.theme, textColor } })} />
              <ColorInput label="Muted text" value={value.theme.mutedTextColor} disabled={disabled} onChange={(mutedTextColor) => onChange({ ...value, theme: { ...value.theme, mutedTextColor } })} />
            </div>
          </div>

          <div className="portal-control-section">
            <div className="portal-control-title">Page copy</div>
            <div className="field-row">
              <TextField label="Brand title" value={page.heroBrandTitle} disabled={disabled} maxLength={64} onChange={(heroBrandTitle) => setPageField('heroBrandTitle', heroBrandTitle)} />
              <TextField label="Brand subtitle" value={page.heroBrandSubtitle} disabled={disabled} maxLength={48} onChange={(heroBrandSubtitle) => setPageField('heroBrandSubtitle', heroBrandSubtitle)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-form-brand-${surface}`}>Form branding</label>
                <select id={`portal-form-brand-${surface}`} value={page.formBrandMode} disabled={disabled} onChange={(event) => setPageField('formBrandMode', event.target.value as AccountPortalPage['formBrandMode'])}>
                  <option value="full">Logo and name</option><option value="logo">Logo only</option><option value="hidden">Hidden</option>
                </select>
              </div>
              <div className="field portal-toggle-stack">
                <label><input type="checkbox" checked={page.showHeroLogo} disabled={disabled} onChange={(event) => setPageField('showHeroLogo', event.target.checked)} /> Show hero logo</label>
                <label><input type="checkbox" checked={page.showHeroBadge} disabled={disabled} onChange={(event) => setPageField('showHeroBadge', event.target.checked)} /> Show fallback badge</label>
                <label><input type="checkbox" checked={page.showHeroBrandText} disabled={disabled} onChange={(event) => setPageField('showHeroBrandText', event.target.checked)} /> Show brand title</label>
                <label><input type="checkbox" checked={page.showEyebrow} disabled={disabled} onChange={(event) => setPageField('showEyebrow', event.target.checked)} /> Show eyebrow</label>
                <label><input type="checkbox" checked={page.showHeroHeadline} disabled={disabled} onChange={(event) => setPageField('showHeroHeadline', event.target.checked)} /> Show headline</label>
                <label><input type="checkbox" checked={page.showHeroDescription} disabled={disabled} onChange={(event) => setPageField('showHeroDescription', event.target.checked)} /> Show hero description</label>
                <label><input type="checkbox" checked={page.showFormDescription} disabled={disabled} onChange={(event) => setPageField('showFormDescription', event.target.checked)} /> Show form description</label>
                <label><input type="checkbox" checked={page.showFooter} disabled={disabled} onChange={(event) => setPageField('showFooter', event.target.checked)} /> Show footer</label>
                <label><input type="checkbox" checked={page.footerShowYear} disabled={disabled} onChange={(event) => setPageField('footerShowYear', event.target.checked)} /> Show footer year</label>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-brand-alignment-${surface}`}>Hero brand alignment</label>
                <select id={`portal-brand-alignment-${surface}`} value={page.heroBrandAlignment} disabled={disabled} onChange={(event) => setPageField('heroBrandAlignment', event.target.value as AccountPortalPage['heroBrandAlignment'])}>
                  <option value="left">Left</option><option value="center">Centered</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-logo-size-${surface}`}>Hero logo size</label>
                <select id={`portal-logo-size-${surface}`} value={page.heroLogoSize} disabled={disabled} onChange={(event) => setPageField('heroLogoSize', event.target.value as AccountPortalPage['heroLogoSize'])}>
                  <option value="standard">Standard</option><option value="large">Large</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-hero-width-${surface}`}>Hero panel width</label>
                <select id={`portal-hero-width-${surface}`} value={page.heroPanelWidth} disabled={disabled} onChange={(event) => setPageField('heroPanelWidth', event.target.value as AccountPortalPage['heroPanelWidth'])}>
                  <option value="narrow">Narrow</option><option value="balanced">Balanced</option><option value="wide">Wide</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-brand-size-${surface}`}>Hero brand text</label>
                <select id={`portal-brand-size-${surface}`} value={page.heroBrandSize} disabled={disabled} onChange={(event) => setPageField('heroBrandSize', event.target.value as AccountPortalPage['heroBrandSize'])}>
                  <option value="standard">Standard</option><option value="large">Large</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-hero-logo-surface-${surface}`}>Hero logo contrast</label>
                <select id={`portal-hero-logo-surface-${surface}`} value={page.heroLogoSurface} disabled={disabled} onChange={(event) => setPageField('heroLogoSurface', event.target.value as AccountPortalPage['heroLogoSurface'])}>
                  <option value="auto">Automatic for background</option><option value="light">Logo for light background</option><option value="dark">Logo for dark background</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-form-logo-surface-${surface}`}>Form logo contrast</label>
                <select id={`portal-form-logo-surface-${surface}`} value={page.formLogoSurface} disabled={disabled} onChange={(event) => setPageField('formLogoSurface', event.target.value as AccountPortalPage['formLogoSurface'])}>
                  <option value="auto">Automatic for background</option><option value="light">Logo for light background</option><option value="dark">Logo for dark background</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-benefits-placement-${surface}`}>Benefit card placement</label>
                <select id={`portal-benefits-placement-${surface}`} value={page.benefitsPlacement} disabled={disabled} onChange={(event) => setPageField('benefitsPlacement', event.target.value as AccountPortalPage['benefitsPlacement'])}>
                  <option value="flow">Below intro</option><option value="lower">Lower in hero</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`portal-primary-button-${surface}`}>Primary button</label>
              <select id={`portal-primary-button-${surface}`} value={page.primaryButtonStyle} disabled={disabled} onChange={(event) => setPageField('primaryButtonStyle', event.target.value as AccountPortalPage['primaryButtonStyle'])}>
                <option value="solid">Solid brand color</option><option value="gradient">Brand gradient</option>
              </select>
            </div>
            <div className="portal-control-title portal-trust-title">Position and fit</div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-vertical-alignment-${surface}`}>Hero content position</label>
                <select id={`portal-vertical-alignment-${surface}`} value={page.heroVerticalAlignment} disabled={disabled} onChange={(event) => setPageField('heroVerticalAlignment', event.target.value as AccountPortalPage['heroVerticalAlignment'])}>
                  <option value="top">Top</option><option value="center">Centered</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-hero-padding-${surface}`}>Hero inner spacing</label>
                <select id={`portal-hero-padding-${surface}`} value={page.heroPadding} disabled={disabled} onChange={(event) => setPageField('heroPadding', event.target.value as AccountPortalPage['heroPadding'])}>
                  <option value="compact">Compact</option><option value="standard">Standard</option><option value="spacious">Spacious</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-content-gap-${surface}`}>Intro to benefits gap</label>
                <select id={`portal-content-gap-${surface}`} value={page.heroContentGap} disabled={disabled} onChange={(event) => setPageField('heroContentGap', event.target.value as AccountPortalPage['heroContentGap'])}>
                  <option value="tight">Tight</option><option value="standard">Standard</option><option value="open">Open</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-benefit-density-${surface}`}>Benefit row density</label>
                <select id={`portal-benefit-density-${surface}`} value={page.benefitDensity} disabled={disabled} onChange={(event) => setPageField('benefitDensity', event.target.value as AccountPortalPage['benefitDensity'])}>
                  <option value="compact">Compact</option><option value="standard">Standard</option>
                </select>
              </div>
              <div className="field portal-toggle-stack portal-fit-toggle">
                <label><input type="checkbox" checked={page.desktopFit} disabled={disabled} onChange={(event) => setPageField('desktopFit', event.target.checked)} /> Fit desktop page without scrolling</label>
                <small>Mobile stays naturally scrollable.</small>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-footer-placement-${surface}`}>Footer location</label>
                <select id={`portal-footer-placement-${surface}`} value={page.footerPlacement} disabled={disabled} onChange={(event) => setPageField('footerPlacement', event.target.value as AccountPortalPage['footerPlacement'])}>
                  <option value="form">Inside form panel</option><option value="page">Below the complete page</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-footer-alignment-${surface}`}>Footer alignment</label>
                <select id={`portal-footer-alignment-${surface}`} value={page.footerAlignment} disabled={disabled} onChange={(event) => setPageField('footerAlignment', event.target.value as AccountPortalPage['footerAlignment'])}>
                  <option value="left">Left</option><option value="center">Centered</option><option value="right">Right</option>
                </select>
              </div>
            </div>
            <div className="portal-control-title portal-control-title-row portal-trust-title">
              <span>Hero background</span>
              <label className="portal-inline-check"><input type="checkbox" checked={page.panelGradientEnabled} disabled={disabled} onChange={(event) => setPageField('panelGradientEnabled', event.target.checked)} /> Gradient</label>
            </div>
            <div className="portal-color-grid">
              <ColorInput label="Gradient start" value={page.panelGradientFrom} disabled={disabled} onChange={(panelGradientFrom) => setPageField('panelGradientFrom', panelGradientFrom)} />
              <ColorInput label="Gradient end" value={page.panelGradientTo} disabled={disabled} onChange={(panelGradientTo) => setPageField('panelGradientTo', panelGradientTo)} />
            </div>
            <div className="field">
              <label htmlFor={`portal-gradient-angle-${surface}`}>Gradient angle ({page.panelGradientAngle} degrees)</label>
              <input id={`portal-gradient-angle-${surface}`} type="range" min="0" max="360" value={page.panelGradientAngle} disabled={disabled} onChange={(event) => setPageField('panelGradientAngle', Number(event.target.value))} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={`portal-hero-pattern-${surface}`}>Hero pattern</label>
                <select id={`portal-hero-pattern-${surface}`} value={page.heroPattern} disabled={disabled} onChange={(event) => setPageField('heroPattern', event.target.value as AccountPortalPage['heroPattern'])}>
                  <option value="grid">Grid</option><option value="none">None</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor={`portal-pattern-opacity-${surface}`}>Pattern opacity ({page.heroPatternOpacity}%)</label>
                <input id={`portal-pattern-opacity-${surface}`} type="range" min="0" max="30" value={page.heroPatternOpacity} disabled={disabled} onChange={(event) => setPageField('heroPatternOpacity', Number(event.target.value))} />
              </div>
            </div>
            <TextField label="Eyebrow" value={page.eyebrow} disabled={disabled} maxLength={48} onChange={(eyebrow) => setPageField('eyebrow', eyebrow)} />
            <TextField label="Hero headline" value={page.headline} disabled={disabled} maxLength={120} onChange={(headline) => setPageField('headline', headline)} />
            <TextArea label="Hero description" value={page.description} disabled={disabled} maxLength={260} onChange={(description) => setPageField('description', description)} />
            <div className="field-row">
              <TextField label="Form title" value={page.formTitle} disabled={disabled} maxLength={64} onChange={(formTitle) => setPageField('formTitle', formTitle)} />
              <TextField label="Primary button" value={page.primaryActionLabel} disabled={disabled} maxLength={40} onChange={(primaryActionLabel) => setPageField('primaryActionLabel', primaryActionLabel)} />
            </div>
            {surface === 'requestAccess' ? (
              <div className="field-row">
                <TextField label="Success title" value={value.requestAccess.successTitle} disabled={disabled} maxLength={80} onChange={(successTitle) => onChange({ ...value, requestAccess: { ...value.requestAccess, successTitle } })} />
                <TextArea label="Success message" value={value.requestAccess.successMessage} disabled={disabled} maxLength={260} onChange={(successMessage) => onChange({ ...value, requestAccess: { ...value.requestAccess, successMessage } })} />
              </div>
            ) : null}
            <TextArea label="Form description" value={page.formDescription} disabled={disabled} maxLength={180} onChange={(formDescription) => setPageField('formDescription', formDescription)} />
            <TextField label="Footer text" value={page.footerText} disabled={disabled} maxLength={120} onChange={(footerText) => setPageField('footerText', footerText)} />
            <div className="field-row">
              <TextField label="Secondary action" value={page.secondaryActionLabel} disabled={disabled} maxLength={40} onChange={(secondaryActionLabel) => setPageField('secondaryActionLabel', secondaryActionLabel)} />
              <TextField label="Tertiary action" value={page.tertiaryActionLabel} disabled={disabled} maxLength={40} onChange={(tertiaryActionLabel) => setPageField('tertiaryActionLabel', tertiaryActionLabel)} />
            </div>
          </div>

          {surface === 'requestAccess' ? (
            <div className="portal-control-section">
              <div className="portal-control-title">B2B request form</div>
              <label className="portal-inline-check"><input type="checkbox" checked={value.requestAccess.notice.enabled} disabled={disabled} onChange={(event) => onChange({ ...value, requestAccess: { ...value.requestAccess, notice: { ...value.requestAccess.notice, enabled: event.target.checked } } })} /> Show existing-customer notice</label>
              <TextArea label="Notice text" value={value.requestAccess.notice.text} disabled={disabled} maxLength={300} onChange={(text) => onChange({ ...value, requestAccess: { ...value.requestAccess, notice: { ...value.requestAccess.notice, text } } })} />
              <div className="portal-color-grid">
                <ColorInput label="Notice background" value={value.requestAccess.notice.backgroundColor} disabled={disabled} onChange={(backgroundColor) => onChange({ ...value, requestAccess: { ...value.requestAccess, notice: { ...value.requestAccess.notice, backgroundColor } } })} />
                <ColorInput label="Notice border" value={value.requestAccess.notice.borderColor} disabled={disabled} onChange={(borderColor) => onChange({ ...value, requestAccess: { ...value.requestAccess, notice: { ...value.requestAccess.notice, borderColor } } })} />
                <ColorInput label="Notice text" value={value.requestAccess.notice.textColor} disabled={disabled} onChange={(textColor) => onChange({ ...value, requestAccess: { ...value.requestAccess, notice: { ...value.requestAccess.notice, textColor } } })} />
              </div>
              <TextArea label="Industries (one per line)" value={value.requestAccess.industries.join('\n')} disabled={disabled} maxLength={1200} onChange={(next) => onChange({ ...value, requestAccess: { ...value.requestAccess, industries: lines(next) } })} />
              <TextArea label="Monthly volume choices (one per line)" value={value.requestAccess.volumeOptions.join('\n')} disabled={disabled} maxLength={800} onChange={(next) => onChange({ ...value, requestAccess: { ...value.requestAccess, volumeOptions: lines(next) } })} />
              <div className="field-row">
                <TextField label="Success email hint" value={value.requestAccess.successEmailHintPrefix} disabled={disabled} maxLength={140} onChange={(successEmailHintPrefix) => onChange({ ...value, requestAccess: { ...value.requestAccess, successEmailHintPrefix } })} />
                <TextField label="Success back action" value={value.requestAccess.successBackActionLabel} disabled={disabled} maxLength={40} onChange={(successBackActionLabel) => onChange({ ...value, requestAccess: { ...value.requestAccess, successBackActionLabel } })} />
              </div>
              <div className="field-row">
                <div className="field"><label htmlFor="portal-success-icon">Success icon</label><select id="portal-success-icon" value={value.requestAccess.successIcon} disabled={disabled} onChange={(event) => onChange({ ...value, requestAccess: { ...value.requestAccess, successIcon: event.target.value as AccountPortalIcon } })}>{ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon.replace(/-/g, ' ')}</option>)}</select></div>
                <TextField label="Submitting label" value={value.requestAccess.submittingActionLabel} disabled={disabled} maxLength={60} onChange={(submittingActionLabel) => onChange({ ...value, requestAccess: { ...value.requestAccess, submittingActionLabel } })} />
              </div>
              <div className="field-row">
                <TextField label="Existing account prompt" value={value.requestAccess.existingAccountPrompt} disabled={disabled} maxLength={140} onChange={(existingAccountPrompt) => onChange({ ...value, requestAccess: { ...value.requestAccess, existingAccountPrompt } })} />
                <TextField label="Locked email hint" value={value.requestAccess.lockedEmailHint} disabled={disabled} maxLength={180} onChange={(lockedEmailHint) => onChange({ ...value, requestAccess: { ...value.requestAccess, lockedEmailHint } })} />
              </div>
              <div className="field-row">
                <TextField label="Certificate expiry warning" value={value.requestAccess.certificateExpiringMessage} disabled={disabled} maxLength={300} onChange={(certificateExpiringMessage) => onChange({ ...value, requestAccess: { ...value.requestAccess, certificateExpiringMessage } })} />
                <div className="field portal-toggle-stack"><label><input type="checkbox" checked={value.requestAccess.showSuccessEmailHint} disabled={disabled} onChange={(event) => onChange({ ...value, requestAccess: { ...value.requestAccess, showSuccessEmailHint: event.target.checked } })} /> Show success email hint</label></div>
              </div>
              <div className="portal-control-title portal-trust-title">Form fields</div>
              <div className="portal-request-field-editor-list">
                {value.requestAccess.formFields.map((field, index) => (
                  <div className="portal-request-field-editor" key={field.key}>
                    <input value={field.label} maxLength={80} disabled={disabled} aria-label={`${field.key} label`} onChange={(event) => updateRequestField(index, { label: event.target.value })} />
                    <code>{field.key}</code>
                    <label><input type="checkbox" checked={field.visible !== false} disabled={disabled} onChange={(event) => updateRequestField(index, { visible: event.target.checked })} /> Show</label>
                    <label><input type="checkbox" checked={Boolean(field.required)} disabled={disabled} onChange={(event) => updateRequestField(index, { required: event.target.checked })} /> Required</label>
                    <label><input type="checkbox" checked={Boolean(field.half)} disabled={disabled} onChange={(event) => updateRequestField(index, { half: event.target.checked })} /> Half row</label>
                    <input value={field.placeholder} maxLength={160} disabled={disabled} aria-label={`${field.key} placeholder`} placeholder="Placeholder" onChange={(event) => updateRequestField(index, { placeholder: event.target.value })} />
                    {field.type === 'select' ? <input value={field.selectPlaceholder ?? ''} maxLength={160} disabled={disabled} aria-label={`${field.key} select placeholder`} placeholder="Empty select label" onChange={(event) => updateRequestField(index, { selectPlaceholder: event.target.value })} /> : null}
                    <input value={field.helpText ?? ''} maxLength={240} disabled={disabled} aria-label={`${field.key} help text`} placeholder="Optional help text" onChange={(event) => updateRequestField(index, { helpText: event.target.value })} />
                    <button type="button" className="icon-btn" disabled={disabled || index === 0} onClick={() => moveRequestField(index, -1)} title="Move field up"><ChevronUp size={14} /></button>
                    <button type="button" className="icon-btn" disabled={disabled || index === value.requestAccess.formFields.length - 1} onClick={() => moveRequestField(index, 1)} title="Move field down"><ChevronDown size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="portal-control-section">
            <div className="portal-control-title portal-control-title-row">
              <span>Benefit cards</span>
              <label className="portal-inline-check"><input type="checkbox" checked={page.showBenefits} disabled={disabled} onChange={(event) => setPageField('showBenefits', event.target.checked)} /> Show</label>
            </div>
            <div className="portal-benefit-editor-list">
              {page.benefits.map((benefit, index) => (
                <div className="portal-benefit-editor" key={`${index}-${benefit.title}`}>
                  <select aria-label={`Benefit ${index + 1} icon`} value={benefit.icon} disabled={disabled} onChange={(event) => updateBenefit(index, { ...benefit, icon: event.target.value as AccountPortalIcon })}>
                    {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon.replace(/-/g, ' ')}</option>)}
                  </select>
                  <input aria-label={`Benefit ${index + 1} title`} value={benefit.title} maxLength={48} disabled={disabled} onChange={(event) => updateBenefit(index, { ...benefit, title: event.target.value })} />
                  <input aria-label={`Benefit ${index + 1} description`} value={benefit.body} maxLength={140} disabled={disabled} onChange={(event) => updateBenefit(index, { ...benefit, body: event.target.value })} />
                  <select aria-label={`Benefit ${index + 1} tone`} value={benefit.tone} disabled={disabled} onChange={(event) => updateBenefit(index, { ...benefit, tone: event.target.value as AccountPortalBenefit['tone'] })}>
                    <option value="blue">Blue</option><option value="green">Green</option><option value="amber">Amber</option><option value="neutral">Neutral</option>
                  </select>
                  <div className="portal-benefit-actions">
                    <button type="button" className="icon-btn" disabled={disabled || index === 0} onClick={() => moveBenefit(index, -1)} title="Move up"><ChevronUp size={14} /></button>
                    <button type="button" className="icon-btn" disabled={disabled || index === page.benefits.length - 1} onClick={() => moveBenefit(index, 1)} title="Move down"><ChevronDown size={14} /></button>
                    <button type="button" className="icon-btn danger" disabled={disabled} onClick={() => setPageField('benefits', page.benefits.filter((_, benefitIndex) => benefitIndex !== index))} title="Remove benefit"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn portal-add-benefit" disabled={disabled || page.benefits.length >= 8} onClick={addBenefit}><Plus size={14} /> Add benefit</button>

            <div className="portal-control-title portal-control-title-row portal-trust-title">
              <span>Trust strip</span>
              <label className="portal-inline-check"><input type="checkbox" checked={page.showTrustItems} disabled={disabled} onChange={(event) => setPageField('showTrustItems', event.target.checked)} /> Show</label>
            </div>
            <div className="portal-trust-editor-list">
              {page.trustItems.map((item, index) => (
                <div className="portal-trust-editor" key={`${index}-${item.label}`}>
                  <select aria-label={`Trust item ${index + 1} icon`} value={item.icon} disabled={disabled} onChange={(event) => {
                    const trustItems = [...page.trustItems];
                    trustItems[index] = { ...item, icon: event.target.value as AccountPortalIcon };
                    setPageField('trustItems', trustItems);
                  }}>
                    {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon.replace(/-/g, ' ')}</option>)}
                  </select>
                  <input aria-label={`Trust item ${index + 1} label`} value={item.label} maxLength={40} disabled={disabled} onChange={(event) => {
                    const trustItems = [...page.trustItems];
                    trustItems[index] = { ...item, label: event.target.value };
                    setPageField('trustItems', trustItems);
                  }} />
                  <button type="button" className="icon-btn danger" disabled={disabled} onClick={() => setPageField('trustItems', page.trustItems.filter((_, trustIndex) => trustIndex !== index))} title="Remove trust item"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn portal-add-benefit" disabled={disabled || page.trustItems.length >= 6} onClick={() => setPageField('trustItems', [...page.trustItems, { icon: 'shield-check', label: 'New trust item' }])}><Plus size={14} /> Add trust item</button>
          </div>
        </div>

        <PortalPreview value={value} page={page} surface={surface} viewport={viewport} workspaceName={workspaceName} brandBadge={brandBadge} brandLogo={brandLogo} brandAssets={brandAssets} />
      </div>
    </section>
  );
}

function PortalPreview({ value, page, surface, viewport, workspaceName, brandBadge, brandLogo, brandAssets }: {
  value: AccountPortalExperience;
  page: AccountPortalPage;
  surface: Surface;
  viewport: 'desktop' | 'mobile';
  workspaceName: string;
  brandBadge: string;
  brandLogo: string;
  brandAssets: BrandAssets;
}) {
  const heroLogo = portalLogo(page.heroLogoSurface, page.panelGradientEnabled ? page.panelGradientFrom : value.theme.primaryColor, brandAssets, brandLogo);
  const formLogo = portalLogo(page.formLogoSurface, value.theme.panelBackground, brandAssets, brandLogo);
  return (
    <div className={`portal-live-preview viewport-${viewport}`} style={{ background: value.theme.pageBackground }}>
      <div className={`portal-preview-stage layout-${page.layout} surface-${surface}${page.desktopFit ? ' portal-preview-desktop-fit' : ''}`}>
        {page.layout === 'split' ? (
          surface === 'requestAccess' ? (
            <RequestAccessPreviewHero page={value.requestAccess} workspaceName={workspaceName} brandBadge={brandBadge} brandLogo={heroLogo} primaryColor={value.theme.primaryColor} />
          ) : (
            <div className={`portal-preview-hero portal-preview-align-${page.heroBrandAlignment} portal-preview-logo-${page.heroLogoSize} portal-preview-brand-${page.heroBrandSize} portal-preview-benefits-${page.benefitsPlacement} portal-preview-vertical-${page.heroVerticalAlignment} portal-preview-padding-${page.heroPadding} portal-preview-gap-${page.heroContentGap} portal-preview-benefit-density-${page.benefitDensity}`} style={{ background: page.panelGradientEnabled ? `linear-gradient(${page.panelGradientAngle}deg, ${page.panelGradientFrom}, ${page.panelGradientTo})` : value.theme.primaryColor }}>
            <div className="portal-preview-brand">
              {page.showHeroLogo && heroLogo ? <img src={heroLogo} alt="" /> : page.showHeroBadge ? <span>{brandBadge.charAt(0)}</span> : null}
              {page.showHeroBrandText ? <strong>{page.heroBrandTitle || workspaceName}<small>{page.heroBrandSubtitle}</small></strong> : null}
            </div>
            <div className="portal-preview-copy">{page.showEyebrow ? <small>{page.eyebrow}</small> : null}{page.showHeroHeadline ? <h4>{page.headline}</h4> : null}{page.showHeroDescription ? <p>{page.description}</p> : null}</div>
            {page.showBenefits ? <div className="portal-preview-benefits">{page.benefits.map((benefit) => { const Icon = ICONS[benefit.icon]; return <div key={`${benefit.title}-${benefit.body}`}><Icon size={15} /><span><b>{benefit.title}</b><small>{benefit.body}</small></span></div>; })}</div> : null}
            {page.showTrustItems ? <div className="portal-preview-trust">{page.trustItems.map((item) => { const Icon = ICONS[item.icon]; return <span key={`${item.icon}-${item.label}`}><Icon size={10} />{item.label}</span>; })}</div> : null}
            </div>
          )
        ) : null}
        {surface === 'requestAccess' ? (
          <RequestAccessPreviewForm page={value.requestAccess} theme={value.theme} />
        ) : (
        <div className="portal-preview-form" style={{ background: value.theme.panelBackground, color: value.theme.textColor }}>
          {page.formBrandMode !== 'hidden' ? <div className="portal-preview-logo">{formLogo ? <img src={formLogo} alt="" /> : brandBadge.charAt(0)}</div> : null}
          <h4>{page.formTitle}</h4>{page.showFormDescription ? <p style={{ color: value.theme.mutedTextColor }}>{page.formDescription}</p> : null}
          <label>Email</label><div className="portal-preview-input">you@company.com</div>
          <label>Password</label><div className="portal-preview-input">••••••••••</div>
          <div className="portal-preview-button" style={{ background: value.theme.primaryColor }}>{page.primaryActionLabel}</div>
          <div className="portal-preview-links">{page.secondaryActionLabel}<span>{page.tertiaryActionLabel}</span></div>
        </div>
        )}
        {page.showFooter && page.footerPlacement === 'form' ? <div className={`portal-preview-footer align-${page.footerAlignment}`}>&copy; {page.footerShowYear ? `${new Date().getFullYear()} ` : ''}{workspaceName}. {page.footerText}</div> : null}
      </div>
      {page.showFooter && page.footerPlacement === 'page' ? <div className={`portal-preview-footer page align-${page.footerAlignment}`}>&copy; {page.footerShowYear ? `${new Date().getFullYear()} ` : ''}{workspaceName}. {page.footerText}</div> : null}
    </div>
  );
}

function RequestAccessPreviewHero({ page, workspaceName, brandBadge, brandLogo, primaryColor }: {
  page: AccountPortalExperience['requestAccess'];
  workspaceName: string;
  brandBadge: string;
  brandLogo: string;
  primaryColor: string;
}) {
  const headline = page.heroBrandTitle || (page.headline === 'Partner Program' ? `${workspaceName} Partner Program` : page.headline);
  const background = page.panelGradientEnabled
    ? `linear-gradient(${page.panelGradientAngle}deg, ${page.panelGradientFrom} 0%, ${page.panelGradientTo} 100%)`
    : `linear-gradient(160deg, ${primaryColor} 0%, ${darkenHex(primaryColor, 0.15)} 60%, ${darkenHex(primaryColor, 0.3)} 100%)`;
  return (
    <div className={`portal-preview-hero portal-request-hero portal-preview-align-${page.heroBrandAlignment} portal-preview-logo-${page.heroLogoSize} portal-preview-brand-${page.heroBrandSize} portal-preview-benefits-${page.benefitsPlacement} portal-preview-vertical-${page.heroVerticalAlignment} portal-preview-padding-${page.heroPadding} portal-preview-gap-${page.heroContentGap} portal-preview-benefit-density-${page.benefitDensity}`} style={{ background }}>
      <div className="portal-request-brand">
        {page.showHeroLogo && brandLogo ? <img src={brandLogo} alt="" /> : page.showHeroBadge ? <span>{brandBadge}</span> : null}
        {page.showHeroBrandText ? <strong>{page.heroBrandTitle || workspaceName}<small>{page.heroBrandSubtitle}</small></strong> : null}
      </div>
      <div className="portal-request-copy">
        {page.showEyebrow && page.eyebrow ? <small>{page.eyebrow}</small> : null}
        {page.showHeroHeadline ? <h4>{headline}</h4> : null}
        {page.showHeroDescription ? <p>{page.description}</p> : null}
      </div>
      {page.showBenefits ? (
        <div className="portal-request-benefits">
          {page.benefits.map((benefit) => {
            const Icon = ICONS[benefit.icon];
            return (
              <div key={`${benefit.title}-${benefit.body}`}>
                <span className="portal-request-benefit-icon"><Icon size={17} /></span>
                <span><b>{benefit.title}</b><small>{benefit.body}</small></span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RequestAccessPreviewForm({ page, theme }: {
  page: AccountPortalExperience['requestAccess'];
  theme: AccountPortalExperience['theme'];
}) {
  return (
    <div className="portal-preview-form portal-request-form" style={{ background: `linear-gradient(135deg, ${theme.panelBackground}, #F6F8FC)`, color: theme.textColor }}>
      <h4>{page.formTitle}</h4>
      {page.showFormDescription ? <p style={{ color: theme.mutedTextColor }}>{page.formDescription}</p> : null}
      {page.notice.enabled ? <div className="portal-request-notice" style={{ color: page.notice.textColor, borderColor: page.notice.borderColor, background: page.notice.backgroundColor }}>
        {page.notice.text}
      </div> : null}
      <div className="portal-request-fields">
        {page.formFields.map((field) => (
          <div className={`portal-request-field ${field.half ? 'half' : 'full'} kind-${field.type}`} key={field.key}>
            <label>{field.label}{field.required ? <span> *</span> : null}</label>
            <div className="portal-request-input" style={{ color: theme.mutedTextColor }}>
              {field.type === 'password' ? '********' : field.placeholder}
            </div>
            {field.type === 'file' ? <small style={{ color: theme.mutedTextColor }}>PDF, JPEG, PNG or WebP (max 10MB)</small> : null}
          </div>
        ))}
      </div>
      <div className="portal-preview-button" style={{ background: page.primaryButtonStyle === 'gradient' ? `linear-gradient(135deg, ${theme.primaryColor}, ${darkenHex(theme.primaryColor, 0.15)})` : theme.primaryColor }}>{page.primaryActionLabel}</div>
      <div className="portal-request-signin" style={{ color: theme.mutedTextColor }}>Already have an account? <strong style={{ color: theme.primaryColor }}>{page.secondaryActionLabel}</strong></div>
    </div>
  );
}

function darkenHex(hex: string, amount: number) {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => Math.max(0, Math.round(Number.parseInt(normalized.slice(offset, offset + 2), 16) * (1 - amount))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function portalLogo(
  preference: AccountPortalPage['heroLogoSurface'],
  background: string,
  brandAssets: BrandAssets,
  fallback: string,
) {
  const surface = preference === 'auto' ? (isLightHex(background) ? 'light' : 'dark') : preference;
  return resolveBrandLogoUrl(brandAssets, fallback, surface);
}

function isLightHex(hex: string) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return true;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 180;
}

function ColorInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (next: string) => void; disabled: boolean }) {
  return <label className="portal-color-input"><span>{label}</span><input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.toUpperCase())} /><code>{value}</code></label>;
}

function TextField({ label, value, onChange, disabled, maxLength }: { label: string; value: string; onChange: (next: string) => void; disabled: boolean; maxLength: number }) {
  return <div className="field"><label>{label}</label><input value={value} maxLength={maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function TextArea({ label, value, onChange, disabled, maxLength }: { label: string; value: string; onChange: (next: string) => void; disabled: boolean; maxLength: number }) {
  return <div className="field"><label>{label}</label><textarea rows={2} value={value} maxLength={maxLength} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function publicPortalUrl(path: string) {
  if (typeof window === 'undefined') return path;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return path;
  const host = window.location.hostname.startsWith('app.')
    ? `accounts.${window.location.hostname.slice(4)}`
    : window.location.hostname;
  return `${window.location.protocol}//${host}${path}`;
}
