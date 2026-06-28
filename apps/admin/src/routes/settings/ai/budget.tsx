import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet, XCircle, Zap } from 'lucide-react';
import type { AiHealthResponse } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';

const AI_HEALTH_QK = ['ai', 'health'] as const;

function BudgetView() {
  const health = useQuery({
    queryKey: AI_HEALTH_QK,
    queryFn: () => adminApi.aiHealth() as Promise<AiHealthResponse>,
    retry: false,
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          id="btn-ai-budget-refresh"
          type="button"
          className="btn ghost"
          onClick={() => health.refetch()}
          disabled={health.isFetching}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {health.isLoading && (
        <section className="section workspace-state">
          <RefreshCw className="spin" size={18} />
          <div>
            <h3>Checking provider credit state</h3>
            <p>Reading the live Anthropic resolver status.</p>
          </div>
        </section>
      )}

      {health.isError && (
        <div className="error-state">
          <AlertTriangle size={16} />
          <span>{apiErrorMessage(health.error)}</span>
        </div>
      )}

      {health.data && (
        <>
          <div className="budget-card" id="budget-provider-state">
            <div className="row">
              <div>
                <h3>
                  <Wallet size={14} style={{ color: resolverOk(health.data) ? 'var(--success)' : 'var(--danger)' }} />
                  <span>Anthropic provider guard</span>
                </h3>
                <div className="spend">{resolverOk(health.data) ? 'Ready' : 'Blocked'}</div>
                <div className="meta">{health.data.resolverError ?? health.data.error ?? health.data.status}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 11 }}>Last check {formatDate(health.data.checkedAt)}</div>
                <div className="pct">{health.data.resolverReachable ? 'OK' : 'FAIL'}</div>
              </div>
            </div>
          </div>

          <div className="stat-row">
            <StateCard
              id="budget-credential-state"
              icon={health.data.configured ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              label="Credential"
              value={health.data.configured ? health.data.source : 'missing'}
              ok={health.data.configured}
            />
            <StateCard
              id="budget-models-state"
              icon={health.data.reachable ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              label="Models API"
              value={health.data.reachable ? `${health.data.modelCount ?? 0} model(s)` : health.data.status}
              ok={health.data.reachable}
            />
            <StateCard
              id="budget-resolver-state"
              icon={health.data.resolverReachable ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              label="Resolver API"
              value={health.data.resolverStatus}
              ok={health.data.resolverReachable}
            />
            <StateCard
              id="budget-latency-state"
              icon={<Zap size={16} />}
              label="Health latency"
              value={health.data.latencyMs == null ? 'n/a' : `${health.data.latencyMs}ms`}
              ok={health.data.latencyMs != null && health.data.latencyMs < 5000}
            />
          </div>

          {!health.data.resolverReachable && (
            <div className="error-state">
              <AlertTriangle size={16} />
              <span>{health.data.resolverError ?? health.data.error ?? 'Anthropic resolver is not reachable.'}</span>
            </div>
          )}

          <div className="budget-card" id="budget-settings">
            <h3>Runtime limits</h3>
            <div className="budget-settings-row">
              <span className="lbl">Provider</span>
              <span className="val">{health.data.provider}</span>
            </div>
            <div className="budget-settings-row">
              <span className="lbl">Credential required</span>
              <span className="val">{health.data.credentialRequired ? 'yes' : 'no'}</span>
            </div>
            <div className="budget-settings-row">
              <span className="lbl">Resolver status</span>
              <span className="val">{health.data.resolverStatus}</span>
            </div>
            <div className="budget-readonly-note">
              Local spend totals are not shown until the resolver persists provider usage rows. Provider credit failures are surfaced from the live Anthropic API response above.
            </div>
          </div>
        </>
      )}
    </>
  );
}

function StateCard({ id, icon, label, value, ok }: { id: string; icon: React.ReactNode; label: string; value: string; ok: boolean }) {
  return (
    <div className="stat-card" id={id}>
      <div className="icon-wrap" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{icon}</div>
      <div>
        <div className="lbl">{label}</div>
        <div className="v">{value}</div>
      </div>
    </div>
  );
}

function resolverOk(health: AiHealthResponse) {
  return health.configured && health.reachable && health.resolverReachable;
}

function formatDate(value: string | undefined) {
  if (!value) return 'n/a';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export const Route = createFileRoute('/settings/ai/budget')({ component: BudgetView });
