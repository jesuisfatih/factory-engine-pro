import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, History, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { RulesTabs } from '@/components/RulesTabs';
import { apiErrorMessage } from '@/lib/api';
import {
  fetchWorkflowRuleActiveStats,
  fetchWorkflowRuleExecutions,
  fetchWorkflowRuleVersions,
  fetchWorkflowRules,
} from '@/lib/rules';

function RuleStatsView() {
  const [days, setDays] = useState(30);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const rulesQuery = useQuery({ queryKey: ['rules', 'stats', 'rules'], queryFn: fetchWorkflowRules });
  const statsQuery = useQuery({ queryKey: ['rules', 'stats', 'active', days], queryFn: () => fetchWorkflowRuleActiveStats(days) });
  const rules = rulesQuery.data?.rules ?? [];
  const selectedRule = useMemo(() => {
    const explicit = rules.find((rule) => rule.id === selectedRuleId);
    const firstStatRule = rules.find((rule) => rule.id === statsQuery.data?.rows[0]?.ruleId);
    return explicit ?? firstStatRule ?? rules[0] ?? null;
  }, [rules, selectedRuleId, statsQuery.data?.rows]);
  const executionsQuery = useQuery({
    queryKey: ['rules', 'stats', 'executions', selectedRule?.id ?? 'none'],
    queryFn: () => fetchWorkflowRuleExecutions(selectedRule?.id ?? ''),
    enabled: Boolean(selectedRule?.id),
  });
  const versionsQuery = useQuery({
    queryKey: ['rules', 'stats', 'versions', selectedRule?.id ?? 'none'],
    queryFn: () => fetchWorkflowRuleVersions(selectedRule?.id ?? ''),
    enabled: Boolean(selectedRule?.id),
  });
  const error = rulesQuery.error ?? statsQuery.error ?? executionsQuery.error ?? versionsQuery.error;
  const rows = statsQuery.data?.rows ?? [];

  return (
    <>
      <PageHeader titleI18nKey="rules.title" subtitleI18nKey="rules.rule_stats_subtitle" />
      <RulesTabs />
      <div className="orders-toolbar" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Rule stats window">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <select value={selectedRule?.id ?? ''} onChange={(event) => setSelectedRuleId(event.target.value)} aria-label="Rule audit selection">
          {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name} - {rule.status}</option>)}
        </select>
        <button type="button" className="btn" onClick={() => { void statsQuery.refetch(); void executionsQuery.refetch(); void versionsQuery.refetch(); }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {(rulesQuery.isLoading || statsQuery.isLoading) && <State title="Loading rule stats" body="Reading active rule fire, match, latency, task, and health metrics." />}
      {error && <State title="Rule stats failed" body={apiErrorMessage(error)} tone="error" />}
      {statsQuery.isSuccess && rows.length === 0 && <State title="No rule activity" body="Active rule activity appears here after rule events fire." />}

      {statsQuery.data && (
        <div className="rules-health-strip">
          <Metric label="Active rules" value={statsQuery.data.totals.activeRules} detail={`${statsQuery.data.windowDays}d window`} />
          <Metric label="Fire" value={statsQuery.data.totals.fireCount} detail={`${statsQuery.data.totals.matchCount} matches`} />
          <Metric label="Tasks" value={statsQuery.data.totals.taskCreatedCount} detail="created by rules" />
          <Metric label="Avg latency" value={statsQuery.data.totals.avgLatencyMs === null ? '-' : `${Math.round(statsQuery.data.totals.avgLatencyMs)}ms`} detail="completed executions" />
        </div>
      )}

      {rows.length > 0 && (
        <section className="section">
          <h3><span>Fire / match / latency</span><span className="meta">{days}d</span></h3>
          <table className="data-table" id="rule-stats-table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Fire</th>
                <th>Match</th>
                <th>Tasks</th>
                <th>Latency</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ruleId} onClick={() => setSelectedRuleId(row.ruleId)}>
                  <td>
                    <div className="name">{row.ruleName}</div>
                    <div className="muted">{row.trigger} - p{row.priority} - last {row.lastFiredAt ? new Date(row.lastFiredAt).toLocaleString() : 'never'}</div>
                  </td>
                  <td>{row.fireCount}</td>
                  <td>{row.matchRate.toFixed(1)}% ({row.matchCount})</td>
                  <td>{row.taskCreatedCount}</td>
                  <td>{row.avgLatencyMs === null ? '-' : `${Math.round(row.avgLatencyMs)}ms`}</td>
                  <td><span className={`pill ${row.health === 'healthy' ? 'success' : row.health === 'loose' ? 'warn' : ''}`}>{row.health}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedRule && (
        <div className="call-center-kanban">
          <section className="call-center-panel">
            <PanelHead title="Execution audit" meta={`${executionsQuery.data?.executions.length ?? 0} rows`} />
            {executionsQuery.isLoading ? <Empty>Loading execution audit...</Empty> : null}
            {executionsQuery.isSuccess && executionsQuery.data.executions.length === 0 ? <Empty>No executions recorded for this rule.</Empty> : null}
            <div className="call-center-list">
              {(executionsQuery.data?.executions ?? []).slice(0, 30).map((execution) => (
                <div key={execution.id} className="call-center-list-row">
                  <Activity size={14} />
                  <div>
                    <strong>{execution.trigger}</strong>
                    <span>{execution.status} - {execution.executionMode} - {execution.tasks.length} tasks - {execution.conditionTrace.filter((trace) => trace.matched).length}/{execution.conditionTrace.length} conditions</span>
                  </div>
                  <em>{new Date(execution.updatedAt).toLocaleString()}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="call-center-panel">
            <PanelHead title="Version audit" meta={`${versionsQuery.data?.versions.length ?? 0} versions`} />
            {versionsQuery.isLoading ? <Empty>Loading version audit...</Empty> : null}
            {versionsQuery.isSuccess && versionsQuery.data.versions.length === 0 ? <Empty>No version rows recorded for this rule.</Empty> : null}
            <div className="call-center-list">
              {(versionsQuery.data?.versions ?? []).slice(0, 30).map((version) => (
                <div key={version.id} className="call-center-list-row">
                  <History size={14} />
                  <div>
                    <strong>v{version.versionNo} - {version.comment ?? 'No comment'}</strong>
                    <span>{version.editedByMemberId ?? 'system'} - {version.jsonSnapshot.definition.status}</span>
                  </div>
                  <em>{new Date(version.editedAt).toLocaleString()}</em>
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

export const Route = createFileRoute('/rules/stats')({ component: RuleStatsView });
