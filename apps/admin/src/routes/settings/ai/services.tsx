import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, FileText, RefreshCw, Send, XCircle } from 'lucide-react';
import type { AiHealthResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';

const AI_HEALTH_QK = ['ai', 'health'] as const;
const AI_PROMPT_QK = ['ai', 'resolver-prompt'] as const;

interface ResolverPromptResponse {
  promptKey: string;
  promptVersion: string;
  prompt: string;
}

function ServicesView() {
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

  const loading = health.isLoading || prompt.isLoading;
  const error = health.isError ? apiErrorMessage(health.error) : prompt.isError ? apiErrorMessage(prompt.error) : null;

  if (loading) {
    return (
      <section className="section workspace-state">
        <RefreshCw className="spin" size={18} />
        <div>
          <h3>Loading resolver services</h3>
          <p>Checking the live Anthropic provider, resolver endpoint, and prompt registry.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="section workspace-state error-state">
        <AlertTriangle size={18} />
        <div>
          <h3>Resolver services could not load</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              health.refetch();
              prompt.refetch();
            }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </section>
    );
  }

  const promptLines = prompt.data?.prompt.split('\n').filter((line) => line.trim().length > 0).length ?? 0;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Live resolver service registry
        </div>
        <button
          id="btn-ai-services-refresh"
          type="button"
          className="btn ghost"
          onClick={() => {
            health.refetch();
            prompt.refetch();
          }}
          disabled={health.isFetching || prompt.isFetching}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="service-grid" id="ai-service-grid">
        <ServiceCard
          id="anthropic-provider"
          icon={<Activity size={16} />}
          title="Anthropic provider"
          subtitle={`credential source: ${health.data?.source ?? 'none'}`}
          ok={Boolean(health.data?.reachable)}
          metrics={[
            ['Status', health.data?.status ?? 'unknown'],
            ['Models', health.data?.modelCount == null ? 'n/a' : String(health.data.modelCount)],
            ['Latency', health.data?.latencyMs == null ? 'n/a' : `${health.data.latencyMs}ms`],
            ['Checked', formatDate(health.data?.checkedAt)],
          ]}
        />
        <ServiceCard
          id="transcript-resolver"
          icon={<Send size={16} />}
          title="Transcript resolver"
          subtitle="real messages API readiness"
          ok={Boolean(health.data?.resolverReachable)}
          metrics={[
            ['Status', health.data?.resolverStatus ?? 'not_checked'],
            ['Provider', health.data?.provider ?? 'anthropic'],
            ['Credential', health.data?.configured ? 'configured' : 'missing'],
            ['Required', health.data?.credentialRequired ? 'yes' : 'no'],
          ]}
        />
        <ServiceCard
          id="resolver-prompt-registry"
          icon={<FileText size={16} />}
          title="Resolver prompt registry"
          subtitle={prompt.data?.promptKey ?? 'missing'}
          ok={prompt.data?.promptKey === 'ai.transcript-resolver'}
          metrics={[
            ['Version', prompt.data?.promptVersion ?? 'unknown'],
            ['Characters', String(prompt.data?.prompt.length ?? 0)],
            ['Lines', String(promptLines)],
            ['Enum source', 'contracts'],
          ]}
        />
      </div>

      {(health.data?.error || health.data?.resolverError) && (
        <div className="error-state" style={{ marginTop: 14 }}>
          <AlertTriangle size={16} />
          <span>{health.data.resolverError ?? health.data.error}</span>
        </div>
      )}
    </>
  );
}

function ServiceCard({ id, icon, title, subtitle, ok, metrics }: {
  id: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  ok: boolean;
  metrics: Array<[string, string]>;
}) {
  return (
    <div className="service-card" id={`service-card-${id}`}>
      <div className="top">
        <span className="dot" style={{ background: ok ? 'var(--success)' : 'var(--danger)' }} />
        {icon}
        <div>
          <h4>{title}</h4>
          <div className="sub">{subtitle}</div>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          {ok ? <CheckCircle2 size={15} color="var(--success)" /> : <XCircle size={15} color="var(--danger)" />}
        </span>
      </div>
      <div className="body">
        {metrics.map(([label, value]) => (
          <div className="col" key={label}>
            <div className="label">{label}</div>
            <div className="val">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string | undefined) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/ai/services')({ component: ServicesView });
