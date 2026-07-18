import type { AccountPortalPage } from '@factory-engine-pro/contracts';

const PREVIEW_SCALE = 0.58;

export interface AccountPortalComposition {
  canvas: {
    heightMode: 'content' | 'viewport' | 'fixed';
    pagePadding: number;
    stageWidth: number;
    stageHeight: number;
    pageVerticalAlignment: 'top' | 'center';
    heroPanelPercent: number;
    stageCornerRadius: number;
    stageBorderWidth: number;
    stageShadowBlur: number;
    stageShadowOpacity: number;
  };
  hero: {
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    brandGap: number;
    brandToIntroGap: number;
    eyebrowToHeadlineGap: number;
    headlineToDescriptionGap: number;
    introToBenefitsGap: number;
    benefitRowGap: number;
    trustTopGap: number;
  };
  form: {
    paddingTop: number;
    paddingRight: number;
    paddingBottom: number;
    paddingLeft: number;
    brandBottomGap: number;
    headingBottomGap: number;
    noticeBottomGap: number;
    fieldRowGap: number;
    fieldColumnGap: number;
    labelGap: number;
    inputPaddingY: number;
    inputPaddingX: number;
    buttonHeight: number;
    buttonTopGap: number;
    signinTopGap: number;
    textareaRows: number;
  };
  mobile: {
    pagePadding: number;
    heroVisible: boolean;
    formPaddingTop: number;
    formPaddingRight: number;
    formPaddingBottom: number;
    formPaddingLeft: number;
  };
}

export function resolveAccountPortalComposition(
  page: AccountPortalPage,
  options: { preview?: boolean } = {},
): AccountPortalComposition {
  const scale = options.preview ? PREVIEW_SCALE : 1;
  const legacyHeroPadding = heroPaddingFallback(page.heroPadding);
  const legacyContentGap = heroGapFallback(page.heroContentGap);
  const legacyBenefitGap = page.benefitDensity === 'compact' ? 10 : 16;

  return {
    canvas: {
      heightMode: page.desktopFit ? finiteEnum(page.desktopHeightMode, ['viewport', 'fixed'], 'fixed') : 'content',
      pagePadding: scaled(page.desktopPagePadding, 40, 0, 80, scale),
      stageWidth: scaled(page.desktopStageWidth, 1120, 680, 1440, scale),
      stageHeight: scaled(page.desktopStageHeight, 680, 560, 900, scale),
      pageVerticalAlignment: page.pageVerticalAlignment === 'top' ? 'top' : 'center',
      heroPanelPercent: integer(page.heroPanelPercent, heroPanelPercentFallback(page.heroPanelWidth), 25, 60),
      stageCornerRadius: scaled(page.stageCornerRadius, 8, 0, 32, scale),
      stageBorderWidth: integer(page.stageBorderWidth, 1, 0, 4),
      stageShadowBlur: scaled(page.stageShadowBlur, 40, 0, 100, scale),
      stageShadowOpacity: integer(page.stageShadowOpacity, 14, 0, 30),
    },
    hero: {
      paddingTop: scaled(page.heroPaddingTop, legacyHeroPadding.vertical, 0, 160, scale),
      paddingRight: scaled(page.heroPaddingRight, legacyHeroPadding.horizontal, 0, 160, scale),
      paddingBottom: scaled(page.heroPaddingBottom, legacyHeroPadding.vertical, 0, 160, scale),
      paddingLeft: scaled(page.heroPaddingLeft, legacyHeroPadding.horizontal, 0, 160, scale),
      brandGap: scaled(page.heroBrandGap, 14, 0, 80, scale),
      brandToIntroGap: scaled(page.heroBrandToIntroGap, legacyContentGap, 0, 160, scale),
      eyebrowToHeadlineGap: scaled(page.heroEyebrowToHeadlineGap, 10, 0, 80, scale),
      headlineToDescriptionGap: scaled(page.heroHeadlineToDescriptionGap, 8, 0, 80, scale),
      introToBenefitsGap: scaled(page.heroIntroToBenefitsGap, legacyContentGap, 0, 240, scale),
      benefitRowGap: scaled(page.heroBenefitRowGap, legacyBenefitGap, 0, 80, scale),
      trustTopGap: scaled(page.heroTrustTopGap, 20, 0, 120, scale),
    },
    form: {
      paddingTop: scaled(page.formPaddingTop, 38, 0, 160, scale),
      paddingRight: scaled(page.formPaddingRight, 38, 0, 160, scale),
      paddingBottom: scaled(page.formPaddingBottom, 38, 0, 160, scale),
      paddingLeft: scaled(page.formPaddingLeft, 38, 0, 160, scale),
      brandBottomGap: scaled(page.formBrandBottomGap, 22, 0, 100, scale),
      headingBottomGap: scaled(page.formHeadingBottomGap, 20, 0, 100, scale),
      noticeBottomGap: scaled(page.formNoticeBottomGap, 12, 0, 80, scale),
      fieldRowGap: scaled(page.formFieldRowGap, 14, 0, 48, scale),
      fieldColumnGap: scaled(page.formFieldColumnGap, 14, 0, 48, scale),
      labelGap: scaled(page.formLabelGap, 6, 0, 24, scale),
      inputPaddingY: scaled(page.formInputPaddingY, 10, 2, 24, scale),
      inputPaddingX: scaled(page.formInputPaddingX, 14, 4, 32, scale),
      buttonHeight: scaled(page.formButtonHeight, 46, 32, 64, scale),
      buttonTopGap: scaled(page.formButtonTopGap, 22, 0, 64, scale),
      signinTopGap: scaled(page.formSigninTopGap, 16, 0, 48, scale),
      textareaRows: integer(page.formTextareaRows, 3, 2, 8),
    },
    mobile: {
      pagePadding: scaled(page.mobilePagePadding, 16, 0, 40, scale),
      heroVisible: page.mobileHeroVisible === true,
      formPaddingTop: scaled(page.mobileFormPaddingTop, 28, 0, 80, scale),
      formPaddingRight: scaled(page.mobileFormPaddingRight, 22, 0, 80, scale),
      formPaddingBottom: scaled(page.mobileFormPaddingBottom, 28, 0, 80, scale),
      formPaddingLeft: scaled(page.mobileFormPaddingLeft, 22, 0, 80, scale),
    },
  };
}

function heroPanelPercentFallback(value: AccountPortalPage['heroPanelWidth']) {
  if (value === 'narrow') return 33;
  if (value === 'wide') return 46;
  return 38;
}

function heroPaddingFallback(value: AccountPortalPage['heroPadding']) {
  if (value === 'compact') return { vertical: 26, horizontal: 28 };
  if (value === 'spacious') return { vertical: 52, horizontal: 42 };
  return { vertical: 38, horizontal: 34 };
}

function heroGapFallback(value: AccountPortalPage['heroContentGap']) {
  if (value === 'tight') return 14;
  if (value === 'open') return 38;
  return 24;
}

function scaled(value: unknown, fallback: number, min: number, max: number, scale: number) {
  return Math.round(integer(value, fallback, min, max) * scale);
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function finiteEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}
