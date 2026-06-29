import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileText, KeyRound, RefreshCw, Save, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { AiHealthResponse, TranscriptResolverTestResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

const TENANT_CONFIG_QK = ['identity', 'tenant-config'] as const;
const AI_HEALTH_QK = ['ai', 'health'] as const;
const AI_PROMPT_QK = ['ai', 'resolver-prompt'] as const;
const PROBE_TRANSCRIPT = [
  'Customer called because order DTF-18491 is delayed.',
  'They asked for tracking, mentioned a missing apartment number, and requested an urgent follow up today.',
  'They also said they may move the next gang sheet order to a competitor if shipping is not fixed.',
].join(' ');

interface TenantConfigResponse {
  hasAnthropicApiKey: boolean;
}

interface ResolverPromptResponse {
  promptKey: string;
  promptVersion: string;
  prompt: string;
}

function AiSettingsView() {
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  const config = useQuery({
    queryKey: TENANT_CONFIG_QK,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
  });
  const health = useQuery({
    queryKey: AI_HEALTH_QK,
    queryFn: () => adminApi.aiHealth() as Promise<AiHealthResponse>,
    retry: false,
  });
  const prompt = useQuery({
    queryKey: AI_PROMPT_QK,
    queryFn: () => adminApi.aiResolverPrompt() as Promise<ResolverPromptResponse>,
    retry: false,
  });

  const saveCredentials = useMutation({
    mutationFn: () => adminApi.updateTenantConfig({
      anthropicApiKey: trimOrUndefined(anthropicApiKey),
    }),
    onSuccess: () => {
      setAnthropicApiKey('');
      qc.invalidateQueries({ queryKey: TENANT_CONFIG_QK });
      qc.invalidateQueries({ queryKey: AI_HEALTH_QK });
      toast.success('Anthropic credential saved');
    },
    onError: (error) => toast.error('Anthropic credential could not be saved', { description: apiErrorMessage(error) }),
  });

  const resolverProbe = useMutation({
    mutationFn: () => adminApi.aiTranscriptResolverTest({
      transcript: PROBE_TRANSCRIPT,
      metadata: {
        source: 'admin-ai-settings',
        purpose: 'live-transcript-resolver-check',
      },
    }) as Promise<TranscriptResolverTestResponse>,
  });

  const hasCredential = Boolean(config.data?.hasAnthropicApiKey || health.data?.configured);
  const credentialStatusError = config.isError ? apiErrorMessage(config.error) : health.isError ? apiErrorMessage(health.error) : null;
  const promptStats = prompt.data ? {
    chars: prompt.data.prompt.length,
    lines: prompt.data.prompt.split('\n').filter((line) => line.trim().length > 0).length,
  } : null;

  return (
    <div className="integration-page" id="ai-settings-runtime-page">
      <section className="webhook-card" id="ai-credential-status">
        <div className="head">
          <div>
            <h3>Anthropic credential</h3>
            <div className="sub">Tenant scoped key used by transcript resolver calls.</div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              config.refetch();
              health.refetch();
              prompt.refetch();
            }}
            disabled={config.isFetching || health.isFetching || prompt.isFetching}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {(config.isLoading || health.isLoading) && (
          <StateBlock
            title="Loading resolver configuration"
            body="Reading the tenant credential marker and live Anthropic health state."
          />
        )}

        {credentialStatusError && (
          <StateBlock
            title="Resolver configuration could not load"
            body={credentialStatusError}
            icon={<AlertTriangle size={18} color="var(--danger)" />}
            action={<button type="button" className="btn" onClick={() => { config.refetch(); health.refetch(); }}><RefreshCw size={14} /> Retry</button>}
          />
        )}

        {!config.isLoading && !health.isLoading && !credentialStatusError && (
          <>
            <div className="webhook-grid">
              <StatusCell
                label="Tenant key"
                ok={Boolean(config.data?.hasAnthropicApiKey)}
                value={config.data?.hasAnthropicApiKey ? 'encrypted at rest' : 'missing'}
              />
              <StatusCell
                label="Provider"
                ok={health.data?.provider === 'anthropic'}
                value={health.data?.provider ?? 'anthropic'}
              />
              <StatusCell
                label="Credential source"
                ok={Boolean(health.data?.configured)}
                value={health.data?.source ?? 'none'}
              />
              <StatusCell
                label="Resolver API"
                ok={Boolean(health.data?.resolverReachable)}
                value={health.data?.resolverStatus ?? 'not_checked'}
              />
            </div>

            {!hasCredential && (
              <div className="empty-state" style={{ marginBottom: 14 }}>
                <XCircle size={18} />
                <div>
                  <strong>No Anthropic key is configured</strong>
                  <span>Save a tenant key before producing transcript resolver JSON.</span>
                </div>
              </div>
            )}

            {health.data?.resolverError && (
              <div className="error-state" style={{ marginTop: 12 }}>
                <AlertTriangle size={16} />
                <span>{health.data.resolverError}</span>
              </div>
            )}
          </>
        )}
      </section>

      <section className="config-card" id="ai-credential-form">
        <h3>Credential update</h3>
        <div className="sub">Blank values keep the existing encrypted tenant key.</div>
        <div className="field-row-2">
          <div className="field">
            <label htmlFor="field-anthropic-api-key">
              <KeyRound size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
              Anthropic API key
            </label>
            <input
              id="field-anthropic-api-key"
              type="password"
              value={anthropicApiKey}
              onChange={(event) => setAnthropicApiKey(event.target.value)}
              placeholder={config.data?.hasAnthropicApiKey ? 'Leave blank to keep existing key' : 'sk-ant-...'}
              disabled={!canWrite || saveCredentials.isPending}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Save tenant credential</label>
            <button
              id="btn-save-anthropic-credential"
              type="button"
              className="save-btn"
              style={{ height: 40, justifyContent: 'center' }}
              disabled={!canWrite || saveCredentials.isPending || !trimOrUndefined(anthropicApiKey)}
              onClick={() => saveCredentials.mutate()}
            >
              <Save size={13} /> {saveCredentials.isPending ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
        {!canWrite && <div className="form-error" style={{ marginTop: 12 }}>settings.write permission is required to change this key.</div>}
      </section>

      <section className="config-card" id="ai-runtime-health">
        <div className="section-title-row">
          <div>
            <h3>Live resolver health</h3>
            <div className="sub">Uses the real tenant key against Anthropic model and messages APIs.</div>
          </div>
          <button
            id="btn-refresh-ai-health"
            type="button"
            className="btn"
            onClick={() => health.refetch()}
            disabled={health.isFetching}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {health.isLoading && <StateBlock title="Checking provider" body="Waiting for the Anthropic health probe." />}
        {health.isError && <div className="error-state">{apiErrorMessage(health.error)}</div>}
        {health.data && (
          <>
            <div className="webhook-grid">
              <RuntimeCell label="Status" value={health.data.status} />
              <RuntimeCell label="Models API" value={health.data.reachable ? 'reachable' : 'blocked'} />
              <RuntimeCell label="Model count" value={health.data.modelCount == null ? 'n/a' : String(health.data.modelCount)} />
              <RuntimeCell label="Latency" value={health.data.latencyMs == null ? 'n/a' : `${health.data.latencyMs}ms`} />
              <RuntimeCell label="Checked" value={formatDate(health.data.checkedAt)} />
              <RuntimeCell label="Resolver messages" value={health.data.resolverStatus} />
            </div>
            {health.data.error && <div className="error-state">{health.data.error}</div>}
          </>
        )}
      </section>

      <section className="config-card" id="ai-resolver-test">
        <div className="section-title-row">
          <div>
            <h3>Transcript resolver test</h3>
            <div className="sub">Produces the JSON output required by the integration gate.</div>
          </div>
          <button
            id="btn-test-ai-resolver"
            type="button"
            className="btn primary"
            onClick={() => resolverProbe.mutate()}
            disabled={!hasCredential || resolverProbe.isPending}
          >
            {resolverProbe.isPending ? <RefreshCw className="spin" size={13} /> : <Send size={13} />}
            {resolverProbe.isPending ? 'Running' : 'Run test'}
          </button>
        </div>

        {!hasCredential && (
          <div className="empty-state">
            <FileText size={18} />
            <div>
              <strong>Resolver test is waiting for credentials</strong>
              <span>Save a tenant key to run a live transcript proof.</span>
            </div>
          </div>
        )}
        {resolverProbe.isError && <div className="error-state">{apiErrorMessage(resolverProbe.error)}</div>}
        {resolverProbe.data && (
          <>
            <div className="webhook-grid">
              <RuntimeCell label="Model" value={resolverProbe.data.model} />
              <RuntimeCell label="Source" value={resolverProbe.data.source} />
              <RuntimeCell label="Prompt" value={resolverProbe.data.promptKey} />
              <RuntimeCell label="Latency" value={`${resolverProbe.data.latencyMs}ms`} />
              <RuntimeCell label="Checked" value={formatDate(resolverProbe.data.checkedAt)} />
            </div>
            <div className="code-block" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(resolverProbe.data.output, null, 2)}
            </div>
          </>
        )}
        {hasCredential && !resolverProbe.isPending && !resolverProbe.isError && !resolverProbe.data && (
          <div className="empty-state">
            <FileText size={18} />
            <div>
              <strong>No resolver output in this view yet</strong>
              <span>Run the live test to capture the transcript JSON result.</span>
            </div>
          </div>
        )}
      </section>

      <section className="config-card" id="ai-prompt-runtime">
        <div className="section-title-row">
          <div>
            <h3>Resolver prompt registry</h3>
            <div className="sub">Prompt template compiled from the shared enum catalog.</div>
          </div>
          <StatusPill ok={prompt.data?.promptKey === 'ai.transcript-resolver'} label={prompt.data?.promptKey ?? 'missing'} />
        </div>
        {prompt.isLoading && <StateBlock title="Loading prompt" body="Reading the active resolver prompt." />}
        {prompt.isError && <div className="error-state">{apiErrorMessage(prompt.error)}</div>}
        {prompt.data && (
          <>
            <div className="webhook-grid">
              <RuntimeCell label="Version" value={prompt.data.promptVersion} />
              <RuntimeCell label="Characters" value={String(promptStats?.chars ?? 0)} />
              <RuntimeCell label="Lines" value={String(promptStats?.lines ?? 0)} />
            </div>
            <div className="code-block" style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {prompt.data.prompt}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatusCell({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {ok ? <CheckCircle2 size={14} color="var(--success)" /> : <XCircle size={14} color="var(--danger)" />}
        {value}
      </div>
    </div>
  );
}

function RuntimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`status-pill ${ok ? 'success' : 'danger'}`}>{label}</span>;
}

function StateBlock({ title, body, action, icon }: { title: string; body: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="pricing-list-empty">
      {icon && <div style={{ marginBottom: 10 }}>{icon}</div>}
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function trimOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/ai/settings')({ component: AiSettingsView });
