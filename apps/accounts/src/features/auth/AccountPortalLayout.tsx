import type { CSSProperties, ReactNode } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Headphones,
  PackageCheck,
  ShieldCheck,
  Truck,
  Users2,
  type LucideIcon,
} from 'lucide-react';
import {
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  type AccountPortalExperience,
  type AccountPortalIcon,
} from '@factory-engine-pro/contracts';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

type PortalSurface = 'login' | 'register';

const ICONS: Record<AccountPortalIcon, LucideIcon> = {
  'badge-check': BadgeCheck,
  'calendar-clock': CalendarClock,
  headphones: Headphones,
  'package-check': PackageCheck,
  'shield-check': ShieldCheck,
  truck: Truck,
  users: Users2,
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
  const logo = brandQuery.data?.brandAssets?.primaryLogoUrl || brandQuery.data?.brandLogo;
  const experience: AccountPortalExperience = brandQuery.data?.accountPortalExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE;
  const page = experience[surface];
  const theme = experience.theme;
  const layout = page.enabled ? page.layout : 'centered';
  const brandTitle = page.heroBrandTitle || name;
  const brandSubtitle = page.heroBrandSubtitle || 'Company Portal';
  const brandBackground = page.panelGradientEnabled
    ? `linear-gradient(${page.panelGradientAngle}deg, ${page.panelGradientFrom} 0%, ${page.panelGradientTo} 100%)`
    : theme.primaryColor;
  const style = {
    '--portal-primary': theme.primaryColor,
    '--portal-accent': theme.accentColor,
    '--portal-page-bg': theme.pageBackground,
    '--portal-panel-bg': theme.panelBackground,
    '--portal-text': theme.textColor,
    '--portal-muted': theme.mutedTextColor,
    '--auth-brand-background': brandBackground,
    '--auth-brand-header-text': page.panelGradientEnabled && isLightColor(page.panelGradientFrom) ? '#172033' : '#ffffff',
  } as CSSProperties;

  return (
    <main className={`auth-page portal-density-${theme.density} portal-radius-${theme.radius}`} style={style}>
      <div className={`auth-stage auth-layout-${layout}`}>
        {layout === 'split' ? (
          <section className="auth-brand-panel" aria-label={`${name} account workspace`}>
            <div>
              <div className="auth-brand-row">
                {page.showHeroLogo && logo ? (
                  <div className="auth-brand-logo"><img src={logo} alt={name} className="auth-brand-mark-img" /></div>
                ) : page.showHeroBadge ? (
                  <div className="auth-brand-mark">{badge.charAt(0)}</div>
                ) : null}
                <div className="auth-brand-name"><span>{brandTitle}</span><small>{brandSubtitle}</small></div>
              </div>
              <div className="auth-brand-copy">
                {page.eyebrow ? <span className="auth-eyebrow">{page.eyebrow}</span> : null}
                <h1>{page.headline}</h1>
                <p>{page.description}</p>
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
          <p className="auth-footer">&copy; {new Date().getFullYear()} {name}. All rights reserved.</p>
        </section>
      </div>
    </main>
  );
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
