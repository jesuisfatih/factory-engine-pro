import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Image as ImageIcon, KeyRound, RefreshCw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createMcpTokenSchema,
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  DEFAULT_URGENCY_SCORING_CONFIG,
  tenantConfigSchema,
  type CreateMcpTokenResponse,
  type AccountPortalExperience,
  type TenantConfigInput,
  type UrgencyScoringConfig,
} from '@factory-engine-pro/contracts';
import { ADMIN_API_BASE_URL, adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { workspaceBadge, workspaceBrandQueryKey, workspaceName } from '@/lib/workspace-brand';
import { AccountPortalExperienceEditor } from './AccountPortalExperienceEditor';

interface TenantConfigResponse {
  workspaceName: string | null;
  brandBadge: string | null;
  brandLogo: string | null;
  accountPortalExperience: AccountPortalExperience;
  urgencyScoringConfig: UrgencyScoringConfig;
}

interface WorkspaceFormState {
  workspaceName: string;
  brandBadge: string;
  brandLogo: string;
}

interface McpTokenFormState {
  label: string;
  expiresInDays: number;
  canPublish: boolean;
  canReadAircallTranscripts: boolean;
}

const tenantConfigQueryKey = ['identity', 'tenant-config'];

const emptyForm: WorkspaceFormState = {
  workspaceName: '',
  brandBadge: '',
  brandLogo: '',
};

const emptyMcpForm: McpTokenFormState = {
  label: 'Claude workflow access',
  expiresInDays: 90,
  canPublish: true,
  canReadAircallTranscripts: true,
};

const URGENCY_WEIGHT_FIELDS = ['segmentWeight', 'repeatCountWeight', 'intentWeight', 'signalUrgencyWeight', 'waitingHoursWeight'] as const;
const INTENT_SCORE_FIELDS = ['complaint', 'escalation', 'reorder', 'sales', 'support', 'follow_up'] as const;
const RESOLVER_URGENCY_SCORE_FIELDS = ['critical', 'high', 'medium', 'low'] as const;

export function WorkspaceSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = new Set(principal?.permissions ?? []).has('settings.write');
  const [form, setForm] = useState<WorkspaceFormState>(emptyForm);
  const [urgencyForm, setUrgencyForm] = useState<UrgencyScoringConfig>(() => defaultUrgencyConfig());
  const [portalExperience, setPortalExperience] = useState<AccountPortalExperience>(() => clonePortalExperience(DEFAULT_ACCOUNT_PORTAL_EXPERIENCE));
  const [validationError, setValidationError] = useState<string | null>(null);

  const config = useQuery({
    queryKey: tenantConfigQueryKey,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
    retry: false,
  });

  useEffect(() => {
    if (!config.data) return;
    setForm({
      workspaceName: config.data.workspaceName ?? '',
      brandBadge: config.data.brandBadge ?? '',
      brandLogo: config.data.brandLogo ?? '',
    });
    setUrgencyForm(config.data.urgencyScoringConfig ?? defaultUrgencyConfig());
    setPortalExperience(clonePortalExperience(config.data.accountPortalExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE));
  }, [config.data]);

  const save = useMutation({
    mutationFn: (input: TenantConfigInput) => adminApi.updateTenantConfig(input),
    onSuccess: async () => {
      toast.success(t('settings.workspace.toast_saved'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: tenantConfigQueryKey }),
        qc.invalidateQueries({ queryKey: workspaceBrandQueryKey }),
      ]);
    },
    onError: (error) => toast.error(t('settings.workspace.toast_failed'), { description: apiErrorMessage(error) }),
  });

  const previewName = workspaceName(form.workspaceName);
  const previewBadge = workspaceBadge(form.brandBadge, previewName);
  const hasSavedBrand = Boolean(config.data?.workspaceName || config.data?.brandBadge || config.data?.brandLogo);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const input = {
      workspaceName: clean(form.workspaceName),
      brandBadge: clean(form.brandBadge),
      brandLogo: clean(form.brandLogo),
      accountPortalExperience: portalExperience,
      urgencyScoringConfig: urgencyForm,
    };
    const parsed = tenantConfigSchema.safeParse(input);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? t('settings.workspace.validation_invalid'));
      return;
    }
    save.mutate(parsed.data);
  };

  if (config.isLoading) {
    return (
      <div className="section workspace-state">
        <RefreshCw className="spin" size={18} />
        <div>
          <h3>{t('settings.workspace.loading_title')}</h3>
          <p>{t('settings.workspace.loading_body')}</p>
        </div>
      </div>
    );
  }

  if (config.isError) {
    return (
      <div className="section workspace-state error-state">
        <AlertTriangle size={18} />
        <div>
          <h3>{t('settings.workspace.error_title')}</h3>
          <p>{apiErrorMessage(config.error)}</p>
          <button type="button" className="btn" onClick={() => config.refetch()}>
            <RefreshCw size={14} />
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-settings-grid">
      <form className="section" onSubmit={submit}>
        <h3>{t('settings.workspace.form_title')}</h3>
        {!hasSavedBrand && (
          <div className="empty-state workspace-empty">
            <ImageIcon size={18} />
            <div>
              <strong>{t('settings.workspace.empty_title')}</strong>
              <span>{t('settings.workspace.empty_body')}</span>
            </div>
          </div>
        )}
        {validationError && <div className="error-state">{validationError}</div>}
        <div className="field">
          <label htmlFor="field-workspace-name">{t('settings.workspace.field_name')}</label>
          <input
            id="field-workspace-name"
            value={form.workspaceName}
            onChange={(event) => setForm((current) => ({ ...current, workspaceName: event.target.value }))}
            disabled={!canWrite || save.isPending}
            placeholder={t('settings.workspace.field_name_placeholder')}
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="field-brand-badge">{t('settings.workspace.field_badge')}</label>
            <input
              id="field-brand-badge"
              value={form.brandBadge}
              onChange={(event) => setForm((current) => ({ ...current, brandBadge: event.target.value.toUpperCase().slice(0, 6) }))}
              disabled={!canWrite || save.isPending}
              placeholder={previewBadge}
            />
            <span className="hint">{t('settings.workspace.field_badge_hint')}</span>
          </div>
          <div className="field">
            <label htmlFor="field-brand-logo">{t('settings.workspace.field_logo')}</label>
            <input
              id="field-brand-logo"
              value={form.brandLogo}
              onChange={(event) => setForm((current) => ({ ...current, brandLogo: event.target.value }))}
              disabled={!canWrite || save.isPending}
              placeholder="https://..."
            />
          </div>
        </div>
        <AccountPortalExperienceEditor
          value={portalExperience}
          onChange={setPortalExperience}
          workspaceName={previewName}
          brandBadge={previewBadge}
          brandLogo={form.brandLogo}
          disabled={!canWrite || save.isPending}
        />
        <div className="field">
          <label>{t('settings.workspace.urgency_weights')}</label>
          <div className="field-row">
            {URGENCY_WEIGHT_FIELDS.map((field) => (
              <div className="field" key={field}>
                <label htmlFor={`field-${field}`}>{t(`settings.workspace.${field}`)}</label>
                <input
                  id={`field-${field}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={urgencyForm[field]}
                  disabled={!canWrite || save.isPending}
                  onChange={(event) => setUrgencyForm((current) => ({ ...current, [field]: Number(event.target.value) }))}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{t('settings.workspace.intent_scores')}</label>
            <div className="field-row">
              {INTENT_SCORE_FIELDS.map((field) => (
                <div className="field" key={field}>
                  <label htmlFor={`intent-${field}`}>{field.replace(/_/g, ' ')}</label>
                  <input
                    id={`intent-${field}`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={urgencyForm.intentScores[field] ?? 0}
                    disabled={!canWrite || save.isPending}
                    onChange={(event) => setUrgencyForm((current) => ({
                      ...current,
                      intentScores: { ...current.intentScores, [field]: Number(event.target.value) },
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{t('settings.workspace.resolver_urgency_scores')}</label>
            <div className="field-row">
              {RESOLVER_URGENCY_SCORE_FIELDS.map((field) => (
                <div className="field" key={field}>
                  <label htmlFor={`resolver-urgency-${field}`}>{field}</label>
                  <input
                    id={`resolver-urgency-${field}`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={urgencyForm.signalUrgencyScores[field] ?? 0}
                    disabled={!canWrite || save.isPending}
                    onChange={(event) => setUrgencyForm((current) => ({
                      ...current,
                      signalUrgencyScores: { ...current.signalUrgencyScores, [field]: Number(event.target.value) },
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="workspace-form-actions">
          <button id="btn-save-workspace" type="submit" className="btn primary" disabled={!canWrite || save.isPending}>
            <Save size={14} />
            {save.isPending ? t('settings.workspace.saving') : t('settings.workspace.save')}
          </button>
          {!canWrite && <span className="hint">{t('settings.workspace.no_write_permission')}</span>}
        </div>
      </form>

      <div className="workspace-side-stack">
        <div className="section workspace-preview">
          <h3>{t('settings.workspace.preview_title')}</h3>
          <div className="workspace preview-row">
            {form.brandLogo ? <img className="ws-logo" src={form.brandLogo} alt="" /> : <div className="ws-badge">{previewBadge}</div>}
            <div className="ws-meta">
              <div className="name">{previewName}</div>
              <div className="role">{t('workspace.back_panel')}</div>
            </div>
          </div>
          <div className="topbar-workspace preview-pill">
            {form.brandLogo ? <img src={form.brandLogo} alt="" /> : <span>{previewBadge}</span>}
            <strong>{previewName}</strong>
          </div>
        </div>
        <McpAccessPanel canWrite={canWrite} />
      </div>
    </div>
  );
}

function McpAccessPanel({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<McpTokenFormState>(emptyMcpForm);
  const [created, setCreated] = useState<CreateMcpTokenResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryKey = ['auth', 'mcp-tokens'];

  const tokens = useQuery({
    queryKey,
    queryFn: () => adminApi.mcpTokens(),
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => {
      setValidationError(null);
      const parsed = createMcpTokenSchema.safeParse({
        label: form.label,
        expiresInDays: Number(form.expiresInDays),
        canPublish: form.canPublish,
        canReadAircallTranscripts: form.canReadAircallTranscripts,
      });
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? t('settings.workspace.mcp_validation_invalid');
        setValidationError(message);
        throw new Error(message);
      }
      return adminApi.createMcpToken(parsed.data);
    },
    onSuccess: async (result) => {
      setCreated(result);
      toast.success(t('settings.workspace.mcp_created'));
      await qc.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      if (validationError) return;
      toast.error(t('settings.workspace.mcp_create_failed'), { description: apiErrorMessage(error) });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeMcpToken(id),
    onSuccess: async () => {
      toast.success(t('settings.workspace.mcp_revoked'));
      await qc.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(t('settings.workspace.mcp_revoke_failed'), { description: apiErrorMessage(error) }),
  });

  const configText = created ? JSON.stringify(claudeConfig(created.token, created.tenantId), null, 2) : '';
  const activeTokens = tokens.data?.tokens.filter((token) => token.status === 'active') ?? [];

  return (
    <div className="section mcp-token-section">
      <h3>
        <span><KeyRound size={14} /> {t('settings.workspace.mcp_title')}</span>
        {tokens.data && <span className="meta">{activeTokens.length} active</span>}
      </h3>
      <p className="sub">{t('settings.workspace.mcp_body')}</p>

      <div className="mcp-token-form">
        <div className="field">
          <label htmlFor="field-mcp-label">{t('settings.workspace.mcp_label')}</label>
          <input
            id="field-mcp-label"
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            disabled={!canWrite || create.isPending}
            placeholder={t('settings.workspace.mcp_label_placeholder')}
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="field-mcp-expires">{t('settings.workspace.mcp_expires')}</label>
            <input
              id="field-mcp-expires"
              type="number"
              min={1}
              max={365}
              value={form.expiresInDays}
              onChange={(event) => setForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))}
              disabled={!canWrite || create.isPending}
            />
          </div>
          <label className="mcp-check">
            <input
              type="checkbox"
              checked={form.canPublish}
              onChange={(event) => setForm((current) => ({ ...current, canPublish: event.target.checked }))}
              disabled={!canWrite || create.isPending}
            />
            <span>
              <strong>{t('settings.workspace.mcp_can_publish')}</strong>
              <small>{t('settings.workspace.mcp_can_publish_hint')}</small>
            </span>
          </label>
          <label className="mcp-check">
            <input
              type="checkbox"
              checked={form.canReadAircallTranscripts}
              onChange={(event) => setForm((current) => ({ ...current, canReadAircallTranscripts: event.target.checked }))}
              disabled={!canWrite || create.isPending}
            />
            <span>
              <strong>{t('settings.workspace.mcp_can_read_aircall')}</strong>
              <small>{t('settings.workspace.mcp_can_read_aircall_hint')}</small>
            </span>
          </label>
        </div>
        {validationError && <div className="error-state">{validationError}</div>}
        <button type="button" id="btn-create-mcp-token" className="btn primary" disabled={!canWrite || create.isPending} onClick={() => create.mutate()}>
          <KeyRound size={13} /> {create.isPending ? t('settings.workspace.mcp_creating') : t('settings.workspace.mcp_create')}
        </button>
        {!canWrite && <span className="hint">{t('settings.workspace.mcp_no_write_permission')}</span>}
      </div>

      {created && (
        <div className="mcp-token-created">
          <strong>{t('settings.workspace.mcp_created_body')}</strong>
          <div className="field">
            <label>{t('settings.workspace.mcp_access_token')}</label>
            <textarea readOnly value={created.token} rows={4} />
          </div>
          <div className="mcp-token-actions">
            <button type="button" className="btn" onClick={() => copyText(created.token, t('settings.workspace.mcp_token_copied'))}>
              <Copy size={13} /> {t('settings.workspace.mcp_copy_token')}
            </button>
          </div>
          <div className="field">
            <label>{t('settings.workspace.mcp_config_label')}</label>
            <textarea readOnly value={configText} rows={12} />
          </div>
          <button type="button" className="btn" onClick={() => copyText(configText, t('settings.workspace.mcp_config_copied'))}>
            <Copy size={13} /> {t('settings.workspace.mcp_copy_config')}
          </button>
        </div>
      )}

      {tokens.isLoading && <div className="workspace-state"><RefreshCw className="spin" size={16} /> {t('settings.workspace.mcp_loading')}</div>}
      {tokens.isError && (
        <div className="error-state">
          <strong>{t('settings.workspace.mcp_error_title')}</strong>
          <p>{apiErrorMessage(tokens.error)}</p>
          <button type="button" className="btn" onClick={() => tokens.refetch()}>{t('common.retry')}</button>
        </div>
      )}
      {tokens.isSuccess && tokens.data.tokens.length === 0 && (
        <div className="empty-state mcp-empty">
          <strong>{t('settings.workspace.mcp_empty_title')}</strong>
          <span>{t('settings.workspace.mcp_empty_body')}</span>
        </div>
      )}
      {tokens.isSuccess && tokens.data.tokens.length > 0 && (
        <div className="mcp-token-list">
          <div className="mcp-token-list-title">{t('settings.workspace.mcp_active_tokens')}</div>
          {tokens.data.tokens.map((token) => (
            <div className="mcp-token-row" key={token.id}>
              <div>
                <strong>{token.label}</strong>
                <span>{mcpTokenScopeLabel(token.canPublish, token.canReadAircallTranscripts, t)}</span>
                <small>{t('settings.workspace.mcp_expires_at')}: {formatDateTime(token.expiresAt)}{token.lastFour ? ` · ...${token.lastFour}` : ''}</small>
              </div>
              <span className={`pill ${token.status === 'active' ? 'success' : token.status === 'revoked' ? 'danger' : 'warn'}`}>{token.status}</span>
              <button
                type="button"
                className="btn danger-outline"
                disabled={!canWrite || token.status !== 'active' || revoke.isPending}
                onClick={() => revoke.mutate(token.id)}
                title={t('settings.workspace.mcp_revoke')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function clonePortalExperience(value: AccountPortalExperience): AccountPortalExperience {
  return JSON.parse(JSON.stringify(value)) as AccountPortalExperience;
}

function defaultUrgencyConfig(): UrgencyScoringConfig {
  return {
    segmentWeight: DEFAULT_URGENCY_SCORING_CONFIG.segmentWeight,
    repeatCountWeight: DEFAULT_URGENCY_SCORING_CONFIG.repeatCountWeight,
    intentWeight: DEFAULT_URGENCY_SCORING_CONFIG.intentWeight,
    signalUrgencyWeight: DEFAULT_URGENCY_SCORING_CONFIG.signalUrgencyWeight,
    waitingHoursWeight: DEFAULT_URGENCY_SCORING_CONFIG.waitingHoursWeight,
    intentScores: { ...DEFAULT_URGENCY_SCORING_CONFIG.intentScores },
    signalUrgencyScores: { ...DEFAULT_URGENCY_SCORING_CONFIG.signalUrgencyScores },
  };
}

function claudeConfig(token: string, tenantId: string) {
  return {
    mcpServers: {
      'factory-engine-workflow': {
        type: 'streamable-http',
        url: `${ADMIN_API_BASE_URL.replace(/\/$/, '')}/mcp/workflow`,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': tenantId,
        },
      },
    },
  };
}

function mcpTokenScopeLabel(canPublish: boolean, canReadAircallTranscripts: boolean, t: ReturnType<typeof useTranslation>['t']) {
  if (canPublish && canReadAircallTranscripts) return t('settings.workspace.mcp_full_workflow_aircall');
  if (canPublish) return t('settings.workspace.mcp_publish_enabled');
  if (canReadAircallTranscripts) return t('settings.workspace.mcp_aircall_read_only');
  return t('settings.workspace.mcp_read_only');
}

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  toast.success(message);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
