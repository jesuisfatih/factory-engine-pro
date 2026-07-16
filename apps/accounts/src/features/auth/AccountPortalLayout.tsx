import type { CSSProperties, ReactNode } from 'react';
import {
  BadgeCheck,
  BadgeDollarSign,
  CalendarClock,
  CircleCheck,
  Clock3,
  CreditCard,
  FileCheck2,
  Headphones,
  HeartHandshake,
  Landmark,
  Mail,
  PackageCheck,
  Palette,
  PhoneCall,
  Rocket,
  ShoppingBag,
  ShieldCheck,
  Sparkles,
  Truck,
  Users2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  resolveBrandLogoUrl,
  type AccountPortalExperience,
  type AccountPortalIcon,
} from '@factory-engine-pro/contracts';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

type PortalSurface = 'login' | 'register';

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
  users: Users2,
  'wallet-cards': WalletCards,
};

export function AccountPortalIconView({ name, size }: { name: AccountPortalIcon; size?: number }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" size={size} />;
}

export function AccountPortalLayout({
  surface,
  children,
  formLabel,
}: {
  surface: PortalSurface;
  children: ReactNode;
  formLabel: string;
}) {
  const brandQuery = useWorkspaceBrand();
  const name = workspaceName(brandQuery.data?.workspaceName);
  const badge = workspaceBadge(brandQuery.data?.brandBadge, name);
  const experience: AccountPortalExperience = brandQuery.data?.accountPortalExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE;
  const page = { ...DEFAULT_ACCOUNT_PORTAL_EXPERIENCE[surface], ...experience[surface] };
  const theme = experience.theme;
  const layout = page.enabled ? page.layout : 'centered';
  const brandTitle = page.heroBrandTitle || name;
  const brandSubtitle = page.heroBrandSubtitle || 'Company Portal';
  const brandBackground = page.panelGradientEnabled
    ? `linear-gradient(${page.panelGradientAngle}deg, ${page.panelGradientFrom} 0%, ${page.panelGradientTo} 100%)`
    : theme.primaryColor;
  const heroLogoSurface = page.heroLogoSurface === 'auto'
    ? (isLightColor(page.panelGradientEnabled ? page.panelGradientFrom : theme.primaryColor) ? 'light' : 'dark')
    : page.heroLogoSurface;
  const logo = resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, heroLogoSurface);
  const style = {
    '--portal-primary': theme.primaryColor,
    '--portal-accent': theme.accentColor,
    '--portal-page-bg': theme.pageBackground,
    '--portal-panel-bg': theme.panelBackground,
    '--portal-text': theme.textColor,
    '--portal-muted': theme.mutedTextColor,
    '--auth-brand-background': brandBackground,
    '--auth-brand-header-text': page.panelGradientEnabled && isLightColor(page.panelGradientFrom) ? '#172033' : '#ffffff',
    '--auth-primary-action': page.primaryButtonStyle === 'gradient'
      ? `linear-gradient(135deg, ${theme.primaryColor}, ${theme.accentColor})`
      : theme.primaryColor,
  } as CSSProperties;

  return (
    <main className={`auth-page portal-density-${theme.density} portal-radius-${theme.radius} ${page.desktopFit ? 'auth-desktop-fit' : ''}`} style={style}>
      <div className={`auth-stage auth-layout-${layout} auth-hero-width-${page.heroPanelWidth}`}>
        {layout === 'split' ? (
          <section
            className={`auth-brand-panel auth-brand-align-${page.heroBrandAlignment} auth-brand-logo-${page.heroLogoSize} auth-brand-size-${page.heroBrandSize} auth-benefits-${page.benefitsPlacement} auth-hero-pattern-${page.heroPattern} auth-vertical-${page.heroVerticalAlignment} auth-padding-${page.heroPadding} auth-gap-${page.heroContentGap} auth-benefit-density-${page.benefitDensity}`}
            style={{ '--auth-hero-pattern-opacity': String(page.heroPatternOpacity / 100) } as CSSProperties}
            aria-label={`${name} account workspace`}
          >
            <div>
              <div className="auth-brand-row">
                {page.showHeroLogo && logo ? (
                  <div className="auth-brand-logo"><img src={logo} alt={name} className="auth-brand-mark-img" /></div>
                ) : page.showHeroBadge ? (
                  <div className="auth-brand-mark">{badge.charAt(0)}</div>
                ) : null}
                {page.showHeroBrandText ? <div className="auth-brand-name"><span>{brandTitle}</span><small>{brandSubtitle}</small></div> : null}
              </div>
              <div className="auth-brand-copy">
                {page.showEyebrow && page.eyebrow ? <span className="auth-eyebrow">{page.eyebrow}</span> : null}
                {page.showHeroHeadline ? <h1>{page.headline}</h1> : null}
                {page.showHeroDescription ? <p>{page.description}</p> : null}
              </div>
            </div>

            {page.showBenefits && page.benefits.length ? (
              <div className="auth-benefit-list">
                {page.benefits.map((benefit) => (
                  <div className={`auth-benefit-card tone-${benefit.tone}`} key={`${benefit.title}-${benefit.body}`}>
                    <AccountPortalIconView name={benefit.icon} />
                    <div><strong>{benefit.title}</strong><span>{benefit.body}</span></div>
                  </div>
                ))}
              </div>
            ) : <div />}

            {page.showTrustItems && page.trustItems.length ? (
              <div className="auth-trust-strip" aria-label="Account benefits">
                {page.trustItems.map((item) => (
                  <span key={`${item.icon}-${item.label}`}><AccountPortalIconView name={item.icon} />{item.label}</span>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="auth-form-panel" aria-label={formLabel}>
          {children}
          {page.showFooter && page.footerPlacement === 'form' ? <PortalFooter page={page} name={name} /> : null}
        </section>
      </div>
      {page.showFooter && page.footerPlacement === 'page' ? <PortalFooter page={page} name={name} outside /> : null}
    </main>
  );
}

function PortalFooter({ page, name, outside = false }: { page: AccountPortalExperience['login']; name: string; outside?: boolean }) {
  return <p className={`auth-footer auth-footer-${page.footerAlignment}${outside ? ' auth-footer-page' : ''}`}>&copy; {page.footerShowYear ? `${new Date().getFullYear()} ` : ''}{name}. {page.footerText}</p>;
}

function isLightColor(hex: string) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return false;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 180;
}

export function useAccountPortalSurface(surface: PortalSurface | 'requestAccess') {
  const brandQuery = useWorkspaceBrand();
  const experience = brandQuery.data?.accountPortalExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE;
  return {
    query: brandQuery,
    experience,
    page: experience[surface],
    theme: experience.theme,
  };
}
