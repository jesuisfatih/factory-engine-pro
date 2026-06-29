import { useMemo, useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TRANSCRIPT_RESOLVER_SCHEMA_VERSION } from '@factory-engine-pro/contracts';
import type { RollingBackfillRunResponse, ShopifySyncResource } from '@factory-engine-pro/contracts';
import { AlertTriangle, CalendarClock, CheckCircle2, Database, GitBranch, PhoneCall, RefreshCw, UsersRound, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

const SHOPIFY_SYNC_QUERY_KEY = ['shopify', 'sync-status'] as const;
const ROLLING_BACKFILL_QUERY_KEY = ['backfill', 'rolling-7d'] as const;
const RESOURCES = ['customers', 'products', 'orders'] as const satisfies readonly ShopifySyncResource[];
const ROLLING_RESOURCES = ['customers', 'orders'] as const satisfies readonly ShopifySyncResource[];
const AXES = ['sales', 'support', 'account'] as const;

type StepKey = 'shopifySync' | 'segments' | 'aircall' | 'axis';
type StepStatus = 'idle' | 'running' | 'success' | 'error';

interface StepState {
  status: StepStatus;
  summary: string;
  detail: unknown;
}

const STEP_DEFS: Array<{
  key: StepKey;
  titleKey: string;
  bodyKey: string;
  icon: typeof Database;
}> = [
  { key: 'shopifySync', titleKey: 'settings.initial_setup.step_shopify_title', bodyKey: 'settings.initial_setup.step_shopify_body', icon: Database },
  { key: 'segments', titleKey: 'settings.initial_setup.step_segments_title', bodyKey: 'settings.initial_setup.step_segments_body', icon: GitBranch },
  { key: 'aircall', titleKey: 'settings.initial_setup.step_aircall_title', bodyKey: 'settings.initial_setup.step_aircall_body', icon: PhoneCall },
  { key: 'axis', titleKey: 'settings.initial_setup.step_axis_title', bodyKey: 'settings.initial_setup.step_axis_body', icon: UsersRound },
];

const EMPTY_STEPS: Record<StepKey, StepState> = {
  shopifySync: { status: 'idle', summary: '', detail: null },
  segments: { status: 'idle', summary: '', detail: null },
  aircall: { status: 'idle', summary: '', detail: null },
  axis: { status: 'idle', summary: '', detail: null },
};

function InitialSetupView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canTriggerSync = useCan('sync.trigger');
  const canWriteSegments = useCan('segments.write');
  const canWriteCustomers = useCan('customers.write');
  const canReadMembers = useCan('members.read');
  const canWriteAircall = useCan('aircall.users.write');
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(EMPTY_STEPS);
  const [hasRun, setHasRun] = useState(false);

  const missingPermissions = useMemo(() => [
    canTriggerSync ? null : 'sync.trigger',
    canWriteSegments ? null : 'segments.write',
    canWriteCustomers ? null : 'customers.write',
    canReadMembers ? null : 'members.read',
    canWriteAircall ? null : 'aircall.users.write',
  ].filter(Boolean) as string[], [canReadMembers, canTriggerSync, canWriteAircall, canWriteCustomers, canWriteSegments]);

  const syncStatus = useQuery({
    queryKey: SHOPIFY_SYNC_QUERY_KEY,
    queryFn: () => adminApi.shopifySyncStatus(),
    refetchInterval: (query) => query.state.data?.isAnySyncing ? 5000 : false,
  });
  const rollingStatus = useQuery({
    queryKey: ROLLING_BACKFILL_QUERY_KEY,
    queryFn: () => adminApi.rollingBackfillStatus(),
    refetchInterval: (query) => query.state.data?.recentRuns.some((run) => run.status === 'queued' || run.status === 'running') ? 5000 : false,
  });

  const setStep = (key: StepKey, state: StepState) => {
    setSteps((current) => ({ ...current, [key]: state }));
  };

  const warmup = useMutation({
    mutationFn: async () => {
      setHasRun(true);
      setSteps(EMPTY_STEPS);

      await runStep(setStep, 'shopifySync', () => adminApi.triggerShopifyInitialSync({ resources: [...RESOURCES] }), (result) => (
        t('settings.initial_setup.shopify_summary', {
          resources: result.resources.join(', '),
          batchId: result.batchId,
          queued: result.queued ? t('common.yes') : t('common.no'),
        })
      ));

      await runStep(setStep, 'segments', () => adminApi.evaluateAllSegments(), (result) => summarizeUnknown(result));

      await runStep(setStep, 'aircall', () => adminApi.reprocessResolvedAircall({
        targetVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
        limit: 1000,
      }), (result) => (
        t('settings.initial_setup.aircall_summary', {
          queued: result.queued,
          scanned: result.scanned,
          skipped: result.skipped,
          version: result.targetVersion,
        })
      ));

      await runStep(setStep, 'axis', () => adminApi.assignDefaultCustomerAxis({
        axes: [...AXES],
        limit: 10000,
        onlyMissing: true,
        source: 'initial_setup',
        reason: 'Initial setup default customer axis warmup',
      }), (result) => (
        t('settings.initial_setup.axis_summary', {
          assigned: result.assigned,
          scanned: result.scanned,
          skipped: result.skippedExisting,
          noOwner: result.skippedNoOwner,
        })
      ));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SHOPIFY_SYNC_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['segments'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['aircall', 'calls'] });
      qc.invalidateQueries({ queryKey: ['support'] });
      toast.success(t('settings.initial_setup.completed_toast'));
    },
    onError: (error) => toast.error(t('settings.initial_setup.failed_toast'), { description: apiErrorMessage(error) }),
  });

  const rollingBackfill = useMutation({
    mutationFn: () => adminApi.triggerRollingBackfill({
      recentDays: 7,
      shopifyResources: [...ROLLING_RESOURCES],
      shopifySegmentLimit: 100,
      aircallMaxPages: 40,
      resolverLimit: 1000,
      targetResolverVersion: TRANSCRIPT_RESOLVER_SCHEMA_VERSION,
    }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ROLLING_BACKFILL_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SHOPIFY_SYNC_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['segments'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['aircall', 'calls'] });
      qc.invalidateQueries({ queryKey: ['support'] });
      toast.success(t('settings.initial_setup.rolling_toast'), { description: result.message });
    },
    onError: (error) => toast.error(t('settings.initial_setup.rolling_failed_toast'), { description: apiErrorMessage(error) }),
  });

  const statusRows = syncStatus.data
    ? RESOURCES.flatMap((resource) => {
      const row = syncStatus.data.entities[resource];
      return row ? [row] : [];
    })
    : [];
  const canRun = missingPermissions.length === 0 && !syncStatus.data?.credentialRequired;

  return (
    <div className="integration-page" id="initial-setup-page">
      <section className="webhook-card" id="initial-setup-header">
        <div className="head">
          <div>
            <div className="label" data-i18n-key="settings.initial_setup.label">{t('settings.initial_setup.label')}</div>
            <h3 data-i18n-key="settings.initial_setup.title">{t('settings.initial_setup.title')}</h3>
            <div className="sub" data-i18n-key="settings.initial_setup.subtitle">{t('settings.initial_setup.subtitle')}</div>
          </div>
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={() => syncStatus.refetch()} disabled={syncStatus.isFetching}>
              <RefreshCw size={13} /> {t('common.refresh')}
            </button>
            <button
              id="btn-run-initial-setup"
              type="button"
              className="btn primary"
              onClick={() => warmup.mutate()}
              disabled={!canRun || warmup.isPending || syncStatus.isLoading}
            >
              <Database size={13} /> {warmup.isPending ? t('settings.initial_setup.running') : t('settings.initial_setup.run')}
            </button>
          </div>
        </div>

        {syncStatus.isLoading && <StateBlock title={t('common.loading')} body={t('settings.initial_setup.loading_body')} />}
        {syncStatus.isError && (
          <StateBlock
            title={t('settings.initial_setup.sync_error_title')}
            body={apiErrorMessage(syncStatus.error)}
            icon={<XCircle size={18} color="var(--danger)" />}
          />
        )}
        {syncStatus.isSuccess && syncStatus.data.credentialRequired && (
          <StateBlock
            title={t('settings.initial_setup.credentials_required_title')}
            body={t('settings.initial_setup.credentials_required_body')}
            icon={<AlertTriangle size={18} color="var(--warn)" />}
          />
        )}
        {syncStatus.isSuccess && missingPermissions.length > 0 && (
          <div className="form-error" id="initial-setup-permission-error">
            {t('settings.initial_setup.permission_required', { permissions: missingPermissions.join(', ') })}
          </div>
        )}
      </section>

      <section className="config-card" id="initial-setup-shopify-status">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h3 data-i18n-key="settings.initial_setup.shopify_status_title">{t('settings.initial_setup.shopify_status_title')}</h3>
            <div className="sub" data-i18n-key="settings.initial_setup.shopify_status_sub">{t('settings.initial_setup.shopify_status_sub')}</div>
          </div>
          {syncStatus.data?.isAnySyncing ? <span className="pill warn">{t('settings.initial_setup.syncing')}</span> : <span className="pill success">{t('settings.initial_setup.ready')}</span>}
        </div>
        {syncStatus.isSuccess && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('settings.initial_setup.col_resource')}</th>
                  <th>{t('settings.initial_setup.col_status')}</th>
                  <th>{t('settings.initial_setup.col_snapshot')}</th>
                  <th>{t('settings.initial_setup.col_last_run')}</th>
                  <th>{t('settings.initial_setup.col_completed')}</th>
                  <th>{t('settings.initial_setup.col_error')}</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((row) => (
                  <tr key={row.resource}>
                    <td>{row.resource}</td>
                    <td><span className={`pill ${row.status === 'completed' ? 'success' : row.status === 'failed' ? 'danger' : row.isRunning ? 'warn' : ''}`}>{row.status}</span></td>
                    <td>{row.snapshotRecords}</td>
                    <td>{row.lastRunRecords}</td>
                    <td>{formatDate(row.lastCompletedAt)}</td>
                    <td>{row.lastError ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="config-card" id="initial-setup-progress">
        <div style={{ marginBottom: 14 }}>
          <h3 data-i18n-key="settings.initial_setup.progress_title">{t('settings.initial_setup.progress_title')}</h3>
          <div className="sub" data-i18n-key="settings.initial_setup.progress_sub">{t('settings.initial_setup.progress_sub')}</div>
        </div>
        {!hasRun && !warmup.isPending && (
          <StateBlock
            title={t('settings.initial_setup.empty_title')}
            body={t('settings.initial_setup.empty_body')}
            action={canRun ? (
              <button type="button" className="btn primary" onClick={() => warmup.mutate()}>
                <Database size={13} /> {t('settings.initial_setup.run')}
              </button>
            ) : undefined}
          />
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          {STEP_DEFS.map((step) => (
            <SetupStep key={step.key} title={t(step.titleKey)} body={t(step.bodyKey)} state={steps[step.key]} icon={step.icon} />
          ))}
        </div>
      </section>

      <section className="config-card" id="initial-setup-rolling-backfill">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h3 data-i18n-key="settings.initial_setup.rolling_title">{t('settings.initial_setup.rolling_title')}</h3>
            <div className="sub" data-i18n-key="settings.initial_setup.rolling_sub">{t('settings.initial_setup.rolling_sub')}</div>
          </div>
          <button
            id="btn-run-rolling-7d-backfill"
            type="button"
            className="btn primary"
            onClick={() => rollingBackfill.mutate()}
            disabled={!canRun || rollingBackfill.isPending || syncStatus.isLoading}
          >
            <CalendarClock size={13} /> {rollingBackfill.isPending ? t('settings.initial_setup.rolling_running') : t('settings.initial_setup.rolling_run')}
          </button>
        </div>
        {rollingStatus.isLoading && <StateBlock title={t('common.loading')} body={t('settings.initial_setup.rolling_loading')} />}
        {rollingStatus.isError && (
          <StateBlock
            title={t('settings.initial_setup.rolling_error_title')}
            body={apiErrorMessage(rollingStatus.error)}
            icon={<XCircle size={18} color="var(--danger)" />}
          />
        )}
        {rollingStatus.isSuccess && rollingStatus.data.recentRuns.length === 0 && (
          <StateBlock
            title={t('settings.initial_setup.rolling_empty_title')}
            body={t('settings.initial_setup.rolling_empty_body')}
            action={canRun ? (
              <button type="button" className="btn primary" onClick={() => rollingBackfill.mutate()} disabled={rollingBackfill.isPending}>
                <CalendarClock size={13} /> {t('settings.initial_setup.rolling_run')}
              </button>
            ) : undefined}
          />
        )}
        {rollingStatus.isSuccess && rollingStatus.data.recentRuns.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="webhook-warning" style={{ justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong>{t('settings.initial_setup.rolling_scheduler_title')}</strong>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  {t('settings.initial_setup.rolling_scheduler_body', { count: rollingStatus.data.schedulerCount })}
                </p>
              </div>
              <span className={`pill ${rollingStatus.data.queueConfigured && rollingStatus.data.schedulerCount > 0 ? 'success' : 'warn'}`}>
                {rollingStatus.data.queueConfigured && rollingStatus.data.schedulerCount > 0 ? t('settings.initial_setup.scheduled') : t('settings.initial_setup.not_scheduled')}
              </span>
            </div>
            {rollingStatus.data.recentRuns.map((run) => (
              <RollingRun key={run.syncLogId} run={run} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function runStep<T>(
  setStep: (key: StepKey, state: StepState) => void,
  key: StepKey,
  action: () => Promise<T>,
  summarize: (result: T) => string,
) {
  setStep(key, { status: 'running', summary: '', detail: null });
  try {
    const result = await action();
    setStep(key, { status: 'success', summary: summarize(result), detail: result });
    return result;
  } catch (error) {
    setStep(key, { status: 'error', summary: apiErrorMessage(error), detail: null });
    throw error;
  }
}

function SetupStep({ title, body, state, icon: Icon }: { title: string; body: string; state: StepState; icon: typeof Database }) {
  const statusIcon = state.status === 'success'
    ? <CheckCircle2 size={16} color="var(--success)" />
    : state.status === 'error'
      ? <XCircle size={16} color="var(--danger)" />
      : state.status === 'running'
        ? <RefreshCw size={16} className="spin" />
        : <Icon size={16} />;

  return (
    <div className="webhook-warning" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
        <div style={{ marginTop: 1 }}>{statusIcon}</div>
        <div style={{ minWidth: 0 }}>
          <strong>{title}</strong>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>{state.summary || body}</p>
          {state.detail ? <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(state.detail, null, 2)}</pre> : null}
        </div>
      </div>
      <span className={`pill ${state.status === 'success' ? 'success' : state.status === 'error' ? 'danger' : state.status === 'running' ? 'warn' : ''}`}>{state.status}</span>
    </div>
  );
}

function StateBlock({ title, body, action, icon }: { title: string; body: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      {icon && <div style={{ marginBottom: 10 }}>{icon}</div>}
      <div className="title">{title}</div>
      <div className="note">{body}</div>
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function RollingRun({ run }: { run: RollingBackfillRunResponse }) {
  return (
    <div className="webhook-warning" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <strong>{run.message}</strong>
        <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
          {run.source} / {run.recentDays}d / {formatDate(run.startedAt)} / {run.finishedAt ? formatDate(run.finishedAt) : '-'}
        </p>
        {run.steps.length > 0 && (
          <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
            {run.steps.map((step) => (
              <div key={`${run.syncLogId}-${step.key}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{step.key.replace(/_/g, ' ')}: {step.message}</span>
                <span className={`pill ${statusPill(step.status)}`}>{step.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className={`pill ${statusPill(run.status)}`}>{run.status}</span>
    </div>
  );
}

function summarizeUnknown(value: unknown) {
  if (value && typeof value === 'object') {
    const evaluated = 'evaluated' in value ? Number((value as { evaluated?: unknown }).evaluated) : null;
    const segments = 'segments' in value ? Number((value as { segments?: unknown }).segments) : null;
    if (Number.isFinite(evaluated)) return `${evaluated} segment evaluation job(s) completed.`;
    if (Number.isFinite(segments)) return `${segments} segment(s) evaluated.`;
  }
  return 'Completed against the live tenant API.';
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusPill(status: string) {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'partial_success' || status === 'queued' || status === 'running' || status === 'skipped') return 'warn';
  return '';
}

export const Route = createFileRoute('/settings/initial-setup')({ component: InitialSetupView });
