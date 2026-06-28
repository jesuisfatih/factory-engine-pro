import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, RefreshCw } from 'lucide-react';
import type { AiHealthResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';

const PROMPT_QK = ['ai', 'resolver-prompt'] as const;
const HEALTH_QK = ['ai', 'health'] as const;

interface ResolverPromptResponse {
  promptKey: string;
  promptVersion: string;
  prompt: string;
}

function PromptsView() {
  const prompt = useQuery({
    queryKey: PROMPT_QK,
    queryFn: () => adminApi.aiResolverPrompt() as Promise<ResolverPromptResponse>,
    retry: false,
  });
  const health = useQuery({
    queryKey: HEALTH_QK,
    queryFn: () => adminApi.aiHealth() as Promise<AiHealthResponse>,
    retry: false,
  });

  const stats = useMemo(() => {
    const text = prompt.data?.prompt ?? '';
    return {
      charCount: text.length,
      tokenEstimate: Math.ceil(text.length / 4),
      enumLines: text.split('\n').filter((line) => line.includes(':') || line.includes('Use only')).length,
    };
  }, [prompt.data?.prompt]);

  if (prompt.isLoading || health.isLoading) {
    return (
      <section className="section workspace-state">
        <RefreshCw className="spin" size={18} />
        <div>
          <h3>Loading resolver prompt</h3>
          <p>Reading the live tenant resolver prompt and Anthropic health state.</p>
        </div>
      </section>
    );
  }

  if (prompt.isError || health.isError) {
    const error = prompt.error ?? health.error;
    return (
      <section className="section workspace-state error-state">
        <AlertTriangle size={18} />
        <div>
          <h3>Prompt registry could not load</h3>
          <p>{apiErrorMessage(error)}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              prompt.refetch();
              health.refetch();
            }}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!prompt.data?.prompt) {
    return (
      <section className="section empty-state">
        <FileText size={18} />
        <div>
          <strong>No resolver prompt is available</strong>
          <span>The backend did not return an active transcript resolver prompt.</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="log-filters" id="ai-prompt-filters">
        <button
          id="btn-ai-prompts-refresh"
          type="button"
          className="btn ghost"
          onClick={() => {
            prompt.refetch();
            health.refetch();
          }}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <div className="data-card">
        <table className="data-table" id="ai-prompt-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Prompt key</th>
              <th>Active version</th>
              <th>Model</th>
              <th style={{ textAlign: 'right' }}>Chars / est. tokens</th>
              <th style={{ textAlign: 'right' }}>Resolver health</th>
              <th style={{ textAlign: 'right' }}>Enum lines</th>
            </tr>
          </thead>
          <tbody>
            <tr id="prompt-ai-transcript-resolver">
              <td><span className="service-badge aircall">aircall</span></td>
              <td className="name">{prompt.data.promptKey}</td>
              <td><span className="pill">{prompt.data.promptVersion}</span></td>
              <td className="muted">tenant resolver model</td>
              <td style={{ textAlign: 'right' }} className="muted">{stats.charCount}c / ~{stats.tokenEstimate}t</td>
              <td style={{ textAlign: 'right' }}>
                <span className={`status-pill ${health.data?.status === 'ok' ? 'success' : 'danger'}`}>
                  {health.data?.status ?? 'unknown'}
                </span>
              </td>
              <td style={{ textAlign: 'right' }} className="muted">{stats.enumLines}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {health.data?.resolverError && (
        <div className="error-state" style={{ marginTop: 14 }}>
          <AlertTriangle size={16} />
          <span>{health.data.resolverError}</span>
        </div>
      )}

      <section className="section" style={{ marginTop: 16 }}>
        <div className="section-title-row">
          <h3>ai.transcript-resolver</h3>
          <span className={`status-pill ${health.data?.resolverReachable ? 'success' : 'danger'}`}>
            {health.data?.resolverReachable ? 'resolver ready' : 'resolver blocked'}
          </span>
        </div>
        <div className="code-block" style={{ maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
          {prompt.data.prompt}
        </div>
      </section>
    </>
  );
}

export const Route = createFileRoute('/settings/ai/prompts')({ component: PromptsView });
