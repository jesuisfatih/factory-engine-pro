import type { CSSProperties, ReactNode } from 'react';
import {
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  resolveBrandLogoUrl,
  type AccountPortalExperience,
} from '@factory-engine-pro/contracts';
import { AccountPortalHero, resolveAccountPortalComposition } from '@factory-engine-pro/ui';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '@/lib/workspace-brand';

type PortalSurface = 'login' | 'register';

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
  const composition = resolveAccountPortalComposition(page);
  const layout = page.enabled ? page.layout : 'centered';
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
    '--portal-desktop-stage-height': `${page.desktopStageHeight}px`,
    '--portal-page-padding': `${composition.canvas.pagePadding}px`,
    '--portal-stage-width': `${composition.canvas.stageWidth}px`,
    '--portal-stage-height': `${composition.canvas.stageHeight}px`,
    '--portal-hero-panel-percent': `${composition.canvas.heroPanelPercent}%`,
    '--portal-stage-corner-radius': `${composition.canvas.stageCornerRadius}px`,
    '--portal-stage-border-width': `${composition.canvas.stageBorderWidth}px`,
    '--portal-stage-shadow': composition.canvas.stageShadowBlur > 0 && composition.canvas.stageShadowOpacity > 0
      ? `0 ${Math.max(4, Math.round(composition.canvas.stageShadowBlur / 2))}px ${composition.canvas.stageShadowBlur}px rgba(15, 23, 42, ${composition.canvas.stageShadowOpacity / 100})`
      : 'none',
    '--portal-form-padding-top': `${composition.form.paddingTop}px`,
    '--portal-form-padding-right': `${composition.form.paddingRight}px`,
    '--portal-form-padding-bottom': `${composition.form.paddingBottom}px`,
    '--portal-form-padding-left': `${composition.form.paddingLeft}px`,
    '--portal-mobile-page-padding': `${composition.mobile.pagePadding}px`,
    '--portal-mobile-form-padding-top': `${composition.mobile.formPaddingTop}px`,
    '--portal-mobile-form-padding-right': `${composition.mobile.formPaddingRight}px`,
    '--portal-mobile-form-padding-bottom': `${composition.mobile.formPaddingBottom}px`,
    '--portal-mobile-form-padding-left': `${composition.mobile.formPaddingLeft}px`,
  } as CSSProperties;

  return (
    <main className={`auth-page auth-height-${composition.canvas.heightMode} portal-density-${theme.density} portal-radius-${theme.radius} ${composition.canvas.heightMode !== 'content' ? 'auth-desktop-fit' : ''}${composition.mobile.heroVisible ? '' : ' auth-mobile-hero-hidden'}`} style={{ ...style, alignItems: composition.canvas.pageVerticalAlignment === 'top' ? 'start' : 'center' }}>
      <div className={`auth-stage auth-layout-${layout}`}>
        {layout === 'split' ? (
          <AccountPortalHero
            className="auth-brand-panel"
            page={page}
            surface={surface}
            workspaceName={name}
            brandBadge={badge}
            brandLogo={logo}
            primaryColor={theme.primaryColor}
          />
        ) : null}

        <section
          className="auth-form-panel"
          aria-label={formLabel}
          style={{ justifyContent: page.formVerticalAlignment === 'top' ? 'flex-start' : 'center' }}
        >
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
