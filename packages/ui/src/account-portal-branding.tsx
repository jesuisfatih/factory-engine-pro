import type { CSSProperties } from 'react';
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
import type { AccountPortalIcon, AccountPortalPage } from '@factory-engine-pro/contracts';
import { resolveAccountPortalComposition } from './account-portal-composition.js';

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

export type AccountPortalSurface = 'login' | 'register' | 'requestAccess';

export function AccountPortalIconView({ name, size = 18 }: { name: AccountPortalIcon; size?: number }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" size={size} />;
}

export function AccountPortalHero({
  page,
  surface,
  workspaceName,
  brandBadge,
  brandLogo,
  primaryColor,
  preview = false,
  className = '',
  style,
}: {
  page: AccountPortalPage;
  surface: AccountPortalSurface;
  workspaceName: string;
  brandBadge: string;
  brandLogo?: string | null;
  primaryColor: string;
  preview?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const compact = preview;
  const introColor = isLightColor(page.panelGradientEnabled ? page.panelGradientFrom : primaryColor) ? '#172033' : '#FFFFFF';
  const lowerColor = isLightColor(page.panelGradientEnabled ? page.panelGradientTo : primaryColor) ? '#172033' : '#FFFFFF';
  const headline = page.headline;
  const brandTitle = page.heroBrandTitle || workspaceName;
  const logoSize = heroLogoDimensions(page.heroLogoSize, compact);
  const composition = resolveAccountPortalComposition(page, { preview: compact });
  const hero = composition.hero;
  const brandLayout = page.heroBrandLayout ?? 'inline';
  const center = page.heroBrandAlignment === 'center';
  const benefitIconSize = page.benefitDensity === 'compact' ? (compact ? 28 : 34) : (compact ? 34 : 42);
  const background = portalHeroBackground(page, primaryColor);

  return (
    <section
      className={`account-portal-hero-shared ${className}`.trim()}
      style={{
        position: 'relative',
        isolation: 'isolate',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: page.heroVerticalAlignment === 'top' ? 'flex-start' : 'center',
        padding: `${hero.paddingTop}px ${hero.paddingRight}px ${hero.paddingBottom}px ${hero.paddingLeft}px`,
        color: introColor,
        backgroundImage: background.image,
        backgroundColor: background.color,
        backgroundSize: background.size,
        overflow: 'hidden',
        ...style,
      }}
      data-portal-surface={surface}
      data-brand-layout={brandLayout}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: brandLayout === 'stacked' ? 'column' : 'row',
          alignItems: brandLayout === 'stacked' && !center ? 'flex-start' : 'center',
          justifyContent: center ? 'center' : 'flex-start',
          gap: hero.brandGap,
          width: '100%',
          minWidth: 0,
          textAlign: center ? 'center' : 'left',
        }}
      >
        {page.showHeroLogo && brandLogo ? (
          <span style={{ width: logoSize.width, height: logoSize.height, maxWidth: '62%', display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', flex: '0 1 auto' }}>
            <img
              src={brandLogo}
              alt={workspaceName}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: center ? 'center' : 'left center' }}
            />
          </span>
        ) : page.showHeroBadge ? (
          <span style={{ minWidth: compact ? 34 : 44, height: compact ? 34 : 44, paddingInline: compact ? 7 : 10, display: 'grid', placeItems: 'center', borderRadius: compact ? 6 : 8, background: introColor, color: isLightColor(introColor) ? primaryColor : '#FFFFFF', fontSize: compact ? 11 : 14, fontWeight: 800 }}>
            {brandBadge}
          </span>
        ) : null}
        {page.showHeroBrandText ? (
          <strong style={{ display: 'block', minWidth: 0, color: introColor, fontSize: page.heroBrandSize === 'large' ? (compact ? 13 : 26) : (compact ? 11 : 22), lineHeight: 1.22, fontWeight: 700 }}>
            {brandTitle}
            {page.heroBrandSubtitle ? <small style={{ display: 'block', marginTop: compact ? 2 : 3, opacity: 0.72, fontSize: page.heroBrandSize === 'large' ? (compact ? 9 : 15) : (compact ? 8 : 13), fontWeight: 600 }}>{page.heroBrandSubtitle}</small> : null}
          </strong>
        ) : null}
      </div>

      <div style={{ width: '100%', marginTop: hero.brandToIntroGap, textAlign: center ? 'center' : 'left' }}>
        {page.showEyebrow && page.eyebrow ? <small style={{ display: 'block', color: introColor, opacity: 0.8, fontSize: compact ? 8 : 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: compact ? 0 : 0.4 }}>{page.eyebrow}</small> : null}
        {page.showHeroHeadline ? <h1 style={{ maxWidth: center ? '100%' : compact ? 250 : 460, margin: `${page.showEyebrow && page.eyebrow ? hero.eyebrowToHeadlineGap : 0}px ${center ? 'auto' : 0} 0`, color: introColor, fontSize: page.heroBrandSize === 'large' ? (compact ? 21 : 30) : (compact ? 18 : 24), lineHeight: 1.24, fontWeight: 700, letterSpacing: 0 }}>{headline}</h1> : null}
        {page.showHeroDescription ? <p style={{ maxWidth: center ? (compact ? 300 : 500) : compact ? 270 : 480, margin: `${page.showHeroHeadline ? hero.headlineToDescriptionGap : 0}px ${center ? 'auto' : 0} 0`, color: introColor, opacity: 0.78, fontSize: page.heroBrandSize === 'large' ? (compact ? 11 : 15) : (compact ? 10 : 14), lineHeight: 1.5 }}>{page.description}</p> : null}
      </div>

      {page.showBenefits && page.benefits.length ? (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: hero.benefitRowGap, marginTop: page.benefitsPlacement === 'lower' ? 'auto' : hero.introToBenefitsGap, color: lowerColor }}>
          {page.benefits.map((benefit) => (
            <div key={`${benefit.title}-${benefit.body}`} style={{ display: 'grid', gridTemplateColumns: `${benefitIconSize}px minmax(0, 1fr)`, gap: compact ? 9 : 12, alignItems: 'center', textAlign: 'left' }}>
              <span style={{ width: benefitIconSize, height: benefitIconSize, display: 'grid', placeItems: 'center', borderRadius: page.benefitDensity === 'compact' ? (compact ? 7 : 8) : (compact ? 9 : 12), background: isLightColor(lowerColor) ? 'rgba(8,31,111,0.10)' : 'rgba(255,255,255,0.18)', flexShrink: 0 }}>
                <AccountPortalIconView name={benefit.icon} size={compact ? 17 : 20} />
              </span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: page.benefitDensity === 'compact' ? (compact ? 9 : 13) : (compact ? 10 : 14), lineHeight: 1.25 }}>{benefit.title}</b>
                <small style={{ display: 'block', marginTop: 2, opacity: 0.75, fontSize: page.benefitDensity === 'compact' ? (compact ? 8 : 11) : (compact ? 8 : 12), lineHeight: 1.35 }}>{benefit.body}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {page.showTrustItems && page.trustItems.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: center ? 'center' : 'flex-start', gap: compact ? 5 : 8, marginTop: hero.trustTopGap, color: lowerColor }}>
          {page.trustItems.map((item) => (
            <span key={`${item.icon}-${item.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 4 : 6, padding: compact ? '4px 6px' : '6px 8px', borderRadius: compact ? 4 : 8, background: isLightColor(lowerColor) ? 'rgba(8,31,111,0.08)' : 'rgba(255,255,255,0.10)', fontSize: compact ? 7 : 11, fontWeight: 700 }}>
              <AccountPortalIconView name={item.icon} size={compact ? 10 : 13} />{item.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function AccountPortalFormBrand({
  page,
  workspaceName,
  brandBadge,
  brandLogo,
  preview = false,
}: {
  page: AccountPortalPage;
  workspaceName: string;
  brandBadge: string;
  brandLogo?: string | null;
  preview?: boolean;
}) {
  if (page.formBrandMode === 'hidden') return null;
  const composition = resolveAccountPortalComposition(page, { preview });
  const center = (page.formBrandAlignment ?? 'center') === 'center';
  const logoSize = formLogoDimensions(page.formLogoSize ?? 'standard', preview);
  const logo = brandLogo ? (
    <img src={brandLogo} alt={workspaceName} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: center ? 'center' : 'left center' }} />
  ) : (
    <span style={{ minWidth: preview ? 32 : 42, height: preview ? 32 : 42, paddingInline: preview ? 6 : 9, display: 'grid', placeItems: 'center', borderRadius: preview ? 5 : 7, background: '#081F6F', color: '#FFFFFF', fontSize: preview ? 10 : 13, fontWeight: 800 }}>{brandBadge}</span>
  );

  if (page.formBrandMode === 'logo') {
    return <div style={{ width: '100%', display: 'flex', justifyContent: center ? 'center' : 'flex-start', marginBottom: composition.form.brandBottomGap }}><span style={{ width: logoSize.width, height: logoSize.height, maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start' }}>{logo}</span></div>;
  }

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', gap: preview ? 8 : 12, marginBottom: composition.form.brandBottomGap, textAlign: center ? 'center' : 'left' }}>
      <span style={{ width: Math.min(logoSize.width, preview ? 100 : 150), height: logoSize.height, maxWidth: '45%', display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start' }}>{logo}</span>
      <strong style={{ minWidth: 0, fontSize: preview ? 10 : 15, lineHeight: 1.2 }}>{page.heroBrandTitle || workspaceName}<small style={{ display: 'block', marginTop: 2, opacity: 0.64, fontSize: preview ? 8 : 12, fontWeight: 500 }}>{page.heroBrandSubtitle}</small></strong>
    </div>
  );
}

function heroLogoDimensions(size: AccountPortalPage['heroLogoSize'], preview: boolean) {
  if (size === 'large') return preview ? { width: 154, height: 64 } : { width: 196, height: 78 };
  return preview ? { width: 118, height: 46 } : { width: 150, height: 58 };
}

function formLogoDimensions(size: AccountPortalPage['formLogoSize'], preview: boolean) {
  if (size === 'large') return preview ? { width: 180, height: 62 } : { width: 280, height: 82 };
  if (size === 'compact') return preview ? { width: 100, height: 38 } : { width: 160, height: 52 };
  return preview ? { width: 140, height: 50 } : { width: 220, height: 72 };
}

function portalHeroBackground(page: AccountPortalPage, primaryColor: string) {
  const base = page.panelGradientEnabled
    ? `linear-gradient(${page.panelGradientAngle}deg, ${page.panelGradientFrom} 0%, ${page.panelGradientTo} 100%)`
    : `linear-gradient(160deg, ${primaryColor} 0%, ${darkenHex(primaryColor, 0.15)} 60%, ${darkenHex(primaryColor, 0.3)} 100%)`;
  if (page.heroPattern !== 'grid') return { image: base, color: primaryColor, size: undefined };
  const opacity = page.heroPatternOpacity / 100;
  return {
    image: `linear-gradient(90deg, rgba(255,255,255,${opacity}) 1px, transparent 1px), linear-gradient(rgba(255,255,255,${opacity}) 1px, transparent 1px), ${base}`,
    color: primaryColor,
    size: '36px 36px, 36px 36px, auto',
  };
}

function darkenHex(hex: string, amount: number) {
  const value = normalizeHex(hex, '#081F6F').slice(1);
  const channels = [0, 2, 4].map((offset) => Math.max(0, Math.round(Number.parseInt(value.slice(offset, offset + 2), 16) * (1 - amount))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeHex(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function isLightColor(value: string) {
  const normalized = normalizeHex(value, '#081F6F').slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 180;
}
