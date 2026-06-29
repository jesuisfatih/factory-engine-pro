import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, Send, XCircle } from 'lucide-react';
import type { AiHealthResponse, TranscriptResolverTestResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';

const AI_HEALTH_QK = ['ai', 'health'] as const;
const AI_PROMPT_QK = ['ai', 'resolver-prompt'] as const;
const PROBE_TRANSCRIPT = [
  'Customer called about a delayed order and asked for tracking.',
  'They sounded frustrated, requested a same day update, and mentioned moving future work elsewhere.',
].join(' ');

interface ResolverPromptResponse {
  promptKey: string;
  promptVersion: string;
  prompt: string;
}

interface LogRow {
  id: string;
  time: string;
  service: string;
  model: string;
  prompt: string;
  latency: string;
  status: 'success' | 'fail';
  message: string;
}

function UsageLogView() {
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
  const resolverProbe = useMutation({
    mutationFn: () => adminApi.aiTranscriptResolverTest({
      transcript: PROBE_TRANSCRIPT,
      metadata: {
        source: 'admin-ai-usage-log',
        purpose: 'live-resolver-call-log',
      },
    }) as Promise<TranscriptResolverTestResponse>,
  });

  const rows = rowsFromState(health.data, prompt.data, resolverProbe.data, resolverProbe.error, resolverProbe.isError);
  const error = health.isError ? apiErrorMessage(health.error) : prompt.isError ? apiErrorMessage(prompt.error) : null;

  return (
    <>
      <div className="log-filters" id="ai-log-filters">
        <button
          id="btn-ai-log-refresh"
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
        <button
          id="btn-ai-log-run-resolver"
          type="button"
          className="btn primary"
          onClick={() => resolverProbe.mutate()}
          disabled={!health.data?.configured || resolverProbe.isPending}
        >
          {resolverProbe.isPending ? <RefreshCw className="spin" size={13} /> : <Send size={13} />}
          {resolverProbe.isPending ? 'Running' : 'Run resolver call'}
        </button>
      </div>

      {error && (
        <div className="error-state">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="data-card">
        <table className="data-table" id="ai-log-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Service</th>
              <th>Model</th>
              <th>Prompt</th>
              <th style={{ textAlign: 'right' }}>Latency</th>
              <th style={{ textAlign: 'right' }}>Status</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {(health.isLoading || prompt.isLoading) && (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: 'var(--text-muted)' }}>
                  <RefreshCw className="spin" size={14} /> Loading live resolver request state
                </td>
              </tr>
            )}
            {!health.isLoading && !prompt.isLoading && rows.map((row) => (
              <tr key={row.id} id={`ai-log-${row.id}`}>
                <td className="muted">{row.time}</td>
                <td><span className="service-badge aircall">{row.service}</span></td>
                <td className="muted">{row.model}</td>
                <td className="muted">{row.prompt}</td>
                <td style={{ textAlign: 'right' }} className="muted">{row.latency}</td>
                <td style={{ textAlign: 'right' }}>
                  {row.status === 'success'
                    ? <span className="status-success" title="success"><CheckCircle2 size={14} /></span>
                    : <span className="status-fail" title="fail"><XCircle size={14} /></span>}
                </td>
                <td className="muted">{row.message}</td>
              </tr>
            ))}
            {!health.isLoading && !prompt.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)' }}>
                  <FileText size={16} /> No live resolver request state is available yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function rowsFromState(
  health: AiHealthResponse | undefined,
  prompt: ResolverPromptResponse | undefined,
  probe: TranscriptResolverTestResponse | undefined,
  probeError: unknown,
  probeFailed: boolean,
): LogRow[] {
  const rows: LogRow[] = [];
  if (health) {
    rows.push({
      id: 'provider-health',
      time: formatDate(health.checkedAt),
      service: 'anthropic_health',
      model: health.modelCount == null ? 'models' : `${health.modelCount} model(s)`,
      prompt: 'provider',
      latency: health.latencyMs == null ? 'n/a' : `${health.latencyMs}ms`,
      status: health.status === 'ok' ? 'success' : 'fail',
      message: health.error ?? health.resolverError ?? health.status,
    });
    rows.push({
      id: 'resolver-health',
      time: formatDate(health.checkedAt),
      service: 'transcript_resolver',
      model: 'messages',
      prompt: 'ai.transcript-resolver',
      latency: health.latencyMs == null ? 'n/a' : `${health.latencyMs}ms`,
      status: health.resolverReachable ? 'success' : 'fail',
      message: health.resolverError ?? health.resolverStatus,
    });
  }
  if (prompt) {
    rows.push({
      id: 'prompt-registry',
      time: 'current',
      service: 'prompt_registry',
      model: prompt.promptVersion,
      prompt: prompt.promptKey,
      latency: 'n/a',
      status: prompt.promptKey === 'ai.transcript-resolver' ? 'success' : 'fail',
      message: `${prompt.prompt.length} chars`,
    });
  }
  if (probe) {
    rows.unshift({
      id: 'resolver-test',
      time: formatDate(probe.checkedAt),
      service: 'transcript_resolver',
      model: probe.model,
      prompt: probe.promptKey,
      latency: `${probe.latencyMs}ms`,
      status: 'success',
      message: probe.output.summary,
    });
  } else if (probeFailed) {
    rows.unshift({
      id: 'resolver-test-failed',
      time: 'latest',
      service: 'transcript_resolver',
      model: 'messages',
      prompt: 'ai.transcript-resolver',
      latency: 'n/a',
      status: 'fail',
      message: apiErrorMessage(probeError),
    });
  }
  return rows;
}

function formatDate(value: string | undefined) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/ai/usage-log')({ component: UsageLogView });
