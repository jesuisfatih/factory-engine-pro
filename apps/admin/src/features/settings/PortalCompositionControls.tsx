import { useState } from 'react';
import { Columns3, FormInput, Frame, Smartphone } from 'lucide-react';
import type { AccountPortalPage } from '@factory-engine-pro/contracts';

type CompositionTab = 'canvas' | 'hero' | 'form' | 'mobile';

export function PortalCompositionControls({
  page,
  disabled,
  onChange,
}: {
  page: AccountPortalPage;
  disabled: boolean;
  onChange: (next: AccountPortalPage) => void;
}) {
  const [tab, setTab] = useState<CompositionTab>('canvas');
  const setField = <K extends keyof AccountPortalPage>(field: K, value: AccountPortalPage[K]) => {
    onChange({ ...page, [field]: value });
  };
  const setFields = (values: Partial<AccountPortalPage>) => onChange({ ...page, ...values });

  return (
    <div className="portal-composition-controls">
      <div className="portal-control-title portal-control-title-row">
        <span>Canvas and spacing</span>
        <div className="portal-layout-presets" aria-label="Layout presets">
          <button type="button" disabled={disabled} onClick={() => setFields(compactPreset())}>Compact</button>
          <button type="button" disabled={disabled} onClick={() => setFields(balancedPreset())}>Balanced</button>
          <button type="button" disabled={disabled} onClick={() => setFields(showcasePreset())}>Showcase</button>
        </div>
      </div>
      <p className="portal-composition-help">Presets are a starting point. Every measurement below is saved separately for this page.</p>

      <div className="portal-composition-tabs" role="tablist" aria-label="Portal composition settings">
        <button type="button" role="tab" aria-selected={tab === 'canvas'} className={tab === 'canvas' ? 'active' : ''} onClick={() => setTab('canvas')}><Frame size={14} /> Canvas</button>
        <button type="button" role="tab" aria-selected={tab === 'hero'} className={tab === 'hero' ? 'active' : ''} onClick={() => setTab('hero')}><Columns3 size={14} /> Hero</button>
        <button type="button" role="tab" aria-selected={tab === 'form'} className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}><FormInput size={14} /> Form</button>
        <button type="button" role="tab" aria-selected={tab === 'mobile'} className={tab === 'mobile' ? 'active' : ''} onClick={() => setTab('mobile')}><Smartphone size={14} /> Mobile</button>
      </div>

      {tab === 'canvas' ? (
        <div className="portal-composition-panel" role="tabpanel">
          <div className="field-row">
            <div className="field">
              <label htmlFor="portal-height-mode">Desktop height behavior</label>
              <select
                id="portal-height-mode"
                value={page.desktopFit ? page.desktopHeightMode : 'content'}
                disabled={disabled}
                onChange={(event) => {
                  const mode = event.target.value as AccountPortalPage['desktopHeightMode'];
                  setFields({ desktopHeightMode: mode, desktopFit: mode !== 'content' });
                }}
              >
                <option value="content">Grow with content</option>
                <option value="viewport">Fill browser height</option>
                <option value="fixed">Fixed canvas height</option>
              </select>
              <small>Mobile always grows naturally.</small>
            </div>
            <div className="field">
              <label htmlFor="portal-page-alignment">Page position</label>
              <select id="portal-page-alignment" value={page.pageVerticalAlignment} disabled={disabled} onChange={(event) => setField('pageVerticalAlignment', event.target.value as AccountPortalPage['pageVerticalAlignment'])}>
                <option value="top">Top</option>
                <option value="center">Centered</option>
              </select>
            </div>
          </div>
          <NumberSetting label="Page edge space" value={page.desktopPagePadding} min={0} max={80} step={2} disabled={disabled} onChange={(value) => setField('desktopPagePadding', value)} />
          <NumberSetting label="Canvas width" value={page.desktopStageWidth} min={680} max={1440} step={10} disabled={disabled} onChange={(value) => setField('desktopStageWidth', value)} />
          <NumberSetting label={page.desktopHeightMode === 'fixed' ? 'Fixed canvas height' : 'Preview reference height'} value={page.desktopStageHeight} min={560} max={900} step={10} disabled={disabled} onChange={(value) => setField('desktopStageHeight', value)} />
          <div className="portal-measure-grid">
            <NumberSetting label="Hero panel width" value={page.heroPanelPercent} min={25} max={60} unit="%" disabled={disabled} onChange={(value) => setField('heroPanelPercent', value)} />
            <NumberSetting label="Canvas corner radius" value={page.stageCornerRadius} min={0} max={32} disabled={disabled} onChange={(value) => setField('stageCornerRadius', value)} />
            <NumberSetting label="Canvas border width" value={page.stageBorderWidth} min={0} max={4} disabled={disabled} onChange={(value) => setField('stageBorderWidth', value)} />
            <NumberSetting label="Shadow blur" value={page.stageShadowBlur} min={0} max={100} step={2} disabled={disabled} onChange={(value) => setField('stageShadowBlur', value)} />
            <NumberSetting label="Shadow opacity" value={page.stageShadowOpacity} min={0} max={30} unit="%" disabled={disabled} onChange={(value) => setField('stageShadowOpacity', value)} />
          </div>
        </div>
      ) : null}

      {tab === 'hero' ? (
        <div className="portal-composition-panel" role="tabpanel">
          <div className="field-row">
            <div className="field">
              <label htmlFor="portal-hero-position">Content position</label>
              <select id="portal-hero-position" value={page.heroVerticalAlignment} disabled={disabled} onChange={(event) => setField('heroVerticalAlignment', event.target.value as AccountPortalPage['heroVerticalAlignment'])}>
                <option value="top">Top</option><option value="center">Centered</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="portal-benefit-placement">Benefit placement</label>
              <select id="portal-benefit-placement" value={page.benefitsPlacement} disabled={disabled} onChange={(event) => setField('benefitsPlacement', event.target.value as AccountPortalPage['benefitsPlacement'])}>
                <option value="flow">Exact gap after intro</option><option value="lower">Push to bottom</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="portal-benefit-density">Benefit density</label>
              <select id="portal-benefit-density" value={page.benefitDensity} disabled={disabled} onChange={(event) => setField('benefitDensity', event.target.value as AccountPortalPage['benefitDensity'])}>
                <option value="compact">Compact</option><option value="standard">Standard</option>
              </select>
            </div>
          </div>
          <div className="portal-measure-grid">
            <NumberSetting label="Padding top" value={page.heroPaddingTop} min={0} max={160} disabled={disabled} onChange={(value) => setField('heroPaddingTop', value)} />
            <NumberSetting label="Padding right" value={page.heroPaddingRight} min={0} max={160} disabled={disabled} onChange={(value) => setField('heroPaddingRight', value)} />
            <NumberSetting label="Padding bottom" value={page.heroPaddingBottom} min={0} max={160} disabled={disabled} onChange={(value) => setField('heroPaddingBottom', value)} />
            <NumberSetting label="Padding left" value={page.heroPaddingLeft} min={0} max={160} disabled={disabled} onChange={(value) => setField('heroPaddingLeft', value)} />
            <NumberSetting label="Logo to brand text" value={page.heroBrandGap} min={0} max={80} disabled={disabled} onChange={(value) => setField('heroBrandGap', value)} />
            <NumberSetting label="Brand to intro" value={page.heroBrandToIntroGap} min={0} max={160} disabled={disabled} onChange={(value) => setField('heroBrandToIntroGap', value)} />
            <NumberSetting label="Eyebrow to headline" value={page.heroEyebrowToHeadlineGap} min={0} max={80} disabled={disabled} onChange={(value) => setField('heroEyebrowToHeadlineGap', value)} />
            <NumberSetting label="Headline to description" value={page.heroHeadlineToDescriptionGap} min={0} max={80} disabled={disabled} onChange={(value) => setField('heroHeadlineToDescriptionGap', value)} />
            <NumberSetting label="Intro to benefits" value={page.heroIntroToBenefitsGap} min={0} max={240} disabled={disabled} onChange={(value) => setField('heroIntroToBenefitsGap', value)} />
            <NumberSetting label="Between benefit rows" value={page.heroBenefitRowGap} min={0} max={80} disabled={disabled} onChange={(value) => setField('heroBenefitRowGap', value)} />
            <NumberSetting label="Benefits to trust strip" value={page.heroTrustTopGap} min={0} max={120} disabled={disabled} onChange={(value) => setField('heroTrustTopGap', value)} />
          </div>
        </div>
      ) : null}

      {tab === 'form' ? (
        <div className="portal-composition-panel" role="tabpanel">
          <div className="field">
            <label htmlFor="portal-form-position">Content position</label>
            <select id="portal-form-position" value={page.formVerticalAlignment} disabled={disabled} onChange={(event) => setField('formVerticalAlignment', event.target.value as AccountPortalPage['formVerticalAlignment'])}>
              <option value="top">Top</option><option value="center">Centered</option>
            </select>
          </div>
          <div className="portal-measure-grid">
            <NumberSetting label="Padding top" value={page.formPaddingTop} min={0} max={160} disabled={disabled} onChange={(value) => setField('formPaddingTop', value)} />
            <NumberSetting label="Padding right" value={page.formPaddingRight} min={0} max={160} disabled={disabled} onChange={(value) => setField('formPaddingRight', value)} />
            <NumberSetting label="Padding bottom" value={page.formPaddingBottom} min={0} max={160} disabled={disabled} onChange={(value) => setField('formPaddingBottom', value)} />
            <NumberSetting label="Padding left" value={page.formPaddingLeft} min={0} max={160} disabled={disabled} onChange={(value) => setField('formPaddingLeft', value)} />
            <NumberSetting label="Brand to heading" value={page.formBrandBottomGap} min={0} max={100} disabled={disabled} onChange={(value) => setField('formBrandBottomGap', value)} />
            <NumberSetting label="Heading to form" value={page.formHeadingBottomGap} min={0} max={100} disabled={disabled} onChange={(value) => setField('formHeadingBottomGap', value)} />
            <NumberSetting label="Notice to fields" value={page.formNoticeBottomGap} min={0} max={80} disabled={disabled} onChange={(value) => setField('formNoticeBottomGap', value)} />
            <NumberSetting label="Between field rows" value={page.formFieldRowGap} min={0} max={48} disabled={disabled} onChange={(value) => setField('formFieldRowGap', value)} />
            <NumberSetting label="Between field columns" value={page.formFieldColumnGap} min={0} max={48} disabled={disabled} onChange={(value) => setField('formFieldColumnGap', value)} />
            <NumberSetting label="Label to input" value={page.formLabelGap} min={0} max={24} disabled={disabled} onChange={(value) => setField('formLabelGap', value)} />
            <NumberSetting label="Input vertical padding" value={page.formInputPaddingY} min={2} max={24} disabled={disabled} onChange={(value) => setField('formInputPaddingY', value)} />
            <NumberSetting label="Input side padding" value={page.formInputPaddingX} min={4} max={32} disabled={disabled} onChange={(value) => setField('formInputPaddingX', value)} />
            <NumberSetting label="Button height" value={page.formButtonHeight} min={32} max={64} disabled={disabled} onChange={(value) => setField('formButtonHeight', value)} />
            <NumberSetting label="Fields to button" value={page.formButtonTopGap} min={0} max={64} disabled={disabled} onChange={(value) => setField('formButtonTopGap', value)} />
            <NumberSetting label="Button to sign in" value={page.formSigninTopGap} min={0} max={48} disabled={disabled} onChange={(value) => setField('formSigninTopGap', value)} />
            <NumberSetting label="Textarea rows" value={page.formTextareaRows} min={2} max={8} disabled={disabled} onChange={(value) => setField('formTextareaRows', value)} />
          </div>
        </div>
      ) : null}

      {tab === 'mobile' ? (
        <div className="portal-composition-panel" role="tabpanel">
          <label className="portal-inline-check portal-mobile-hero-toggle">
            <input type="checkbox" checked={page.mobileHeroVisible} disabled={disabled} onChange={(event) => setField('mobileHeroVisible', event.target.checked)} />
            Show hero panel above the form on mobile
          </label>
          <p className="portal-composition-help">Mobile always grows with its content. These values are independent from desktop spacing.</p>
          <div className="portal-measure-grid">
            <NumberSetting label="Page edge space" value={page.mobilePagePadding} min={0} max={40} disabled={disabled} onChange={(value) => setField('mobilePagePadding', value)} />
            <NumberSetting label="Form padding top" value={page.mobileFormPaddingTop} min={0} max={80} disabled={disabled} onChange={(value) => setField('mobileFormPaddingTop', value)} />
            <NumberSetting label="Form padding right" value={page.mobileFormPaddingRight} min={0} max={80} disabled={disabled} onChange={(value) => setField('mobileFormPaddingRight', value)} />
            <NumberSetting label="Form padding bottom" value={page.mobileFormPaddingBottom} min={0} max={80} disabled={disabled} onChange={(value) => setField('mobileFormPaddingBottom', value)} />
            <NumberSetting label="Form padding left" value={page.mobileFormPaddingLeft} min={0} max={80} disabled={disabled} onChange={(value) => setField('mobileFormPaddingLeft', value)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  step = 1,
  unit = 'px',
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, Math.round(parsed))));
  };
  return (
    <label className="portal-number-setting">
      <span>{label}</span>
      <div>
        <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onInput={(event) => commit(event.currentTarget.value)} onChange={(event) => commit(event.currentTarget.value)} />
        <input type="number" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => commit(event.currentTarget.value)} />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function compactPreset(): Partial<AccountPortalPage> {
  return {
    desktopFit: false,
    desktopHeightMode: 'content',
    desktopPagePadding: 12,
    desktopStageWidth: 980,
    desktopStageHeight: 620,
    pageVerticalAlignment: 'center',
    heroPanelPercent: 38,
    stageCornerRadius: 8,
    stageBorderWidth: 1,
    stageShadowBlur: 32,
    stageShadowOpacity: 12,
    heroVerticalAlignment: 'top',
    heroPadding: 'compact',
    heroContentGap: 'tight',
    benefitDensity: 'compact',
    benefitsPlacement: 'flow',
    heroPaddingTop: 24,
    heroPaddingRight: 28,
    heroPaddingBottom: 24,
    heroPaddingLeft: 28,
    heroBrandGap: 10,
    heroBrandToIntroGap: 16,
    heroEyebrowToHeadlineGap: 7,
    heroHeadlineToDescriptionGap: 6,
    heroIntroToBenefitsGap: 16,
    heroBenefitRowGap: 10,
    heroTrustTopGap: 10,
    formVerticalAlignment: 'top',
    formPaddingTop: 12,
    formPaddingRight: 24,
    formPaddingBottom: 12,
    formPaddingLeft: 24,
    formBrandBottomGap: 8,
    formHeadingBottomGap: 8,
    formNoticeBottomGap: 7,
    formFieldRowGap: 7,
    formFieldColumnGap: 8,
    formLabelGap: 2,
    formInputPaddingY: 4,
    formInputPaddingX: 10,
    formButtonHeight: 36,
    formButtonTopGap: 8,
    formSigninTopGap: 5,
    formTextareaRows: 2,
    mobilePagePadding: 12,
    mobileHeroVisible: false,
    mobileFormPaddingTop: 20,
    mobileFormPaddingRight: 18,
    mobileFormPaddingBottom: 20,
    mobileFormPaddingLeft: 18,
  };
}

