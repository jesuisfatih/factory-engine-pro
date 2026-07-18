import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  ACCOUNT_PORTAL_REQUEST_FIELDS,
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  resolveBrandLogoUrl,
  type AccountPortalIcon,
  type AccountPortalRequestField,
} from '@factory-engine-pro/contracts';
import { AccountPortalFormBrand, AccountPortalHero, AccountPortalIconView } from '@factory-engine-pro/ui';
import { accountsApi, apiErrorMessage } from '@/lib/api';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

interface BenefitConfig {
  icon: AccountPortalIcon;
  title: string;
  description: string;
}

interface RequestPageConfig {
  title: string;
  subtitle: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  heroEyebrow: string;
  brandTitle: string;
  brandSubtitle: string;
  heroTitle: string;
  heroSubtitle: string;
  showHeroLogo: boolean;
  showHeroBadge: boolean;
  showHeroBrandText: boolean;
  showEyebrow: boolean;
  showHeroHeadline: boolean;
  showHeroDescription: boolean;
  heroBrandAlignment: 'left' | 'center';
  heroLogoSize: 'standard' | 'large';
  heroLogoSurface: 'auto' | 'light' | 'dark';
  heroBrandSize: 'standard' | 'large';
  heroVerticalAlignment: 'top' | 'center';
  heroPadding: 'compact' | 'standard' | 'spacious';
  heroContentGap: 'tight' | 'standard' | 'open';
  benefitDensity: 'compact' | 'standard';
  desktopFit: boolean;
  desktopStageHeight: number;
  formVerticalAlignment: 'top' | 'center';
  benefitsPlacement: 'flow' | 'lower';
  heroPanelWidth: 'narrow' | 'balanced' | 'wide';
  heroPattern: 'grid' | 'none';
  heroPatternOpacity: number;
  primaryButtonStyle: 'solid' | 'gradient';
  showFormDescription: boolean;
  showFooter: boolean;
  footerPlacement: 'form' | 'page';
  footerAlignment: 'left' | 'center' | 'right';
  footerText: string;
  footerShowYear: boolean;
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
  trustItems: Array<{ icon: AccountPortalIcon; label: string }>;
  showTrustItems: boolean;
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
  successIcon: AccountPortalIcon;
  showSuccessEmailHint: boolean;
  successEmailHintPrefix: string;
  successBackActionLabel: string;
  submittingActionLabel: string;
  existingAccountPrompt: string;
  lockedEmailHint: string;
  errorDismissLabel: string;
  certificateExpiringMessage: string;
}

