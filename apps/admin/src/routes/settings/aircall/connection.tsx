import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Radio, Zap, RefreshCw, Trash2, Key, Save, AlertTriangle, Phone } from 'lucide-react';
import { fetchAircallWebhookStatus } from '@/lib/mock';
import { useCan } from '@/lib/permissions';

function ConnectionView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');

  const { data: status } = useQuery({ queryKey: ['aircall', 'webhook'], queryFn: fetchAircallWebhookStatus });
  const [enabled, setEnabled] = useState(true);
  const [apiId, setApiId] = useState('••••9d01');
  const [apiToken, setApiToken] = useState('••••••••');
  const [webhookSecret, setWebhookSecret] = useState('••••••••');
  const [workspaceId, setWorkspaceId] = useState('');
  const [defaultPhone, setDefaultPhone] = useState('');
  const [defaultRegion, setDefaultRegion] = useState('US');
  const [fallbackAgent, setFallbackAgent] = useState('');
  const [publicWebhookOverride, setPublicWebhookOverride] = useState('');
  const [clickToCall, setClickToCall] = useState(true);
  const [daysBack, setDaysBack] = useState(7);
  const [maxPages, setMaxPages] = useState(40);

  const testPing = useMutation({ mutationFn: async () => { await new Promise((r) => setTimeout(r, 500)); } });
  const reRegister = useMutation({ mutationFn: async () => { await new Promise((r) => setTimeout(r, 500)); qc.invalidateQueries({ queryKey: ['aircall', 'webhook'] }); } });
  const startBackfill = useMutation({ mutationFn: async () => { await new Promise((r) => setTimeout(r, 800)); } });

  return (
    <>
      {/* Webhook Status */}
      {status && (
        <section className="webhook-card" id="webhook-status">
          <div className="head">
            <div>
              <h3 data-i18n-key="aircall_hub.connection.webhook_status_title">{t('aircall_hub.connection.webhook_status_title')}</h3>
              <div className="sub" data-i18n-key="aircall_hub.connection.webhook_status_sub">{t('aircall_hub.connection.webhook_status_sub')}</div>
            </div>
          </div>

          <div className="webhook-id-row">
            <Radio size={18} className="ico" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="id-text">{status.name}</span>
                {status.active && <span className="badge-active" data-i18n-key="aircall_hub.connection.active">{t('aircall_hub.connection.active')}</span>}
              </div>
              <div className="url">{status.url}</div>
            </div>
          </div>

          <div className="webhook-grid">
            <div className="cell">
              <div className="lbl" data-i18n-key="aircall_hub.connection.last_event">{t('aircall_hub.connection.last_event')}</div>
              <div className="val">{status.lastEventAt}</div>
            </div>
            <div className="cell">
              <div className="lbl" data-i18n-key="aircall_hub.connection.last_ping">{t('aircall_hub.connection.last_ping')}</div>
              <div className="val">{status.lastPingAt}</div>
            </div>
            <div className="cell">
              <div className="lbl" data-i18n-key="aircall_hub.connection.failure_count">{t('aircall_hub.connection.failure_count')}</div>
              <div className="val">{status.failureCount}</div>
            </div>
            <div className="cell">
              <div className="lbl" data-i18n-key="aircall_hub.connection.events_subscribed">{t('aircall_hub.connection.events_subscribed')}</div>
              <div className="val">{status.eventsSubscribed}</div>
            </div>
          </div>

          {status.lastFailureReason && (
            <div className="webhook-warning">
              <AlertTriangle size={14} />
              <div>
                <strong data-i18n-key="aircall_hub.connection.last_failure">{t('aircall_hub.connection.last_failure')}</strong> {status.lastFailureReason} <span className="muted">({status.lastFailureAt})</span>
              </div>
            </div>
          )}

          <div className="webhook-actions">
            <button id="btn-test-ping" type="button" className="btn" disabled={!canWrite || testPing.isPending} onClick={() => testPing.mutate()}>
              <Zap size={13} /> {t('aircall_hub.connection.test_ping')}
            </button>
            <button id="btn-re-register" type="button" className="btn" disabled={!canWrite || reRegister.isPending} onClick={() => reRegister.mutate()}>
              <RefreshCw size={13} /> {t('aircall_hub.connection.re_register')}
            </button>
            <button id="btn-delete-webhook" type="button" className="btn danger-outline" disabled={!canWrite}>
              <Trash2 size={13} /> {t('aircall_hub.connection.delete')}
            </button>
          </div>
        </section>
      )}

      {/* Credentials */}
      <section className="config-card" id="aircall-credentials">
        <h3 data-i18n-key="aircall_hub.connection.credentials_title">{t('aircall_hub.connection.credentials_title')}</h3>
        <div className="sub" data-i18n-key="aircall_hub.connection.credentials_sub">{t('aircall_hub.connection.credentials_sub')}</div>

        <div className="checkbox-row">
          <input id="field-aircall-enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={!canWrite} />
          <label htmlFor="field-aircall-enabled" data-i18n-key="aircall_hub.connection.integration_enabled">{t('aircall_hub.connection.integration_enabled')}</label>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-aircall-api-id" data-i18n-key="aircall_hub.connection.api_id">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.api_id')}
            </label>
            <input id="field-aircall-api-id" value={apiId} onChange={(event) => setApiId(event.target.value)} disabled={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="field-aircall-api-token" data-i18n-key="aircall_hub.connection.api_token">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.api_token')}
            </label>
            <input id="field-aircall-api-token" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} disabled={!canWrite} />
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-aircall-webhook-secret" data-i18n-key="aircall_hub.connection.webhook_secret">
              <Key size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.webhook_secret')}
            </label>
            <input id="field-aircall-webhook-secret" type="password" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} disabled={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="field-aircall-workspace-id" data-i18n-key="aircall_hub.connection.workspace_id">
              {t('aircall_hub.connection.workspace_id')}
            </label>
            <input id="field-aircall-workspace-id" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder={t('aircall_hub.connection.workspace_id_hint')} disabled={!canWrite} />
          </div>
        </div>
      </section>

      {/* Tenant Routing */}
      <section className="config-card" id="aircall-tenant-routing">
        <h3 data-i18n-key="aircall_hub.connection.tenant_routing_title">{t('aircall_hub.connection.tenant_routing_title')}</h3>
        <div className="sub" data-i18n-key="aircall_hub.connection.tenant_routing_sub">{t('aircall_hub.connection.tenant_routing_sub')}</div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-default-phone" data-i18n-key="aircall_hub.connection.default_phone_number">
              <Phone size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} /> {t('aircall_hub.connection.default_phone_number')}
            </label>
            <input id="field-default-phone" placeholder="+90 555 123 45 67" value={defaultPhone}
              onChange={(event) => setDefaultPhone(event.target.value)} disabled={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="field-default-region" data-i18n-key="aircall_hub.connection.default_phone_region">
              {t('aircall_hub.connection.default_phone_region')}
            </label>
            <select id="field-default-region" value={defaultRegion} onChange={(event) => setDefaultRegion(event.target.value)} disabled={!canWrite}>
              <option value="US">US — United States</option>
              <option value="TR">TR — Türkiye</option>
              <option value="GB">GB — United Kingdom</option>
              <option value="DE">DE — Germany</option>
            </select>
          </div>
        </div>

        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-fallback-agent" data-i18n-key="aircall_hub.connection.fallback_agent_email">
              {t('aircall_hub.connection.fallback_agent_email')}
            </label>
            <input id="field-fallback-agent" type="email" placeholder="agent@example.com" value={fallbackAgent}
              onChange={(event) => setFallbackAgent(event.target.value)} disabled={!canWrite} />
          </div>
          <div className="field">
            <label htmlFor="field-public-webhook-override" data-i18n-key="aircall_hub.connection.public_webhook_override">
              {t('aircall_hub.connection.public_webhook_override')}
            </label>
            <input id="field-public-webhook-override" placeholder="https://api.dtfbank.com" value={publicWebhookOverride}
              onChange={(event) => setPublicWebhookOverride(event.target.value)} disabled={!canWrite} />
          </div>
        </div>

        <div className="checkbox-row" style={{ marginBottom: 0 }}>
          <input id="field-click-to-call" type="checkbox" checked={clickToCall} onChange={(event) => setClickToCall(event.target.checked)} disabled={!canWrite} />
          <label htmlFor="field-click-to-call" data-i18n-key="aircall_hub.connection.enable_click_to_call">{t('aircall_hub.connection.enable_click_to_call')}</label>
        </div>
      </section>

      {/* Historical backfill */}
      <section className="config-card" id="aircall-backfill">
        <h3 data-i18n-key="aircall_hub.connection.historical_backfill_title">{t('aircall_hub.connection.historical_backfill_title')}</h3>
        <div className="sub" data-i18n-key="aircall_hub.connection.historical_backfill_sub">{t('aircall_hub.connection.historical_backfill_sub')}</div>

        <div className="webhook-warning">
          <AlertTriangle size={14} />
          <span data-i18n-key="aircall_hub.connection.backfill_warning">{t('aircall_hub.connection.backfill_warning')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="field-days-back" data-i18n-key="aircall_hub.connection.days_back">
              {t('aircall_hub.connection.days_back')}
            </label>
            <input id="field-days-back" type="number" value={daysBack} onChange={(event) => setDaysBack(Number(event.target.value))} disabled={!canWrite} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="field-max-pages" data-i18n-key="aircall_hub.connection.max_pages">
              {t('aircall_hub.connection.max_pages')}
            </label>
            <input id="field-max-pages" type="number" value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))} disabled={!canWrite} />
          </div>
          <button id="btn-start-backfill" type="button" className="save-btn" style={{ height: 40 }}
            disabled={!canWrite || startBackfill.isPending} onClick={() => startBackfill.mutate()}>
            <Save size={13} /> {t('aircall_hub.connection.start_backfill')}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10 }} data-i18n-key="aircall_hub.connection.backfill_tip">
          {t('aircall_hub.connection.backfill_tip')}
        </div>
      </section>
    </>
  );
}

export const Route = createFileRoute('/settings/aircall/connection')({ component: ConnectionView });
