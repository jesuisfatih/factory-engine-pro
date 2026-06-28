import { useMemo, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, FileText, RefreshCw, Send, XCircle } from 'lucide-react';
import type { AiHealthResponse, TranscriptResolverTestResponse } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';

const HEALTH_QK = ['ai', 'health'] as const;
const PROMPT_QK = ['ai', 'resolver-prompt'] as const;
const PROBE_TRANSCRIPT = [
  'Customer called about a delayed shipment.',
  'They asked for tracking, requested an urgent same day follow up, and complained that the order has not moved.',
].join(' ');

function HealthView() {
  const health = useQuery({
    queryKey: HEALTH_QK,
    queryFn: () => adminApi.aiHealth() as Promise<AiHealthResponse>,
    retry: false,
  });
  const prompt = useQuery({
    queryKey: PROMPT_QK,
    queryFn: () => adminApi.aiResolverPrompt(),
    retry: false,
  });
  const resolverProbe = useMutation({
    mutationFn: () => adminApi.aiTranscriptResolverTest({
      transcript: PROBE_TRANSCRIPT,
      metadata: {
        source: 'admin-ai-health',
        purpose: 'roadmap-3-transcript-resolver-proof',
      },
    }) as Promise<TranscriptResolverTestResponse>,
  });

  const statusTone = statusToneFor(health.data);
  const promptStats = useMemo(() => {
    const text = prompt.data?.prompt ?? '';
    return {
      chars: text.length,
      enumLines: text.split('\n').filter((line) => line.includes('- ')).length,
    };
  }, [prompt.data?.prompt]);

  if (health.isLoading || prompt.isLoading) {
    return (
      <section className="section workspace-state">
        <RefreshCw className="spin" size={18} />
        <div>
          <h3>Checking AI provider</h3>
          <p>Loading tenant credentials, provider reachability, and resolver prompt metadata.</p>
        </div>
      </section>
    );
  }

  if (health.isError || prompt.isError) {
    const error = health.error ?? prompt.error;
    return (
      <section className="section workspace-state error-state">
        <AlertTriangle size={18} />
        <div>
          <h3>AI health could not load</h3>
          <p>{apiErrorMessage(error)}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              health.refetch();
              prompt.refetch();
            }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const configured = Boolean(health.data?.configured);
  const probeOutput = resolverProbe.data?.output;
  const probeError = resolverProbe.isError ? apiErrorMessage(resolverProbe.error) : null;

  return (
    <>
      <PageHeader
        titleI18nKey="ai.tabs.health"
        subtitleI18nKey="ai.header.subtitle"
        actions={(
          <button
            type="button"
            className="btn"
            onClick={() => {
              health.refetch();
              prompt.refetch();
            }}
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
      />

      <div className="sr-kpi-row">
        <Kpi label="Provider" value={health.data?.provider ?? 'anthropic'} tone={statusTone} icon={<Activity size={15} />} />
        <Kpi label="Credential" value={configured ? health.data?.source ?? 'configured' : 'missing'} tone={configured ? 'success' : 'danger'} icon={<CheckCircle2 size={15} />} />
        <Kpi label="Reachability" value={health.data?.reachable ? 'reachable' : 'blocked'} tone={health.data?.reachable ? 'success' : 'danger'} icon={<Activity size={15} />} />
        <Kpi label="Latency" value={health.data?.latencyMs == null ? 'n/a' : `${health.data.latencyMs}ms`} tone="" icon={<RefreshCw size={15} />} />
      </div>

      {!configured && (
        <div className="empty-state" style={{ marginBottom: 16 }}>
          <XCircle size={18} />
          <div>
            <strong>Anthropic credential is not configured</strong>
            <span>Save a tenant Anthropic API key before running transcript resolution.</span>
          </div>
        </div>
      )}

      <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(360px, .8fr)' }}>
        <section className="section">
          <div className="section-title-row">
            <h3>Provider status</h3>
            <StatusPill tone={statusTone} label={health.data?.status ?? 'unknown'} />
          </div>
          <div className="detail-grid">
            <Detail label="Source" value={health.data?.source ?? 'none'} />
            <Detail label="Model listing" value={health.data?.modelCount == null ? 'not verified' : `${health.data.modelCount} model(s)`} />
            <Detail label="Checked" value={formatDate(health.data?.checkedAt)} />
            <Detail label="Credential required" value={health.data?.credentialRequired ? 'yes' : 'no'} />
          </div>
          {health.data?.error && (
            <div className="error-state" style={{ marginTop: 14 }}>
              <AlertTriangle size={16} />
              <span>{health.data.error}</span>
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-title-row">
            <h3>Transcript resolver probe</h3>
            <button type="button" className="btn primary" onClick={() => resolverProbe.mutate()} disabled={!configured || resolverProbe.isPending}>
              {resolverProbe.isPending ? <RefreshCw className="spin" size={14} /> : <Send size={14} />}
              {resolverProbe.isPending ? 'Running' : 'Run test'}
            </button>
          </div>
          <p className="hint">Uses the live tenant key and the real Anthropic messages API.</p>
          {probeError && (
            <div className="error-state" style={{ marginTop: 14 }}>
              <AlertTriangle size={16} />
              <span>{probeError}</span>
            </div>
          )}
          {probeOutput && (
            <div className="code-block" style={{ marginTop: 14, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(probeOutput, null, 2)}
            </div>
          )}
          {!resolverProbe.isPending && !probeError && !probeOutput && (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <FileText size={18} />
              <div>
                <strong>No resolver probe has been run in this view</strong>
                <span>Run the test to produce the roadmap transcript JSON proof.</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="section" style={{ marginTop: 16 }}>
        <div className="section-title-row">
          <h3>Resolver prompt registry</h3>
          <StatusPill tone={prompt.data?.promptKey === 'ai.transcript-resolver' ? 'success' : 'danger'} label={prompt.data?.promptKey ?? 'missing'} />
        </div>
        <div className="detail-grid">
          <Detail label="Version" value={prompt.data?.promptVersion ?? 'unknown'} />
          <Detail label="Prompt size" value={`${promptStats.chars} chars`} />
          <Detail label="Enum lines" value={`${promptStats.enumLines}`} />
        </div>
        <div className="code-block" style={{ marginTop: 14, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {prompt.data?.prompt}
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      {icon}
      <div>
        <div className="val">{value}</div>
        <div className="lbl">{label}</div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: string; label: string }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function statusToneFor(health: AiHealthResponse | undefined) {
  if (!health) return 'warn';
  if (health.status === 'ok') return 'success';
  if (health.status === 'missing_credentials' || health.status === 'invalid_credentials') return 'danger';
  return 'warn';
}

function formatDate(value: string | undefined) {
  if (!value) return 'not checked';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export const Route = createFileRoute('/settings/ai/health')({ component: HealthView });
