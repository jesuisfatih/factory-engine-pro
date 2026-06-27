import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Brain, Save, Download, Upload, RotateCcw, AlertTriangle, TrendingUp, Truck, Phone, ShoppingCart, Mail, Clock, Wallet } from 'lucide-react';
import { AI_SERVICES, fetchServiceToggles, type AiServiceId, type ServiceToggleState } from '@/lib/mock';

const ICONS: Record<AiServiceId, typeof TrendingUp> = {
  analytics: TrendingUp,
  partners: Truck,
  aircall: Phone,
  sales: ShoppingCart,
  email_template: Mail,
};

function AiSettingsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['ai', 'toggles'], queryFn: fetchServiceToggles });

  const [masterEnabled, setMasterEnabled] = useState(true);
  const [quietHours, setQuietHours] = useState(false);
  const [services, setServices] = useState<ServiceToggleState[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMasterEnabled(data.masterEnabled);
    setQuietHours(data.quietHours);
    setServices(data.services);
  }, [data]);

  const updateService = (id: AiServiceId, patch: Partial<ServiceToggleState>) => {
    setServices((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const updateServiceConfig = (id: AiServiceId, key: string, value: boolean | number) => {
    setServices((rows) => rows.map((row) => row.id === id ? { ...row, config: { ...row.config, [key]: value } } : row));
  };

  const renderImpactRow = (id: string, items: string[]) => (
    <div className="impact-row" id={`impact-${id}`}
      onClick={() => setExpanded((current) => current === id ? null : id)}>
      <span>↓ {t('ai.ai_settings.if_disabled_label', { count: items.length })}</span>
      {expanded === id && <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }} data-i18n-key="ai.ai_settings.all_changes_saved">
          {t('ai.ai_settings.all_changes_saved')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button id="btn-discard" className="btn ghost" type="button">
            {t('ai.ai_settings.discard')}
          </button>
          <button id="btn-reset-defaults" className="btn" type="button" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            <RotateCcw size={13} /> {t('ai.ai_settings.reset_defaults')}
          </button>
          <button id="btn-export" className="btn" type="button">
            <Download size={13} /> {t('ai.ai_settings.export')}
          </button>
          <button id="btn-import" className="btn" type="button">
            <Upload size={13} /> {t('ai.ai_settings.import')}
          </button>
          <button id="btn-save-all" type="button" className="save-btn" style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
            onClick={() => qc.invalidateQueries({ queryKey: ['ai', 'toggles'] })}>
            <Save size={13} /> {t('ai.ai_settings.save')}
          </button>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="master-toggle-card" id="master-ai-toggle">
        <div className="head">
          <div>
            <div className="name">
              <div className="icon-wrap"><Brain size={16} /></div>
              <span data-i18n-key="ai.ai_settings.master_toggle_title">{t('ai.ai_settings.master_toggle_title')}</span>
              <span className="risk-tag CRITICAL">CRITICAL</span>
            </div>
            <div className="sub" data-i18n-key="ai.ai_settings.master_toggle_sub">
              {t('ai.ai_settings.master_toggle_sub')}
            </div>
          </div>
          <button id="master-switch" type="button" className={`switch${masterEnabled ? ' on' : ''}`}
            onClick={() => setMasterEnabled((value) => !value)}>
            <span className="knob" />
          </button>
        </div>
        {!masterEnabled && (
          <div className="impact-banner">
            <AlertTriangle size={14} />
            <span data-i18n-key="ai.ai_settings.master_impact_note">{t('ai.ai_settings.master_impact_note')}</span>
          </div>
        )}
      </div>

      {/* Per-service cards */}
      {services.map((svc) => {
        const meta = AI_SERVICES.find((service) => service.id === svc.id)!;
        const Icon = ICONS[svc.id];
        return (
          <div key={svc.id} className="service-toggle-card" id={`svc-toggle-${svc.id}`}>
            <div className="head">
              <div>
                <div className="name" style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon size={16} style={{ color: meta.color }} />
                  <span>{meta.label}</span>
                  <span className={`risk-tag ${meta.risk}`}>{meta.risk}</span>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{meta.subtitle}</div>
              </div>
              <button id={`switch-${svc.id}`} type="button" className={`switch${svc.enabled ? ' on' : ''}`}
                onClick={() => updateService(svc.id, { enabled: !svc.enabled })}>
                <span className="knob" />
              </button>
            </div>

            {renderImpactRow(svc.id, svc.impactDescriptions)}

            <div className="config-section-label" data-i18n-key="ai.ai_settings.model_override_label">
              {t('ai.ai_settings.model_override_label')}
            </div>
            <select id={`override-${svc.id}`} className="model-override-select"
              value={svc.modelOverride}
              onChange={(event) => updateService(svc.id, { modelOverride: event.target.value })}>
              <option value="default">{t('ai.ai_settings.model_default')}</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5-20251001</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-opus-4-7">claude-opus-4-7</option>
            </select>
            <div className="model-override-help" data-i18n-key="ai.ai_settings.model_override_help">
              {t('ai.ai_settings.model_override_help')}
            </div>

            {/* Per-service config toggles */}
            {svc.id === 'aircall' && (
              <>
                <div className="config-section-label" data-i18n-key="ai.ai_settings.config_section_aircall">
                  {t('ai.ai_settings.config_section_aircall')}
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.psychoanalysis_label">
                    {t('ai.ai_settings.psychoanalysis_label')}
                  </span>
                  <button id={`cfg-${svc.id}-psycho`} type="button"
                    className={`switch${svc.config.psychoanalysisEnabled ? ' on' : ''}`}
                    onClick={() => updateServiceConfig(svc.id, 'psychoanalysisEnabled', !svc.config.psychoanalysisEnabled)}>
                    <span className="knob" />
                  </button>
                </div>
              </>
            )}

            {svc.id === 'partners' && (
              <>
                <div className="config-section-label" data-i18n-key="ai.ai_settings.config_section_partners">
                  {t('ai.ai_settings.config_section_partners')}
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.text_first_label">
                    {t('ai.ai_settings.text_first_label')}
                  </span>
                  <button id={`cfg-${svc.id}-textfirst`} type="button"
                    className={`switch${svc.config.textFirstAttempt ? ' on' : ''}`}
                    onClick={() => updateServiceConfig(svc.id, 'textFirstAttempt', !svc.config.textFirstAttempt)}>
                    <span className="knob" />
                  </button>
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.vision_cache_ttl">
                    {t('ai.ai_settings.vision_cache_ttl')}
                  </span>
                  <input id={`cfg-${svc.id}-cache-ttl`} type="number"
                    value={Number(svc.config.visionCacheTtlHours ?? 1)}
                    onChange={(event) => updateServiceConfig(svc.id, 'visionCacheTtlHours', Number(event.target.value))} />
                </div>
              </>
            )}

            {svc.id === 'sales' && (
              <>
                <div className="config-section-label" data-i18n-key="ai.ai_settings.config_section_sales">
                  {t('ai.ai_settings.config_section_sales')}
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.per_call_intelligence">
                    {t('ai.ai_settings.per_call_intelligence')}
                  </span>
                  <button id={`cfg-${svc.id}-percall`} type="button"
                    className={`switch${svc.config.perCallIntelligenceEnabled ? ' on' : ''}`}
                    onClick={() => updateServiceConfig(svc.id, 'perCallIntelligenceEnabled', !svc.config.perCallIntelligenceEnabled)}>
                    <span className="knob" />
                  </button>
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.daily_digest">
                    {t('ai.ai_settings.daily_digest')}
                  </span>
                  <button id={`cfg-${svc.id}-digest`} type="button"
                    className={`switch${svc.config.dailyDigestEnabled ? ' on' : ''}`}
                    onClick={() => updateServiceConfig(svc.id, 'dailyDigestEnabled', !svc.config.dailyDigestEnabled)}>
                    <span className="knob" />
                  </button>
                </div>
              </>
            )}

            {svc.id === 'email_template' && (
              <>
                <div className="config-section-label" data-i18n-key="ai.ai_settings.config_section_email_template">
                  {t('ai.ai_settings.config_section_email_template')}
                </div>
                <div className="config-row">
                  <span className="lbl" data-i18n-key="ai.ai_settings.max_output_tokens_cap">
                    {t('ai.ai_settings.max_output_tokens_cap')}
                  </span>
                  <input id={`cfg-${svc.id}-max-tokens`} type="number"
                    value={Number(svc.config.maxOutputTokensCap ?? 4000)}
                    onChange={(event) => updateServiceConfig(svc.id, 'maxOutputTokensCap', Number(event.target.value))} />
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Quiet Hours */}
      <div className="service-toggle-card" id="quiet-hours">
        <div className="head">
          <div>
            <div className="name" style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={16} style={{ color: 'var(--text-muted)' }} />
              <span data-i18n-key="ai.ai_settings.quiet_hours_title">{t('ai.ai_settings.quiet_hours_title')}</span>
              <span className="risk-tag LOW">LOW</span>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }} data-i18n-key="ai.ai_settings.quiet_hours_sub">
              {t('ai.ai_settings.quiet_hours_sub')}
            </div>
          </div>
          <button id="quiet-hours-switch" type="button" className={`switch${quietHours ? ' on' : ''}`}
            onClick={() => setQuietHours((value) => !value)}>
            <span className="knob" />
          </button>
        </div>
      </div>

      {/* Budget settings link */}
      <div className="service-toggle-card" id="budget-settings-collapsed">
        <div className="head">
          <div>
            <div className="name" style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Wallet size={16} style={{ color: 'var(--text-muted)' }} />
              <span data-i18n-key="ai.ai_settings.budget_settings_title">{t('ai.ai_settings.budget_settings_title')}</span>
              <span className="risk-tag MEDIUM">MEDIUM</span>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }} data-i18n-key="ai.ai_settings.budget_settings_sub">
              {t('ai.ai_settings.budget_settings_sub')}
            </div>
          </div>
          <span className="muted">→</span>
        </div>
      </div>

      {/* Recent changes */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}
          data-i18n-key="ai.ai_settings.recent_changes_title">
          {t('ai.ai_settings.recent_changes_title')} (0)
        </div>
        <div className="changes-empty" data-i18n-key="ai.ai_settings.no_changes">
          {t('ai.ai_settings.no_changes')}
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/settings')({ component: AiSettingsView });