const DEFAULT_REQUEST_PAGE_CONFIG: RequestPageConfig = {
  title: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.formTitle,
  subtitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.formDescription,
  primaryActionLabel: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.primaryActionLabel,
  secondaryActionLabel: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.secondaryActionLabel,
  heroEyebrow: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.eyebrow,
  brandTitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroBrandTitle,
  brandSubtitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroBrandSubtitle,
  heroTitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.headline,
  heroSubtitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.description,
  showHeroLogo: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showHeroLogo,
  showHeroBadge: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showHeroBadge,
  showHeroBrandText: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showHeroBrandText,
  showEyebrow: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showEyebrow,
  showHeroHeadline: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showHeroHeadline,
  showHeroDescription: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showHeroDescription,
  heroBrandAlignment: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroBrandAlignment,
  heroLogoSize: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroLogoSize,
  heroLogoSurface: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroLogoSurface,
  heroBrandSize: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroBrandSize,
  heroVerticalAlignment: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroVerticalAlignment,
  heroPadding: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroPadding,
  heroContentGap: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroContentGap,
  benefitDensity: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.benefitDensity,
  desktopFit: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.desktopFit,
  desktopStageHeight: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.desktopStageHeight,
  formVerticalAlignment: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.formVerticalAlignment,
  benefitsPlacement: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.benefitsPlacement,
  heroPanelWidth: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroPanelWidth,
  heroPattern: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroPattern,
  heroPatternOpacity: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.heroPatternOpacity,
  primaryButtonStyle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.primaryButtonStyle,
  showFormDescription: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showFormDescription,
  showFooter: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showFooter,
  footerPlacement: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.footerPlacement,
  footerAlignment: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.footerAlignment,
  footerText: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.footerText,
  footerShowYear: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.footerShowYear,
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
  benefits: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.benefits.map((benefit) => ({ icon: benefit.icon, title: benefit.title, description: benefit.body })),
  trustItems: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.trustItems,
  showTrustItems: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showTrustItems,
  industries: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.industries,
  volumeOptions: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.volumeOptions,
  formFields: ACCOUNT_PORTAL_REQUEST_FIELDS.map((field) => ({ ...field })),
  notice: {
    enabled: true,
    text: 'If you already have a storefront account, use the same email address here.',
    backgroundColor: '#EEF4FF',
    borderColor: '#AFC6F8',
    textColor: '#344054',
  },
  successTitle: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.successTitle,
  successMessage: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.successMessage,
  successIcon: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.successIcon,
  showSuccessEmailHint: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.showSuccessEmailHint,
  successEmailHintPrefix: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.successEmailHintPrefix,
  successBackActionLabel: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.successBackActionLabel,
  submittingActionLabel: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.submittingActionLabel,
  existingAccountPrompt: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.existingAccountPrompt,
  lockedEmailHint: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.lockedEmailHint,
  errorDismissLabel: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.errorDismissLabel,
  certificateExpiringMessage: DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess.certificateExpiringMessage,
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
  const search = useMemo(() => currentSearchParams(), []);
  const shop = normalizeShopDomain(search.get('shop') || search.get('store') || '');
  const merchantHint = (search.get('merchantId') || search.get('merchant_id') || '').trim();
  const emailFromUrl = (search.get('email') || '').trim();
  const emailLocked = emailFromUrl.length > 0;
  const portalExperience = brandQuery.data?.accountPortalExperience;
  const requestExperience = portalExperience?.requestAccess;
  const requestPage = requestExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE.requestAccess;
  const pageConfig = useMemo<RequestPageConfig>(() => ({
    ...DEFAULT_REQUEST_PAGE_CONFIG,
    title: requestExperience?.formTitle ?? DEFAULT_REQUEST_PAGE_CONFIG.title,
    subtitle: requestExperience?.formDescription ?? DEFAULT_REQUEST_PAGE_CONFIG.subtitle,
    primaryActionLabel: requestExperience?.primaryActionLabel ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryActionLabel,
    secondaryActionLabel: requestExperience?.secondaryActionLabel ?? DEFAULT_REQUEST_PAGE_CONFIG.secondaryActionLabel,
    heroEyebrow: requestExperience?.eyebrow ?? DEFAULT_REQUEST_PAGE_CONFIG.heroEyebrow,
    brandTitle: requestExperience?.heroBrandTitle || brandName,
    brandSubtitle: requestExperience?.heroBrandSubtitle ?? DEFAULT_REQUEST_PAGE_CONFIG.brandSubtitle,
    heroTitle: requestExperience?.headline ?? DEFAULT_REQUEST_PAGE_CONFIG.heroTitle,
    heroSubtitle: requestExperience?.description ?? DEFAULT_REQUEST_PAGE_CONFIG.heroSubtitle,
    showHeroLogo: requestExperience?.showHeroLogo ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroLogo,
    showHeroBadge: requestExperience?.showHeroBadge ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroBadge,
    showHeroBrandText: requestExperience?.showHeroBrandText ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroBrandText,
    showEyebrow: requestExperience?.showEyebrow ?? DEFAULT_REQUEST_PAGE_CONFIG.showEyebrow,
    showHeroHeadline: requestExperience?.showHeroHeadline ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroHeadline,
    showHeroDescription: requestExperience?.showHeroDescription ?? DEFAULT_REQUEST_PAGE_CONFIG.showHeroDescription,
    heroBrandAlignment: requestExperience?.heroBrandAlignment ?? DEFAULT_REQUEST_PAGE_CONFIG.heroBrandAlignment,
    heroLogoSize: requestExperience?.heroLogoSize ?? DEFAULT_REQUEST_PAGE_CONFIG.heroLogoSize,
    heroLogoSurface: requestExperience?.heroLogoSurface ?? DEFAULT_REQUEST_PAGE_CONFIG.heroLogoSurface,
    heroBrandSize: requestExperience?.heroBrandSize ?? DEFAULT_REQUEST_PAGE_CONFIG.heroBrandSize,
    heroVerticalAlignment: requestExperience?.heroVerticalAlignment ?? DEFAULT_REQUEST_PAGE_CONFIG.heroVerticalAlignment,
    heroPadding: requestExperience?.heroPadding ?? DEFAULT_REQUEST_PAGE_CONFIG.heroPadding,
    heroContentGap: requestExperience?.heroContentGap ?? DEFAULT_REQUEST_PAGE_CONFIG.heroContentGap,
    benefitDensity: requestExperience?.benefitDensity ?? DEFAULT_REQUEST_PAGE_CONFIG.benefitDensity,
    desktopFit: requestExperience?.desktopFit ?? DEFAULT_REQUEST_PAGE_CONFIG.desktopFit,
    desktopStageHeight: requestExperience?.desktopStageHeight ?? DEFAULT_REQUEST_PAGE_CONFIG.desktopStageHeight,
    formVerticalAlignment: requestExperience?.formVerticalAlignment ?? DEFAULT_REQUEST_PAGE_CONFIG.formVerticalAlignment,
    benefitsPlacement: requestExperience?.benefitsPlacement ?? DEFAULT_REQUEST_PAGE_CONFIG.benefitsPlacement,
    heroPanelWidth: requestExperience?.heroPanelWidth ?? DEFAULT_REQUEST_PAGE_CONFIG.heroPanelWidth,
    heroPattern: requestExperience?.heroPattern ?? DEFAULT_REQUEST_PAGE_CONFIG.heroPattern,
    heroPatternOpacity: requestExperience?.heroPatternOpacity ?? DEFAULT_REQUEST_PAGE_CONFIG.heroPatternOpacity,
    primaryButtonStyle: requestExperience?.primaryButtonStyle ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryButtonStyle,
    showFormDescription: requestExperience?.showFormDescription ?? DEFAULT_REQUEST_PAGE_CONFIG.showFormDescription,
    showFooter: requestExperience?.showFooter ?? DEFAULT_REQUEST_PAGE_CONFIG.showFooter,
    footerPlacement: requestExperience?.footerPlacement ?? DEFAULT_REQUEST_PAGE_CONFIG.footerPlacement,
    footerAlignment: requestExperience?.footerAlignment ?? DEFAULT_REQUEST_PAGE_CONFIG.footerAlignment,
    footerText: requestExperience?.footerText ?? DEFAULT_REQUEST_PAGE_CONFIG.footerText,
    footerShowYear: requestExperience?.footerShowYear ?? DEFAULT_REQUEST_PAGE_CONFIG.footerShowYear,
    primaryColor: portalExperience?.theme.primaryColor ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryColor,
    primaryGradientEnabled: requestExperience?.panelGradientEnabled ?? DEFAULT_REQUEST_PAGE_CONFIG.primaryGradientEnabled,
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
    trustItems: requestExperience?.trustItems ?? DEFAULT_REQUEST_PAGE_CONFIG.trustItems,
    showTrustItems: requestExperience?.showTrustItems ?? DEFAULT_REQUEST_PAGE_CONFIG.showTrustItems,
    industries: requestExperience?.industries ?? DEFAULT_REQUEST_PAGE_CONFIG.industries,
    volumeOptions: requestExperience?.volumeOptions ?? DEFAULT_REQUEST_PAGE_CONFIG.volumeOptions,
    formFields: requestExperience?.formFields ?? DEFAULT_REQUEST_PAGE_CONFIG.formFields,
    notice: requestExperience?.notice ?? DEFAULT_REQUEST_PAGE_CONFIG.notice,
    successTitle: requestExperience?.successTitle ?? DEFAULT_REQUEST_PAGE_CONFIG.successTitle,
    successMessage: requestExperience?.successMessage ?? DEFAULT_REQUEST_PAGE_CONFIG.successMessage,
    successIcon: requestExperience?.successIcon ?? DEFAULT_REQUEST_PAGE_CONFIG.successIcon,
    showSuccessEmailHint: requestExperience?.showSuccessEmailHint ?? DEFAULT_REQUEST_PAGE_CONFIG.showSuccessEmailHint,
    successEmailHintPrefix: requestExperience?.successEmailHintPrefix ?? DEFAULT_REQUEST_PAGE_CONFIG.successEmailHintPrefix,
    successBackActionLabel: requestExperience?.successBackActionLabel ?? DEFAULT_REQUEST_PAGE_CONFIG.successBackActionLabel,
    submittingActionLabel: requestExperience?.submittingActionLabel ?? DEFAULT_REQUEST_PAGE_CONFIG.submittingActionLabel,
    existingAccountPrompt: requestExperience?.existingAccountPrompt ?? DEFAULT_REQUEST_PAGE_CONFIG.existingAccountPrompt,
    lockedEmailHint: requestExperience?.lockedEmailHint ?? DEFAULT_REQUEST_PAGE_CONFIG.lockedEmailHint,
    errorDismissLabel: requestExperience?.errorDismissLabel ?? DEFAULT_REQUEST_PAGE_CONFIG.errorDismissLabel,
    certificateExpiringMessage: requestExperience?.certificateExpiringMessage ?? DEFAULT_REQUEST_PAGE_CONFIG.certificateExpiringMessage,
  }), [brandName, portalExperience, requestExperience]);
  const heroLogoBackground = requestExperience?.panelGradientEnabled
    ? requestExperience.panelGradientFrom
    : pageConfig.primaryColor;
  const heroLogoSurface = pageConfig.heroLogoSurface === 'auto'
    ? (isLightHex(heroLogoBackground) ? 'light' : 'dark')
    : pageConfig.heroLogoSurface;
  const logoUrl = resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, heroLogoSurface);
  const formLogoSurface = requestPage.formLogoSurface === 'auto'
    ? (isLightHex(portalExperience?.theme.panelBackground ?? '#FFFFFF') ? 'light' : 'dark')
    : requestPage.formLogoSurface;
  const formLogoUrl = resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, formLogoSurface);
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
  const certificateWarning = certificateExpiryWarning(formData.taxCertificateExpiresAt, pageConfig.certificateExpiringMessage);

  const colors = makeColors(pageConfig.primaryColor || DEFAULT_PRIMARY_COLOR);
  const fontColor = normalizeHexColor(pageConfig.fontColor, '#2c3e50');
  const boxShadowEnabled = pageConfig.boxShadow !== false;
  const heroFlexBasis = pageConfig.heroPanelWidth === 'narrow' ? '33%' : pageConfig.heroPanelWidth === 'wide' ? '46%' : '38%';
  const actionBackground = pageConfig.primaryButtonStyle === 'gradient'
    ? getConfiguredGradient(pageConfig, `linear-gradient(135deg, ${colors.primary}, ${colors.gradientOne})`)
    : colors.primary;
  const formPanelModeSettings = pageConfig.desktopFit
    ? { panelPadding: '8px 24px', inputPadding: '3px 10px', inputRadius: 8, fieldGap: 7, buttonHeight: 36 }
    : getFormPanelModeSettings(pageConfig.formPanelMode);
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
    fontSize: pageConfig.desktopFit ? 13 : 14,
    fontFamily: 'Inter, system-ui, sans-serif',
    color: formPanelInputTextColor,
    background: formPanelInputBackgroundColor,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  };

  const labelStyle: CSSProperties = {
    display: 'block',
    fontSize: pageConfig.desktopFit ? 11 : 13,
    fontWeight: 500,
    color: formPanelMutedTextColor,
    marginBottom: pageConfig.desktopFit ? 2 : 6,
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
    if (field.visible === false) return null;
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
            style={{ ...inputStyle, padding: pageConfig.desktopFit ? '4px 9px' : '8px 12px' }}
          />
          {field.helpText ? <p style={{ fontSize: 12, color: formPanelMutedTextColor, marginTop: 4, marginBottom: 0 }}>{field.helpText}</p> : null}
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
            <option value="">{field.selectPlaceholder || getPlaceholder(field)}</option>
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
            rows={pageConfig.desktopFit ? 2 : 3}
            value={value}
            onChange={(inputEvent) => handleChange(field.key, inputEvent.target.value)}
            disabled={loading}
            required={isRequired}
            placeholder={getPlaceholder(field)}
            style={{ ...inputStyle, minHeight: pageConfig.desktopFit ? 42 : 80, resize: 'vertical' }}
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
            {pageConfig.lockedEmailHint}
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
      className={`request-portal-page${pageConfig.desktopFit ? ' request-portal-desktop-fit' : ''}${pageConfig.showFooter && pageConfig.footerPlacement === 'page' ? ' request-portal-has-page-footer' : ''}`}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: portalExperience?.theme.pageBackground ?? `linear-gradient(135deg, #f0f6f9 0%, #e3eef3 50%, ${colors.backgroundLight} 100%)`,
        padding: 20,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        '--portal-desktop-stage-height': `${pageConfig.desktopStageHeight}px`,
      } as CSSProperties}
    >
      <div className="request-portal-stage-wrap" style={{ width: '100%', maxWidth: requestPage.layout === 'centered' ? 620 : 980, position: 'relative', zIndex: 1 }}>
        <div
          className="request-portal-stage"
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
          <div className="request-portal-stage-grid" style={{ display: 'flex', minHeight: pageConfig.desktopFit ? 0 : 620 }}>
            {requestPage.layout !== 'centered' ? (
              <AccountPortalHero
                className="request-portal-hero"
                style={{ flex: `0 0 ${heroFlexBasis}` }}
                page={requestPage}
                surface="requestAccess"
                workspaceName={brandName}
                brandBadge={brandBadge}
                brandLogo={logoUrl}
                primaryColor={pageConfig.primaryColor}
              />
            ) : null}

            <div
              className="request-portal-form-panel"
              style={{
                flex: 1,
                padding: formPanelModeSettings.panelPadding,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: pageConfig.formVerticalAlignment === 'top' ? 'flex-start' : 'center',
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
                    <AccountPortalIconView name={pageConfig.successIcon} size={28} />
                  </div>
                  <h4 style={{ fontWeight: 700, marginBottom: 8, color: formPanelTextColor, fontSize: 20 }}>
                    {pageConfig.successTitle}
                  </h4>
                  <p style={{ color: formPanelMutedTextColor, marginBottom: 16, lineHeight: 1.6 }}>
                    {pageConfig.successMessage || 'Thank you for your interest. Our team will review your application and get back to you.'}
                  </p>
                  {pageConfig.showSuccessEmailHint ? <div
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
                    {pageConfig.successEmailHintPrefix} <strong>{formData.email}</strong>
                  </div>
                  : null}
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
                    {pageConfig.successBackActionLabel}
                  </a>
                </div>
              ) : (
                <>
                  <AccountPortalFormBrand page={requestPage} workspaceName={brandName} brandBadge={brandBadge} brandLogo={formLogoUrl} />
                  <div style={{ marginBottom: pageConfig.desktopFit ? 8 : 20 }}>
                    <h4 style={{ fontWeight: 700, margin: '0 0 4px', color: formPanelTextColor, fontSize: 19 }}>
                      {pageConfig.title || 'Request B2B Access'}
                    </h4>
                    {pageConfig.showFormDescription ? (
                      <p style={{ color: formPanelMutedTextColor, marginBottom: 0, fontSize: 14 }}>
                        {pageConfig.subtitle}
                      </p>
                    ) : null}
                  </div>

                  {!emailLocked && pageConfig.notice.enabled ? (
                    <div
                      style={{
                        background: normalizeHexColor(pageConfig.notice.backgroundColor, '#EEF4FF'),
                        border: `1px solid ${normalizeHexColor(pageConfig.notice.borderColor, '#AFC6F8')}`,
                        borderRadius: 10,
                        padding: pageConfig.desktopFit ? '6px 10px' : '10px 14px',
                        marginBottom: pageConfig.desktopFit ? 7 : 12,
                        fontSize: pageConfig.desktopFit ? 11 : 13,
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
                        aria-label={pageConfig.errorDismissLabel}
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
                        marginTop: pageConfig.desktopFit ? 8 : 22,
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
                      {loading ? pageConfig.submittingActionLabel : pageConfig.primaryActionLabel}
                    </button>

                    <p style={{ textAlign: 'center', color: formPanelMutedTextColor, marginTop: pageConfig.desktopFit ? 5 : 16, marginBottom: 0, fontSize: pageConfig.desktopFit ? 12 : 14 }}>
                      {pageConfig.existingAccountPrompt}{' '}
                      <a href="/login" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>
                        {pageConfig.secondaryActionLabel}
                      </a>
                    </p>
                  </form>
                </>
              )}
              {pageConfig.showFooter && pageConfig.footerPlacement === 'form' ? <RequestPortalFooter config={pageConfig} brandName={brandName} color={formPanelMutedTextColor} /> : null}
            </div>
          </div>
        </div>
      </div>
      {pageConfig.showFooter && pageConfig.footerPlacement === 'page' ? <RequestPortalFooter config={pageConfig} brandName={brandName} color={formPanelMutedTextColor} outside /> : null}
    </div>
  );
}

export const Route = createFileRoute('/request-invitation')({ component: RequestInvitationView });

function RequestPortalFooter({ config, brandName, color, outside = false }: { config: RequestPageConfig; brandName: string; color: string; outside?: boolean }) {
  return <p className={outside ? 'request-portal-footer request-portal-footer-page' : 'request-portal-footer'} style={{ color, textAlign: config.footerAlignment }}>&copy; {config.footerShowYear ? `${new Date().getFullYear()} ` : ''}{brandName}. {config.footerText}</p>;
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

function isLightHex(value: string | undefined) {
  const normalized = normalizeHexColor(value, '#081F6F').replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 180;
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
  return field.placeholder;
}

function certificateExpiryWarning(value: string | undefined, warningMessage: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const expiresAt = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime())) return '';
  const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining < 0) return warningMessage;
  if (daysRemaining <= 90) {
    return warningMessage;
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
