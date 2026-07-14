import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  BadgeDollarSign,
  CalendarClock,
  CircleCheck,
  Headphones,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  ACCOUNT_PORTAL_REQUEST_FIELDS,
  type AccountPortalRequestField,
} from '@factory-engine-pro/contracts';
import { accountsApi, apiErrorMessage } from '@/lib/api';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

interface BenefitConfig {
  icon: string;
  title: string;
  description: string;
}

const BENEFIT_ICONS: Record<string, LucideIcon> = {
  '$': BadgeDollarSign,
  NET: CalendarClock,
  TEAM: Users,
  VIP: Headphones,
  SHIP: Truck,
  'badge-check': CircleCheck,
  'calendar-clock': CalendarClock,
  headphones: Headphones,
  'package-check': BadgeDollarSign,
  'shield-check': CircleCheck,
  truck: Truck,
  users: Users,
};

interface RequestPageConfig {
  title: string;
  subtitle: string;
  heroTitle: string;
  heroSubtitle: string;
  showHeroLogo: boolean;
  showHeroBadge: boolean;
  showFormDescription: boolean;
  primaryColor: string;
  primaryGradientEnabled?: boolean;
  primaryGradientFrom?: string;
  primaryGradientTo?: string;
  primaryGradientAngle?: number;
  fontColor: string;
  formPanelMode: string;
  formPanelBackgroundType: string;
  formPanelBackgroundPreset: string;
  formPanelBackgroundColor: string;
  formPanelGradientFrom: string;
  formPanelGradientTo: string;
  formPanelGradientAngle: number;
  formPanelPattern: string;
  formPanelTextColor: string;
  formPanelMutedTextColor: string;
  formPanelInputBackgroundColor: string;
  formPanelInputTextColor: string;
  formPanelInputBorderColor: string;
  formPanelBorderColor: string;
  boxShadow: boolean;
  benefits: BenefitConfig[];
  industries: string[];
  volumeOptions: string[];
  formFields: AccountPortalRequestField[];
  notice: {
    enabled: boolean;
    text: string;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
  };
  successTitle: string;
  successMessage: string;
}

const DEFAULT_REQUEST_PAGE_CONFIG: RequestPageConfig = {
  title: 'Request B2B Access',
  subtitle: 'Tell us about your business to get started',
  heroTitle: '',
  heroSubtitle: '',
  showHeroLogo: true,
  showHeroBadge: true,
  showFormDescription: true,
  primaryColor: '#081F6F',
  primaryGradientEnabled: false,
  primaryGradientFrom: '#081F6F',
  primaryGradientTo: '#F8FBFF',
  primaryGradientAngle: 160,
  fontColor: '#2c3e50',
  formPanelMode: 'standard',
  formPanelBackgroundType: 'gradient',
  formPanelBackgroundPreset: 'pearl',
  formPanelBackgroundColor: '#FFFFFF',
  formPanelGradientFrom: '#FFFFFF',
  formPanelGradientTo: '#F6F8FC',
  formPanelGradientAngle: 135,
  formPanelPattern: 'none',
  formPanelTextColor: '#172033',
  formPanelMutedTextColor: '#667085',
  formPanelInputBackgroundColor: '#FFFFFF',
  formPanelInputTextColor: '#172033',
  formPanelInputBorderColor: '#D4E3ED',
  formPanelBorderColor: '#E3E8F0',
  boxShadow: true,
  benefits: [
    { icon: '$', title: 'Wholesale Pricing', description: 'Up to 40% off retail prices' },
    { icon: 'NET', title: 'Net 30 Terms', description: 'Flexible payment options' },
    { icon: 'TEAM', title: 'Team Management', description: 'Add unlimited team members' },
    { icon: 'VIP', title: 'Priority Support', description: 'Dedicated account manager' },
    { icon: 'SHIP', title: 'Free Shipping', description: 'On orders over $500' },
  ],
  industries: [
    'Apparel & Fashion',
    'Promotional Products',
    'Sports & Athletics',
    'Corporate Branding',
    'Screen Printing Shop',
    'Embroidery Business',
    'Sign & Banner Shop',
    'Reseller/Distributor',
    'Other',
  ],
  volumeOptions: [
    'Just starting out',
    '100-500 transfers/month',
    '500-1000 transfers/month',
    '1000-5000 transfers/month',
    '5000+ transfers/month',
  ],
  formFields: ACCOUNT_PORTAL_REQUEST_FIELDS.map((field) => ({ ...field })),
  notice: {
    enabled: true,
    text: 'If you already have a storefront account, use the same email address here.',
    backgroundColor: '#EEF4FF',
    borderColor: '#AFC6F8',
    textColor: '#344054',
  },
  successTitle: 'Application Submitted!',
  successMessage:
    'Thank you for your interest! Our team will review your application and get back to you within 1-2 business days.',
};

