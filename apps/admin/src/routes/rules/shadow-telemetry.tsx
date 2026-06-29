import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WorkflowRuleDto } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import {
  fetchWorkflowRuleBackfills,
  fetchWorkflowRuleExecutions,
  fetchWorkflowRules,
  runWorkflowRuleBackfill,
} from '@/lib/rules';

function ShadowTelemetryView() {
  const queryClient = useQueryClient();
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [days, setDays] = useState(7);
  const rulesQuery = useQuery({ queryKey: ['rules', 'shadow-telemetry', 'rules'], queryFn: fetchWorkflowRules });
  const rules = rulesQuery.data?.rules ?? [];
  const shadowRules = rules.filter((rule) => rule.status === 'shadow');
  const selectedRule = useMemo(() => {
    const explicit = rules.find((rule) => rule.id === selectedRuleId);
    return explicit ?? shadowRules[0] ?? rules[0] ?? null;
  }, [rules, selectedRuleId, shadowRules]);

  const backfillsQuery = useQuery({
    queryKey: ['rules', 'shadow-telemetry', 'backfills', selectedRule?.id ?? 'none'],
    queryFn: () => fetchWorkflowRuleBackfills(selectedRule?.id ?? ''),
    enabled: Boolean(selectedRule?.id),
  });
  const executionsQuery = useQuery({
    queryKey: ['rules', 'shadow-telemetry', 'executions', selectedRule?.id ?? 'none'],
    queryFn: () => fetchWorkflowRuleExecutions(selectedRule?.id ?? ''),
    enabled: Boolean(selectedRule?.id),
  });
  const runShadow = useMutation({
    mutationFn: () => {
      if (!selectedRule) throw new Error('Select a rule before running shadow telemetry.');
      return runWorkflowRuleBackfill(selectedRule.id, days);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['rules', 'shadow-telemetry', 'backfills', result.report.ruleId] }),
        queryClient.invalidateQueries({ queryKey: ['rules', 'shadow-telemetry', 'executions', result.report.ruleId] }),
      ]);
    },
  });

  const reports = backfillsQuery.data?.reports ?? [];
  const latest = reports[0] ?? null;
  const shadowExecutions = (executionsQuery.data?.executions ?? []).filter((row) => row.executionMode === 'shadow');
  const totalVirtualTasks = reports.reduce((sum, report) => sum + report.wouldCreateTasks, 0);
  const totalActualTasks = reports.reduce((sum, report) => sum + report.actualTasksCreated, 0);
  const hasError = rulesQuery.error ?? backfillsQuery.error ?? executionsQuery.error ?? runShadow.error;

  return (
    <>
      <PageHeader titleI18nKey="nav.shadow_telemetry" subtitleI18nKey="rules.shadow_telemetry_subtitle" />
      <div className="rules-health-strip">
        <Metric label="Shadow rules" value={shadowRules.length} detail={`${rules.length} total rules`} />
        <Metric label="Virtual tasks" value={totalVirtualTasks} detail="from stored shadow reports" />
        <Metric label="Actual tasks" value={totalActualTasks} detail={totalActualTasks === 0 ? 'no mutation' : 'mutation detected'} />
        <Metric label="Retention" value="30d" detail="inspect recent reports and executions" />
      </div>

      {rulesQuery.isLoading && <State title="Loading shadow telemetry" body="Reading live workflow rules from the API." />}
      {hasError && <State title="Shadow telemetry failed" body={apiErrorMessage(hasError)} tone="error" />}
      {rulesQuery.isSuccess && rules.length === 0 && <State title="No workflow rules" body="Create a rule before running dry-run telemetry." />}

      {selectedRule && (
        <section className="section">
          <h3><span>Dry-run control</span><span className="meta">{selectedRule.name}</span></h3>
          <div className="orders-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={selectedRule.id} onChange={(event) => setSelectedRuleId(event.target.value)} aria-label="Shadow telemetry rule">
              {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} - {rule.status}</option>)}
            </select>
            <input type="number" min={1} max={30} value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Shadow telemetry days" />
            <button type="button" className="btn primary" disabled={runShadow.isPending} onClick={() => runShadow.mutate()}>
              {runShadow.isPending ? <RefreshCw size={14} className="spin" /> : <Activity size={14} />} Run dry-run
            </button>
          </div>
          {selectedRule.status !== 'shadow' ? (
            <div className="state-block error"><p>This rule is {selectedRule.status}. Dry-run still records a no-mutation report, but promote rules through the Rule engine intentionally.</p></div>
          ) : null}
        </section>
      )}

      {selectedRule && (
        <div className="call-center-kanban">
          <section className="call-center-panel">
            <PanelHead title="Active vs shadow diff" meta={latest ? `${latest.matchedEvents}/${latest.evaluatedEvents} matched` : 'no report'} />
            {!latest && !backfillsQuery.isLoading ? <Empty>No shadow report for this rule yet.</Empty> : null}
            {backfillsQuery.isLoading ? <Empty>Loading reports...</Empty> : null}
            {latest ? (
              <div className="rule-card">
                <div className="rule-card-head">
                  <span className={`pill ${latest.actualTasksCreated === 0 ? 'success' : 'warn'}`}>{latest.actualTasksCreated === 0 ? 'no mutation' : 'mutated'}</span>
                  <span className="muted">{new Date(latest.createdAt).toLocaleString()}</span>
                </div>
                <div className="rule-card-name">{latest.recentDays}d dry-run</div>
                <div className="rule-card-desc">
                  evaluated {latest.evaluatedEvents}, matched {latest.matchedEvents}, skipped {latest.skippedEvents}, virtual tasks {latest.wouldCreateTasks}
                </div>
              </div>
            ) : null}
          </section>

          <section className="call-center-panel">
            <PanelHead title="Shadow execution samples" meta={`${shadowExecutions.length} executions`} />
            {executionsQuery.isLoading ? <Empty>Loading executions...</Empty> : null}
            {!executionsQuery.isLoading && shadowExecutions.length === 0 ? <Empty>No shadow executions recorded for this rule.</Empty> : null}
            <div className="call-center-list">
              {shadowExecutions.slice(0, 20).map((execution) => (
                <div key={execution.id} className="call-center-list-row">
                  <Activity size={14} />
                  <div>
                    <strong>{execution.trigger}</strong>
                    <span>{execution.status} - {execution.conditionTrace.filter((trace) => trace.matched).length}/{execution.conditionTrace.length} conditions</span>
                  </div>
                  <em>{new Date(execution.updatedAt).toLocaleString()}</em>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return <header className="call-center-panel-head"><h3>{title}</h3><span>{meta}</span></header>;
}

function Empty({ children }: { children: string }) {
  return <div className="call-center-empty">{children}</div>;
}

function State({ title, body, tone }: { title: string; body: string; tone?: 'error' }) {
  return (
    <div className={`state-block${tone === 'error' ? ' error' : ''}`}>
      {tone === 'error' ? <AlertTriangle size={16} /> : null}
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export const Route = createFileRoute('/rules/shadow-telemetry')({ component: ShadowTelemetryView });