function balancedPreset(): Partial<AccountPortalPage> {
  return {
    desktopFit: true,
    desktopHeightMode: 'viewport',
    desktopPagePadding: 20,
    desktopStageWidth: 1120,
    desktopStageHeight: 680,
    pageVerticalAlignment: 'center',
    heroPanelPercent: 38,
    stageCornerRadius: 8,
    stageBorderWidth: 1,
    stageShadowBlur: 40,
    stageShadowOpacity: 14,
    heroVerticalAlignment: 'center',
    heroPadding: 'standard',
    heroContentGap: 'standard',
    benefitDensity: 'standard',
    benefitsPlacement: 'flow',
    heroPaddingTop: 38,
    heroPaddingRight: 34,
    heroPaddingBottom: 38,
    heroPaddingLeft: 34,
    heroBrandGap: 14,
    heroBrandToIntroGap: 24,
    heroEyebrowToHeadlineGap: 10,
    heroHeadlineToDescriptionGap: 8,
    heroIntroToBenefitsGap: 24,
    heroBenefitRowGap: 16,
    heroTrustTopGap: 20,
    formVerticalAlignment: 'center',
    formPaddingTop: 30,
    formPaddingRight: 34,
    formPaddingBottom: 30,
    formPaddingLeft: 34,
    formBrandBottomGap: 18,
    formHeadingBottomGap: 16,
    formNoticeBottomGap: 12,
    formFieldRowGap: 12,
    formFieldColumnGap: 14,
    formLabelGap: 5,
    formInputPaddingY: 9,
    formInputPaddingX: 13,
    formButtonHeight: 44,
    formButtonTopGap: 18,
    formSigninTopGap: 12,
    formTextareaRows: 3,
    mobilePagePadding: 16,
    mobileHeroVisible: false,
    mobileFormPaddingTop: 28,
    mobileFormPaddingRight: 22,
    mobileFormPaddingBottom: 28,
    mobileFormPaddingLeft: 22,
  };
}