const STATIC_COLORS = {
  textSecondary: '#6b7c93',
  textMuted: '#94a3b8',
  card: '#ffffff',
  input: '#f7fafc',
  inputBorder: '#d4e3ed',
  red: '#e74c3c',
  green: '#27ae60',
};

const KNOWN_REQUEST_KEYS = new Set([
  'email',
  'firstName',
  'lastName',
  'phone',
  'companyName',
  'legalName',
  'website',
  'industry',
  'estimatedMonthlyVolume',
  'message',
  'password',
  'confirmPassword',
  'taxCertificate',
  'taxCertificateExpiresAt',
]);

const DEFAULT_PRIMARY_COLOR = '#081F6F';
const DEFAULT_GRADIENT_TO = '#F8FBFF';

function RequestInvitationView() {
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const logoUrl = brandQuery.data?.brandAssets?.primaryLogoUrl || brandQuery.data?.brandLogo || '';
  const search = useMemo(() => currentSearchParams(), []);
  const shop = normalizeShopDomain(search.get('shop') || search.get('store') || '');
  const merchantHint = (search.get('merchantId') || search.get('merchant_id') || '').trim();
  const emailFromUrl = (search.get('email') || '').trim();
  const emailLocked = emailFromUrl.length > 0;
  const portalExperience = brandQuery.data?.accountPortalExperience;
  const requestExperience = portalExperience?.requestAccess;
  const pageConfig = useMemo<RequestPageConfig>(() => ({
    ...DEFAULT_REQUEST_PAGE_CONFIG,
    title: requestExperience?.formTitle ?? DEFAULT_REQUEST_PAGE_CONFIG.title,
    subtitle: requestExperience?.formDescription ?? DEFAULT_REQUEST_PAGE_CONFIG.subtitle,
    heroTitle: requestExperience?.heroBrandTitle || (requestExperience
      ? (requestExperience.headline === 'Partner Program' ? `${brandName} Partner Program` : requestExperience.headline)
      : ''),
    heroSubtitle: requestExperience?.heroBrandSubtitle || requestExperience?.description || DEFAULT_REQUEST_PAGE_CONFIG.heroSubtitle,
    showHeroLogo: requestExperience?.showHeroLogo ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroLogo,
    showHeroBadge: requestExperience?.showHeroBadge ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroBadge,
    showFormDescription: requestExperience?.showFormDescription ?? DEFAULT_REQUEST_PAGE_CONFIG.showFormDescription,
    primaryColor: portalExperience?.theme.primaryColor ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryColor,
    primaryGradientEnabled: requestExperience?.panelGradientEnabled ?? false,
    primaryGradientFrom: requestExperience?.panelGradientFrom ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryGradientFrom,
    primaryGradientTo: requestExperience?.panelGradientTo ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryGradientTo,
    primaryGradientAngle: requestExperience?.panelGradientAngle ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryGradientAngle,
    fontColor: portalExperience?.theme.textColor ?? DEFAULT_REQUEST_PAGE_CONFIG.fontColor,
    formPanelBackgroundColor: portalExperience?.theme.panelBackground ?? DEFAULT_REQUEST_PAGE_CONFIG.formPanelBackgroundColor,
    formPanelGradientFrom: portalExperience?.theme.panelBackground ?? DEFAULT_REQUEST_PAGE_CONFIG.formPanelGradientFrom,
    formPanelTextColor: portalExperience?.theme.textColor ?? DEFAULT_REQUEST_PAGE_CONFIG.formPanelTextColor,
    formPanelMutedTextColor: portalExperience?.theme.mutedTextColor ?? DEFAULT_REQUEST_PAGE_CONFIG.formPanelMutedTextColor,
    benefits: requestExperience?.showBenefits
      ? requestExperience.benefits.map((benefit) => ({ icon: benefit.icon, title: benefit.title, description: benefit.body }))
      : [],
    industries: requestExperience?.industries ?? DEFAULT_REQUEST_PAGE_CONFIG.industries,
    volumeOptions: requestExperience?.volumeOptions ?? DEFAULT_REQUEST_PAGE_CONFIG.volumeOptions,
    formFields: requestExperience?.formFields ?? DEFAULT_REQUEST_PAGE_CONFIG.formFields,
    notice: requestExperience?.notice ?? DEFAULT_REQUEST_PAGE_CONFIG.notice,
    successTitle: requestExperience?.successTitle ?? DEFAULT_REQUEST_PAGE_CONFIG.successTitle,
    successMessage: requestExperience?.successMessage ?? DEFAULT_REQUEST_PAGE_CONFIG.successMessage,
  }), [brandName, portalExperience, requestExperience]);
  const [formData, setFormData] = useState<Record<string, string>>(() => ({
    email: emailFromUrl,
    firstName: (search.get('firstName') || '').trim(),
    lastName: (search.get('lastName') || '').trim(),
    phone: (search.get('phone') || '').trim(),
    companyName: (search.get('companyName') || '').trim(),
    legalName: (search.get('companyName') || '').trim(),
    message: (search.get('message') || '').trim(),
  }));
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const certificateWarning = certificateExpiryWarning(formData.taxCertificateExpiresAt);

  const colors = makeColors(pageConfig.primaryColor || DEFAULT_PRIMARY_COLOR);
  const fontColor = normalizeHexColor(pageConfig.fontColor, '#2c3e50');
  const boxShadowEnabled = pageConfig.boxShadow !== false;
  const heroTitle = pageConfig.heroTitle || `${brandName} Partner Program`;
  const heroSubtitle =
    pageConfig.heroSubtitle ||
    'Join our exclusive B2B network and unlock premium wholesale benefits.';
  const heroBackground = getConfiguredGradient(
    pageConfig,
    `linear-gradient(160deg, ${colors.primary} 0%, ${colors.gradientOne} 60%, ${colors.gradientTwo} 100%)`,
  );
  const actionBackground = getConfiguredGradient(
    pageConfig,
    `linear-gradient(135deg, ${colors.primary}, ${colors.gradientOne})`,
  );
  const formPanelModeSettings = getFormPanelModeSettings(pageConfig.formPanelMode);
  const formPanelBackgroundStyle = getFormPanelBackgroundStyle(pageConfig, colors.primary);
  const formPanelTextColor = normalizeHexColor(pageConfig.formPanelTextColor, fontColor);
  const formPanelMutedTextColor = normalizeHexColor(
    pageConfig.formPanelMutedTextColor,
    STATIC_COLORS.textSecondary,
  );
  const formPanelInputBackgroundColor = normalizeHexColor(
    pageConfig.formPanelInputBackgroundColor,
    STATIC_COLORS.input,
  );
  const formPanelInputTextColor = normalizeHexColor(pageConfig.formPanelInputTextColor, fontColor);
  const formPanelInputBorderColor = normalizeHexColor(
    pageConfig.formPanelInputBorderColor,
    STATIC_COLORS.inputBorder,
  );
  const formPanelBorderColor = normalizeHexColor(pageConfig.formPanelBorderColor, '#E3E8F0');
  const isGlassFormPanel = pageConfig.formPanelMode === 'glass';
  const isOutlinedFormPanel = pageConfig.formPanelMode === 'outlined';

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: formPanelModeSettings.inputPadding,
    border: `1px solid ${formPanelInputBorderColor}`,
    borderRadius: formPanelModeSettings.inputRadius,
    fontSize: 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    color: formPanelInputTextColor,
    background: formPanelInputBackgroundColor,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: formPanelMutedTextColor,
    marginBottom: 6,
  };

  const handleChange = (field: string, value: string) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleFileChange = (field: string, file: File | null) => {
    setFiles((current) => ({
      ...current,
      [field]: file,
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    if ((formData.password || '') !== (formData.confirmPassword || '')) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if ((formData.password || '').length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    const missingFileField = pageConfig.formFields.find((field) => field.required && field.type === 'file' && !files[field.key]);
    if (missingFileField) {
      setError(`${missingFileField.label} is required.`);
      setLoading(false);
      return;
    }

    try {
      const mergedMessage = mergeRequestMessage(pageConfig, formData, files);
      await accountsApi.submitB2BAccessRequest({
        email: valueOf(formData.email),
        firstName: valueOf(formData.firstName),
        lastName: valueOf(formData.lastName),
        companyName: valueOf(formData.companyName),
        legalName: valueOf(formData.legalName),
        password: valueOf(formData.password),
        phone: optionalValue(formData.phone),
        website: optionalValue(formData.website),
        industry: optionalValue(formData.industry),
        estimatedMonthlyVolume: optionalValue(formData.estimatedMonthlyVolume),
        taxCertificateExpiresAt: optionalValue(formData.taxCertificateExpiresAt),
        message: optionalValue(mergedMessage),
        flowIntent: 'request-invitation',
        sourceSurface: (search.get('sourceSurface') || 'accounts-request-invitation').trim(),
        sourcePath: '/request-invitation',
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        formHandle: 'request-invitation',
        formName: pageConfig.title,
        shop: optionalValue(shop),
        shopifyCustomerId: optionalValue(search.get('shopifyCustomerId') || ''),
        merchantContext: optionalValue(merchantHint),
      }, files.taxCertificate ?? undefined);
      setSuccess(true);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: AccountPortalRequestField) => {
    const isRequired = Boolean(field.required);
    const value = formData[field.key] || '';
    const isLockedEmailField = field.key === 'email' && emailLocked;

    if (field.type === 'file') {
      return (
        <div key={field.key}>
          <label style={labelStyle}>
            {field.label}
            {isRequired ? <span style={{ color: STATIC_COLORS.red }}> *</span> : null}
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(inputEvent) => handleFileChange(field.key, inputEvent.target.files?.[0] || null)}
            disabled={loading}
            required={isRequired}
            style={{ ...inputStyle, padding: '8px 12px' }}
          />
          <p style={{ fontSize: 12, color: formPanelMutedTextColor, marginTop: 4, marginBottom: 0 }}>
            PDF, JPEG, PNG or WebP (max 10MB)
          </p>
        </div>
      );
    }

    if (field.type === 'select') {
      const options = getSelectOptions(pageConfig, field.key);
      return (
        <div key={field.key}>
          <label style={labelStyle}>
            {field.label}
            {isRequired ? <span style={{ color: STATIC_COLORS.red }}> *</span> : null}
          </label>
          <select
            value={value}
            onChange={(inputEvent) => handleChange(field.key, inputEvent.target.value)}
            disabled={loading}
            required={isRequired}
            style={inputStyle}
          >
            <option value="">Select {field.label.toLowerCase()}</option>
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={field.key}>
          <label style={labelStyle}>
            {field.label}
            {isRequired ? <span style={{ color: STATIC_COLORS.red }}> *</span> : null}
          </label>
          <textarea
            rows={3}
            value={value}
            onChange={(inputEvent) => handleChange(field.key, inputEvent.target.value)}
            disabled={loading}
            required={isRequired}
            placeholder={getPlaceholder(field)}
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          />
        </div>
      );
    }

    return (
      <div key={field.key}>
        <label style={labelStyle}>
          {field.label}
          {isRequired ? <span style={{ color: STATIC_COLORS.red }}> *</span> : null}
        </label>
        <input
          type={field.type}
          value={value}
          onChange={(inputEvent) => handleChange(field.key, inputEvent.target.value)}
          disabled={loading}
          readOnly={isLockedEmailField}
          required={isRequired}
          minLength={field.key === 'password' || field.key === 'confirmPassword' ? 6 : undefined}
          placeholder={getPlaceholder(field)}
          style={{
            ...inputStyle,
            ...(isLockedEmailField
              ? {
                  opacity: 0.7,
                  cursor: 'not-allowed',
                  background: rgbaFromHex(formPanelInputBorderColor, 0.22, '#D4E3ED'),
                }
              : {}),
          }}
        />
        {isLockedEmailField ? (
          <p style={{ fontSize: 11, color: colors.primary, marginTop: 4, marginBottom: 0 }}>
            Email linked from your storefront session.
          </p>
        ) : null}
        {field.key === 'taxCertificateExpiresAt' && certificateWarning ? (
          <p style={{ fontSize: 12, color: '#B54708', marginTop: 6, marginBottom: 0, lineHeight: 1.45 }}>
            {certificateWarning}
          </p>
        ) : null}
      </div>
    );
  };

  const renderFormFields = () => {
    const rows: ReactNode[] = [];
    const fields = pageConfig.formFields || [];
    let index = 0;
    while (index < fields.length) {
      const current = fields[index];
      const next = fields[index + 1];
      if (current.half && next?.half) {
        rows.push(
          <div
            key={`row-${current.key}-${next.key}`}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: formPanelModeSettings.fieldGap }}
          >
            {renderField(current)}
            {renderField(next)}
          </div>,
        );
        index += 2;
        continue;
      }
      rows.push(renderField(current));
      index += 1;
    }
    return rows;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: portalExperience?.theme.pageBackground ?? `linear-gradient(135deg, #f0f6f9 0%, #e3eef3 50%, ${colors.backgroundLight} 100%)`,
        padding: 20,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ width: '100%', maxWidth: requestExperience?.layout === 'centered' ? 620 : 980, position: 'relative', zIndex: 1 }}>
        <div
          style={{
            background: portalExperience?.theme.panelBackground ?? STATIC_COLORS.card,
            borderRadius: 20,
            overflow: 'hidden',
            boxShadow: boxShadowEnabled
              ? `0 8px 40px ${colors.primaryLight}, 0 2px 8px rgba(0,0,0,0.04)`
              : 'none',
            border: `1px solid ${colors.primaryLight}`,
          }}
        >
          <div style={{ display: 'flex', minHeight: 620 }}>
            {requestExperience?.layout !== 'centered' ? <div
              style={{
                flex: '0 0 38%',
                padding: '44px 32px',
                background: heroBackground,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <div style={{ marginBottom: 36 }}>
                {pageConfig.showHeroLogo && logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={brandName}
                    style={{ maxWidth: 140, maxHeight: 50, objectFit: 'contain', marginBottom: 10 }}
                  />
                ) : pageConfig.showHeroBadge ? (
                  <span style={{ fontSize: 44 }}>{brandBadge}</span>
                ) : null}
                <h3 style={{ fontWeight: 700, marginTop: logoUrl ? 8 : 14, fontSize: 22, lineHeight: 1.3, letterSpacing: -0.3 }}>
                  {heroTitle}
                </h3>
                <p style={{ opacity: 0.8, fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
                  {heroSubtitle}
                </p>
              </div>

              {pageConfig.benefits.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {pageConfig.benefits.map((item) => (
                    <div key={`${item.title}-${item.description}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          background: 'rgba(255,255,255,0.18)',
                          borderRadius: 12,
                          width: 42,
                          height: 42,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          flexShrink: 0,
                        }}
                      >
                        {renderBenefitIcon(item)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div> : null}

            <div
              style={{
                flex: 1,
                padding: formPanelModeSettings.panelPadding,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflowY: 'auto',
                maxHeight: '90vh',
                borderLeft: isOutlinedFormPanel ? `1px solid ${formPanelBorderColor}` : undefined,
                boxShadow: isGlassFormPanel ? 'inset 1px 0 0 rgba(255,255,255,0.55)' : undefined,
                backdropFilter: isGlassFormPanel ? 'blur(12px)' : undefined,
                ...formPanelBackgroundStyle,
              }}
            >
              {success ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'rgba(39, 174, 96, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      fontSize: 28,
                      color: STATIC_COLORS.green,
                    }}
                  >
                    OK
                  </div>
                  <h4 style={{ fontWeight: 700, marginBottom: 8, color: formPanelTextColor, fontSize: 20 }}>
                    {pageConfig.successTitle || 'Application Submitted!'}
                  </h4>
                  <p style={{ color: formPanelMutedTextColor, marginBottom: 16, lineHeight: 1.6 }}>
                    {pageConfig.successMessage || 'Thank you for your interest. Our team will review your application and get back to you.'}
                  </p>
                  <div
                    style={{
                      background: colors.primarySoft,
                      borderRadius: 10,
                      padding: '12px 16px',
                      color: colors.primary,
                      marginBottom: 20,
                      fontSize: 14,
                      border: `1px solid ${colors.primaryBorder}`,
                    }}
                  >
                    Check your inbox for updates at <strong>{formData.email}</strong>
                  </div>
                  <a
                    href="/login"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      padding: '0 28px',
                      borderRadius: 10,
                      background: colors.primary,
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 14,
                      textDecoration: 'none',
                    }}
                  >
                    Back to Login
                  </a>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontWeight: 700, marginBottom: 4, color: formPanelTextColor, fontSize: 19 }}>
                      {pageConfig.title || 'Request B2B Access'}
                    </h4>
                    {pageConfig.showFormDescription ? (
                      <p style={{ color: formPanelMutedTextColor, marginBottom: 0, fontSize: 14 }}>
                        {pageConfig.subtitle || 'Tell us about your business to get started'}
                      </p>
                    ) : null}
                  </div>

                  {!emailLocked && pageConfig.notice.enabled ? (
                    <div
                      style={{
                        background: normalizeHexColor(pageConfig.notice.backgroundColor, '#EEF4FF'),
                        border: `1px solid ${normalizeHexColor(pageConfig.notice.borderColor, '#AFC6F8')}`,
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: 12,
                        fontSize: 13,
                        color: normalizeHexColor(pageConfig.notice.textColor, '#344054'),
                      }}
                    >
                      {pageConfig.notice.text}
                    </div>
                  ) : null}

                  {error ? (
                    <div
                      style={{
                        background: 'rgba(231,76,60,0.06)',
                        border: '1px solid rgba(231,76,60,0.2)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        marginBottom: 12,
                        fontSize: 13,
                        color: STATIC_COLORS.red,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ flex: 1 }}>{error}</span>
                      <button
                        type="button"
                        onClick={() => setError('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: STATIC_COLORS.textMuted, fontSize: 16, padding: 0, lineHeight: 1 }}
                        aria-label="Dismiss"
                      >
                        x
                      </button>
                    </div>
                  ) : null}

                  <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: formPanelModeSettings.fieldGap }}>
                      {renderFormFields()}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        width: '100%',
                        height: formPanelModeSettings.buttonHeight,
                        marginTop: 22,
                        border: 'none',
                        borderRadius: formPanelModeSettings.inputRadius,
                        background: actionBackground,
                        color: '#fff',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.6 : 1,
                        transition: 'opacity 0.2s, box-shadow 0.2s',
                        boxShadow: boxShadowEnabled ? `0 4px 14px ${colors.shadow}` : 'none',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                    >
                      {loading ? 'Submitting Application...' : (requestExperience?.primaryActionLabel ?? 'Submit Application')}
                    </button>

                    <p style={{ textAlign: 'center', color: formPanelMutedTextColor, marginTop: 16, marginBottom: 0, fontSize: 14 }}>
                      Already have an account?{' '}
                      <a href="/login" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
                        {requestExperience?.secondaryActionLabel ?? 'Sign in'}
                      </a>
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/request-invitation')({ component: RequestInvitationView });

function renderBenefitIcon(item: BenefitConfig) {
  const Icon = BENEFIT_ICONS[item.icon] ?? CircleCheck;
  return <Icon size={22} strokeWidth={2} aria-hidden="true" />;
}

function currentSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function valueOf(value: string | undefined) {
  return (value || '').trim();
}

function optionalValue(value: string | undefined) {
  const trimmed = valueOf(value);
  return trimmed ? trimmed : undefined;
}

function normalizeShopDomain(value: string | null) {
  if (!value) return '';
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function normalizeHexColor(value: string | null | undefined, fallback = DEFAULT_PRIMARY_COLOR) {
  if (value && /^#[0-9a-fA-F]{6}$/.test(value.trim())) return value.trim();
  if (value && /^[0-9a-fA-F]{6}$/.test(value.trim())) return `#${value.trim()}`;
  return fallback;
}

function hexToRgb(hex: string) {
  const safeHex = normalizeHexColor(hex).replace('#', '');
  return {
    r: Number.parseInt(safeHex.slice(0, 2), 16),
    g: Number.parseInt(safeHex.slice(2, 4), 16),
    b: Number.parseInt(safeHex.slice(4, 6), 16),
  };
}

function darken(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

function makeColors(primary: string) {
  const safePrimary = normalizeHexColor(primary);
  const { r, g, b } = hexToRgb(safePrimary);
  return {
    primary: safePrimary,
    primaryLight: `rgba(${r}, ${g}, ${b}, 0.08)`,
    primarySoft: `rgba(${r}, ${g}, ${b}, 0.08)`,
    primaryBorder: `rgba(${r}, ${g}, ${b}, 0.25)`,
    gradientOne: darken(safePrimary, 0.15),
    gradientTwo: darken(safePrimary, 0.3),
    shadow: `rgba(${r}, ${g}, ${b}, 0.3)`,
    backgroundLight: `rgba(${r}, ${g}, ${b}, 0.06)`,
  };
}

function normalizeGradientAngle(value: number | undefined, fallback = 160) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(360, Math.max(0, Math.round(parsed)));
}

function getConfiguredGradient(pageConfig: RequestPageConfig, fallbackGradient: string) {
  if (!pageConfig.primaryGradientEnabled) return fallbackGradient;
  const primaryColor = normalizeHexColor(pageConfig.primaryColor);
  const from = normalizeHexColor(pageConfig.primaryGradientFrom, primaryColor);
  const to = normalizeHexColor(pageConfig.primaryGradientTo, DEFAULT_GRADIENT_TO);
  const angle = normalizeGradientAngle(pageConfig.primaryGradientAngle);
  return `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
}

function rgbaFromHex(hex: string, alpha: number, fallback = DEFAULT_PRIMARY_COLOR) {
  const { r, g, b } = hexToRgb(normalizeHexColor(hex, fallback));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getFormPanelBackgroundStyle(pageConfig: RequestPageConfig, primaryColor: string): CSSProperties {
  const type = pageConfig.formPanelBackgroundType || 'solid';
  const backgroundColor = normalizeHexColor(pageConfig.formPanelBackgroundColor, '#FFFFFF');
  const from = normalizeHexColor(pageConfig.formPanelGradientFrom, backgroundColor);
  const to = normalizeHexColor(pageConfig.formPanelGradientTo, '#F6F8FC');
  const angle = normalizeGradientAngle(pageConfig.formPanelGradientAngle, 135);
  const gradient = `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;
  const patternColor = rgbaFromHex(primaryColor, 0.12);
  const subtlePatternColor = rgbaFromHex(primaryColor, 0.07);
  const style: CSSProperties = { backgroundColor };

  if (type === 'gradient') {
    style.backgroundImage = gradient;
    return style;
  }

  if (type !== 'pattern') return style;

  if (pageConfig.formPanelPattern === 'dots') {
    style.backgroundImage = `radial-gradient(circle at 1px 1px, ${patternColor} 1px, transparent 0), ${gradient}`;
    style.backgroundSize = '18px 18px, auto';
    return style;
  }

  if (pageConfig.formPanelPattern === 'diagonal') {
    style.backgroundImage = `repeating-linear-gradient(135deg, ${subtlePatternColor} 0 1px, transparent 1px 12px), ${gradient}`;
    style.backgroundSize = 'auto, auto';
    return style;
  }

  if (pageConfig.formPanelPattern === 'grid') {
    style.backgroundImage = `linear-gradient(${subtlePatternColor} 1px, transparent 1px), linear-gradient(90deg, ${subtlePatternColor} 1px, transparent 1px), ${gradient}`;
    style.backgroundSize = '28px 28px, 28px 28px, auto';
    return style;
  }

  style.backgroundImage = gradient;
  return style;
}

function getFormPanelModeSettings(mode: string) {
  if (mode === 'compact') {
    return { panelPadding: '28px 30px', inputPadding: '9px 12px', inputRadius: 8, fieldGap: 12, buttonHeight: 44 };
  }
  if (mode === 'spacious') {
    return { panelPadding: '48px 44px', inputPadding: '12px 15px', inputRadius: 12, fieldGap: 16, buttonHeight: 50 };
  }
  if (mode === 'glass') {
    return { panelPadding: '38px 38px', inputPadding: '10px 14px', inputRadius: 12, fieldGap: 14, buttonHeight: 46 };
  }
  return { panelPadding: '36px 36px', inputPadding: '10px 14px', inputRadius: mode === 'outlined' ? 8 : 10, fieldGap: 14, buttonHeight: 46 };
}

function getSelectOptions(pageConfig: RequestPageConfig, fieldKey: string) {
  if (fieldKey === 'industry') return pageConfig.industries || [];
  if (fieldKey === 'estimatedMonthlyVolume') return pageConfig.volumeOptions || [];
  return [];
}

function getPlaceholder(field: AccountPortalRequestField) {
  return field.placeholder || `Enter ${field.label.toLowerCase()}`;
}

function certificateExpiryWarning(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const expiresAt = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime())) return '';
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining < 0) return 'This certificate has expired. Upload a current certificate.';
  if (daysRemaining <= 90) {
    return 'Your tax exemption certificate will expire soon. Please update it as soon as possible.';
  }
  return '';
}

function mergeRequestMessage(
  pageConfig: RequestPageConfig,
  formData: Record<string, string>,
  files: Record<string, File | null>,
) {
  const userMessage = (formData.message || '').trim();
  const extraLines = pageConfig.formFields
    .filter((field) => !KNOWN_REQUEST_KEYS.has(field.key))
    .map((field) => {
      if (field.type === 'file') {
        const file = files[field.key];
        return file ? `${field.label}: ${file.name}` : null;
      }
      const value = (formData[field.key] || '').trim();
      return value ? `${field.label}: ${value}` : null;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (!extraLines.length) return userMessage;
  const customMessage = ['Additional Form Responses:', ...extraLines].join('\n');
  return userMessage ? `${userMessage}\n\n${customMessage}` : customMessage;
}