function showcasePreset(): Partial<AccountPortalPage> {
  return {
    desktopFit: false,
    desktopHeightMode: 'content',
    desktopPagePadding: 40,
    desktopStageWidth: 1180,
    desktopStageHeight: 720,
    pageVerticalAlignment: 'center',
    heroPanelPercent: 42,
    stageCornerRadius: 16,
    stageBorderWidth: 1,
    stageShadowBlur: 64,
    stageShadowOpacity: 18,
    heroVerticalAlignment: 'center',
    heroPadding: 'spacious',
    heroContentGap: 'open',
    benefitDensity: 'standard',
    benefitsPlacement: 'flow',
    heroPaddingTop: 52,
    heroPaddingRight: 42,
    heroPaddingBottom: 52,
    heroPaddingLeft: 42,
    heroBrandGap: 18,
    heroBrandToIntroGap: 34,
    heroEyebrowToHeadlineGap: 14,
    heroHeadlineToDescriptionGap: 12,
    heroIntroToBenefitsGap: 38,
    heroBenefitRowGap: 20,
    heroTrustTopGap: 24,
    formVerticalAlignment: 'center',
    formPaddingTop: 48,
    formPaddingRight: 44,
    formPaddingBottom: 48,
    formPaddingLeft: 44,
    formBrandBottomGap: 26,
    formHeadingBottomGap: 24,
    formNoticeBottomGap: 16,
    formFieldRowGap: 16,
    formFieldColumnGap: 18,
    formLabelGap: 7,
    formInputPaddingY: 12,
    formInputPaddingX: 15,
    formButtonHeight: 50,
    formButtonTopGap: 24,
    formSigninTopGap: 18,
    formTextareaRows: 4,
    mobilePagePadding: 20,
    mobileHeroVisible: true,
    mobileFormPaddingTop: 32,
    mobileFormPaddingRight: 24,
    mobileFormPaddingBottom: 32,
    mobileFormPaddingLeft: 24,
  };
}
