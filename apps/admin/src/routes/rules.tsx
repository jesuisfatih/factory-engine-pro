import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  FilePlus2,
  Filter,
  Network,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowEnumCatalogResponse,
  WorkflowRuleDto,
  WorkflowTrigger,
} from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import {
  defaultOperator,
  defaultValue,
  draftFromWorkflowRule,
  fetchWorkflowCatalog,
  fetchWorkflowRules,
  LIFECYCLE_TONE,
  makeAction,
  makeCondition,
  makeRuleDraft,
  saveWorkflowRule,
  type ConditionOperator,
  type RuleDraft,
  type RuleDraftAction,
  type RuleDraftCondition,
  verifyWorkflowEnumChain,
} from '@/lib/rules';

const CATALOG_QK = ['rules', 'catalog'] as const;
const RULES_QK = ['rules', 'saved'] as const;

const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  string: ['=', '!=', 'contains'],
  number: ['>=', '<=', '=', '!='],
  boolean: ['='],
  enum: ['=', '!=', 'in', 'not_in'],
  range: ['in'],
  window: ['>=', '<='],
};

interface TriggerNodeData extends Record<string, unknown> {
  catalog: WorkflowEnumCatalogResponse;
  trigger: WorkflowTrigger;
  onChange: (trigger: WorkflowTrigger) => void;
}

interface ConditionNodeData extends Record<string, unknown> {
  catalog: WorkflowEnumCatalogResponse;
  condition: RuleDraftCondition;
  onEdit: (next: RuleDraftCondition) => void;
  onDelete: () => void;
}

interface ActionNodeData extends Record<string, unknown> {
  catalog: WorkflowEnumCatalogResponse;
  action: RuleDraftAction;
  onEdit: (next: RuleDraftAction) => void;
  onDelete: () => void;
}

function TriggerNode({ data }: NodeProps<Node<TriggerNodeData>>) {
  return (
    <div className="rule-node rule-node-trigger">
      <div className="rule-node-head">
        <Zap size={12} />
        <span>TRIGGER</span>
      </div>
      <select value={data.trigger} onChange={(event) => data.onChange(event.target.value as WorkflowTrigger)}>
        {data.catalog.triggers.map((trigger) => (
          <option key={trigger.value} value={trigger.value}>
            {trigger.label}
          </option>
        ))}
      </select>
      <div className="rule-node-title">{data.catalog.triggers.find((entry) => entry.value === data.trigger)?.family}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionNode({ data }: NodeProps<Node<ConditionNodeData>>) {
  const field = data.catalog.conditions.find((entry) => entry.value === data.condition.condition) ?? data.catalog.conditions[0];
  const ops = OPERATORS_BY_TYPE[field?.valueType ?? 'enum'] ?? ['='];

  return (
    <div className="rule-node rule-node-condition">
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-head">
        <Filter size={11} />
        <span>WHEN</span>
        <button type="button" className="rule-node-x" onClick={data.onDelete} title="Remove">
          <Trash2 size={10} />
        </button>
      </div>

      <select
        value={data.condition.condition}
        onChange={(event) => {
          const nextCondition = event.target.value as WorkflowCondition;
          const nextField = data.catalog.conditions.find((entry) => entry.value === nextCondition) ?? data.catalog.conditions[0];
          data.onEdit({
            ...data.condition,
            condition: nextCondition,
            operator: defaultOperator(nextField.valueType),
            value: defaultValue(nextField.optionSource, data.catalog),
            confidenceGte: nextField.aiDerived ? (data.condition.confidenceGte ?? 0.8) : undefined,
          });
        }}
      >
        {data.catalog.conditions.map((condition) => (
          <option key={condition.value} value={condition.value}>
            {condition.label}
          </option>
        ))}
      </select>

      <div className="rule-node-row">
        <select
          value={data.condition.operator}
          onChange={(event) => data.onEdit({ ...data.condition, operator: event.target.value as ConditionOperator })}
        >
          {ops.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        <ConditionValueInput catalog={data.catalog} condition={data.condition} onEdit={data.onEdit} />
      </div>

      {field?.aiDerived && (
        <div className="rule-node-confidence">
          <span className="muted">AI confidence &gt;=</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={data.condition.confidenceGte ?? 0.8}
            onChange={(event) => data.onEdit({ ...data.condition, confidenceGte: Number(event.target.value) })}
          />
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionValueInput({
  catalog,
  condition,
  onEdit,
}: {
  catalog: WorkflowEnumCatalogResponse;
  condition: RuleDraftCondition;
  onEdit: (next: RuleDraftCondition) => void;
}) {
  const field = catalog.conditions.find((entry) => entry.value === condition.condition);
  if (field?.optionSource === 'call_intents') {
    return (
      <select value={condition.value} onChange={(event) => onEdit({ ...condition, value: event.target.value })}>
        {catalog.callIntents.map((intent) => <option key={intent.value} value={intent.value}>{intent.label}</option>)}
      </select>
    );
  }
  if (field?.optionSource === 'psych_tags') {
    return (
      <select value={condition.value} onChange={(event) => onEdit({ ...condition, value: event.target.value })}>
        {catalog.psychTags.map((tag) => <option key={tag.value} value={tag.value}>{tag.label}</option>)}
      </select>
    );
  }
  if (field?.valueType === 'boolean') {
    return (
      <select value={condition.value || 'true'} onChange={(event) => onEdit({ ...condition, value: event.target.value })}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      type={field?.valueType === 'number' || field?.valueType === 'window' ? 'number' : 'text'}
      value={condition.value}
      onChange={(event) => onEdit({ ...condition, value: event.target.value })}
      placeholder={field?.valueType === 'range' ? '09:00-17:00' : 'value'}
    />
  );
}

function ActionNode({ data }: NodeProps<Node<ActionNodeData>>) {
  const actionMeta = data.catalog.actions.find((entry) => entry.value === data.action.action);
  return (
    <div className={`rule-node rule-node-action action-${data.action.action.replace(/[^a-z0-9]/g, '-')}`}>
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-head">
        <ArrowRight size={11} />
        <span>ACTION</span>
        <button type="button" className="rule-node-x" onClick={data.onDelete} title="Remove">
          <Trash2 size={10} />
        </button>
      </div>
      <select
        value={data.action.action}
        onChange={(event) => data.onEdit({ ...data.action, action: event.target.value as WorkflowAction })}
      >
        {data.catalog.actions.map((action) => (
          <option key={action.value} value={action.value}>
            {action.label}
          </option>
        ))}
      </select>
      <input
        value={data.action.value}
        onChange={(event) => data.onEdit({ ...data.action, value: event.target.value })}
        placeholder={actionMeta?.auditOnly ? 'audit reason' : 'target or note'}
      />
      <div className="rule-node-title">{actionMeta?.auditOnly ? 'audit only' : actionMeta?.createsTask ? 'task output' : 'state output'}</div>
    </div>
  );
}

const NODE_TYPES = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode };

function RuleCanvas({
  catalog,
  draft,
  onChange,
}: {
  catalog: WorkflowEnumCatalogResponse;
  draft: RuleDraft;
  onChange: (next: RuleDraft) => void;
}) {
  const graph = useMemo(() => buildGraph(catalog, draft, onChange), [catalog, draft, onChange]);

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.18, minZoom: 0.75, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
    >
      <Background gap={16} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(node) => {
        if (node.type === 'trigger') return '#16A34A';
        if (node.type === 'condition') return '#F59E0B';
        return '#3B82F6';
      }} />
    </ReactFlow>
  );
}

function buildGraph(
  catalog: WorkflowEnumCatalogResponse,
  draft: RuleDraft,
  onChange: (next: RuleDraft) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{
    id: 'trigger',
    type: 'trigger',
    position: { x: 20, y: 150 },
    data: {
      catalog,
      trigger: draft.trigger,
      onChange: (trigger: WorkflowTrigger) => onChange({ ...draft, trigger }),
    },
  }];
  const edges: Edge[] = [];

  draft.when.forEach((condition, index) => {
    nodes.push({
      id: `cond-${condition.id}`,
      type: 'condition',
      position: { x: 260, y: index * 145 + 30 },
      data: {
        catalog,
        condition,
        onEdit: (next: RuleDraftCondition) => onChange({
          ...draft,
          when: draft.when.map((entry) => entry.id === condition.id ? next : entry),
        }),
        onDelete: () => onChange({ ...draft, when: draft.when.filter((entry) => entry.id !== condition.id) }),
      },
    });
    edges.push({
      id: `e-trigger-${condition.id}`,
      source: 'trigger',
      target: `cond-${condition.id}`,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
    });
  });

  draft.actions.forEach((action, index) => {
    nodes.push({
      id: `act-${action.id}`,
      type: 'action',
      position: { x: 540, y: index * 145 + 60 },
      data: {
        catalog,
        action,
        onEdit: (next: RuleDraftAction) => onChange({
          ...draft,
          actions: draft.actions.map((entry) => entry.id === action.id ? next : entry),
        }),
        onDelete: () => onChange({ ...draft, actions: draft.actions.filter((entry) => entry.id !== action.id) }),
      },
    });

    if (draft.when.length === 0) {
      edges.push({
        id: `e-trigger-${action.id}`,
        source: 'trigger',
        target: `act-${action.id}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    } else {
      draft.when.forEach((condition) => {
        edges.push({
          id: `e-${condition.id}-${action.id}`,
          source: `cond-${condition.id}`,
          target: `act-${action.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      });
    }
  });

  return { nodes, edges };
}

function RulesView() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: CATALOG_QK, queryFn: fetchWorkflowCatalog });
  const rulesQuery = useQuery({ queryKey: RULES_QK, queryFn: fetchWorkflowRules });
  const verify = useMutation({ mutationFn: verifyWorkflowEnumChain });
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [didHydratePersistedRule, setDidHydratePersistedRule] = useState(false);

  useEffect(() => {
    if (catalogQuery.data && !draft) setDraft(makeRuleDraft(catalogQuery.data));
  }, [catalogQuery.data, draft]);

  useEffect(() => {
    if (!catalogQuery.data || didHydratePersistedRule || !rulesQuery.isSuccess) return;
    const firstRule = rulesQuery.data?.rules[0];
    if (firstRule) {
      setSelectedRuleId(firstRule.id);
      setDraft(draftFromWorkflowRule(firstRule));
    }
    setDidHydratePersistedRule(true);
  }, [catalogQuery.data, didHydratePersistedRule, rulesQuery.data?.rules, rulesQuery.isSuccess]);

  const catalog = catalogQuery.data;
  const rules = rulesQuery.data?.rules ?? [];
  const catalogEmpty = catalog && (
    catalog.triggers.length === 0
    || catalog.conditions.length === 0
    || catalog.actions.length === 0
  );
  const selectRule = (rule: WorkflowRuleDto) => {
    setSelectedRuleId(rule.id);
    setDraft(draftFromWorkflowRule(rule));
  };
  const newRule = () => {
    if (!catalog) return;
    setSelectedRuleId(null);
    setDraft(makeRuleDraft(catalog));
  };
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Rule draft is not ready.');
      return saveWorkflowRule(draft, selectedRuleId ?? undefined);
    },
    onSuccess: async (rule) => {
      setSelectedRuleId(rule.id);
      setDraft(draftFromWorkflowRule(rule));
      await queryClient.invalidateQueries({ queryKey: RULES_QK });
      toast.success('Rule saved', { description: `${rule.name} is now persisted as workflow JSON.` });
    },
    onError: (error) => toast.error('Rule save failed', { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <PageHeader
        titleI18nKey="rules.title"
        subtitleI18nKey="rules.subtitle"
        actions={(
          <button
            type="button"
            className="btn primary"
            disabled={!catalog || verify.isPending}
            onClick={() => verify.mutate()}
          >
            <RefreshCw size={14} /> Verify chain
          </button>
        )}
      />

      {catalogQuery.isLoading && (
        <div className="rules-empty">
          <RefreshCw size={16} /> Loading live enum catalog...
        </div>
      )}

      {catalogQuery.isError && (
        <div className="rules-banner">
          <AlertTriangle size={18} />
          <div>
            <div className="rules-banner-title">Catalog failed</div>
            <div className="rules-banner-body">{apiErrorMessage(catalogQuery.error)}</div>
          </div>
        </div>
      )}

      {catalogEmpty && (
        <div className="rules-empty">
          <AlertTriangle size={16} /> Enum catalog returned empty groups.
        </div>
      )}

      {catalog && draft && !catalogEmpty && (
        <>
          <div className="rules-banner">
            <Network size={18} />
            <div>
              <div className="rules-banner-title">Master enum catalog v{catalog.version}</div>
              <div className="rules-banner-body">
                {catalog.counts.psychTags} psych tags · {catalog.counts.callIntents} call intents · {catalog.counts.urgencyLevels} urgency levels · {catalog.counts.triggers} triggers · {catalog.counts.conditions} conditions · {catalog.counts.actions} actions
              </div>
            </div>
          </div>

          <div className="rules-shell">
            <aside className="rules-list">
              <div className="rules-section-head">
                <span><Database size={12} /> Saved rules</span>
                <span className="muted">{rules.length}</span>
              </div>
              {rulesQuery.isLoading && (
                <div className="rules-empty">
                  <RefreshCw size={16} /> Loading saved rules...
                </div>
              )}
              {rulesQuery.isError && (
                <div className="rules-empty danger-text">
                  <AlertTriangle size={16} /> {apiErrorMessage(rulesQuery.error)}
                </div>
              )}
              {!rulesQuery.isLoading && !rulesQuery.isError && rules.length === 0 && (
                <div className="rules-empty">
                  <Database size={16} />
                  <div>No persisted workflow rules yet.</div>
                  <button type="button" className="btn small" onClick={newRule}>
                    <FilePlus2 size={12} /> New rule
                  </button>
                </div>
              )}
              {rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className={`rule-card ${selectedRuleId === rule.id ? 'active' : ''}`}
                  onClick={() => selectRule(rule)}
                >
                  <div className="rule-card-head">
                    <span className={`pill ${LIFECYCLE_TONE[rule.status]}`}>{rule.status}</span>
                    <span className="muted">p{rule.priority}</span>
                  </div>
                  <div className="rule-card-name">{rule.name}</div>
                  <div className="rule-card-desc">
                    {rule.definition.trigger}{' -> '}{rule.definition.actions.map((action) => action.action).join(' + ')}
                  </div>
                  <div className="rule-card-meta">
                    <span>{rule.definition.when.length} conditions</span>
                    <span>{rule.composable ? 'composable' : 'single fire'}</span>
                  </div>
                </button>
              ))}

              <div className="rules-section-head">
                <span><Network size={12} /> Catalog</span>
                <span className="muted">v{catalog.version}</span>
              </div>
              <CatalogCard title="Triggers" count={catalog.counts.triggers} values={catalog.triggers.slice(0, 8).map((entry) => entry.value)} />
              <CatalogCard title="Conditions" count={catalog.counts.conditions} values={catalog.conditions.slice(0, 8).map((entry) => entry.value)} />
              <CatalogCard title="Actions" count={catalog.counts.actions} values={catalog.actions.map((entry) => entry.value)} />
              <CatalogCard title="Psych tags" count={catalog.counts.psychTags} values={catalog.psychTags.map((entry) => entry.value)} />
              <CatalogCard title="Call intents" count={catalog.counts.callIntents} values={catalog.callIntents.map((entry) => entry.value)} />
              <CatalogCard title="Urgency" count={catalog.counts.urgencyLevels} values={catalog.urgencyLevels.map((entry) => entry.value)} />
            </aside>

            <main className="rules-canvas-wrap">
              <div className="rules-canvas-toolbar">
                <button type="button" id="btn-new-workflow-rule" className="btn ghost" onClick={newRule}>
                  <FilePlus2 size={12} /> New
                </button>
                <input
                  className="rules-name-input"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Rule name"
                />
                <select
                  value={draft.status}
                  onChange={(event) => setDraft({ ...draft, status: event.target.value as RuleDraft['status'] })}
                >
                  <option value="draft">draft</option>
                  <option value="shadow">shadow</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
                <label className="rules-inline-control">
                  <span>Priority</span>
                  <input
                    className="rules-priority-input"
                    type="number"
                    min="0"
                    max="1000"
                    value={draft.priority}
                    onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
                  />
                </label>
                <label className="rules-inline-check">
                  <input
                    type="checkbox"
                    checked={draft.composable}
                    onChange={(event) => setDraft({ ...draft, composable: event.target.checked })}
                  />
                  <span>Composable</span>
                </label>
                <span className={`pill ${LIFECYCLE_TONE[draft.status]}`}>{draft.status}</span>
                <button type="button" className="btn ghost" onClick={() => setDraft({ ...draft, when: [...draft.when, makeCondition(catalog)] })}>
                  <Plus size={12} /> Condition
                </button>
                <button type="button" className="btn ghost" onClick={() => setDraft({ ...draft, actions: [...draft.actions, makeAction(catalog)] })}>
                  <Plus size={12} /> Action
                </button>
                <button
                  type="button"
                  id="btn-save-workflow-rule"
                  className="btn primary"
                  disabled={!draft || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save size={12} /> {saveMutation.isPending ? 'Saving...' : selectedRuleId ? 'Update rule' : 'Save rule'}
                </button>
              </div>

              <div className="rules-canvas">
                <ReactFlowProvider>
                  <RuleCanvas catalog={catalog} draft={draft} onChange={setDraft} />
                </ReactFlowProvider>
              </div>

              <div className="rules-telemetry">
                <Activity size={11} />
                <span><strong>Prompt:</strong> ai.transcript-resolver</span>
                <span><strong>Canvas source:</strong> /api/v1/rules/catalog</span>
                <span><strong>Rule JSON source:</strong> {selectedRuleId ? `/api/v1/rules/${selectedRuleId}` : '/api/v1/rules'}</span>
                <span><strong>Executor:</strong> {verify.data ? 'verified' : 'not checked'}</span>
                {saveMutation.isError && <span className="danger-text">{apiErrorMessage(saveMutation.error)}</span>}
                {verify.data && (
                  <>
                    <span><CheckCircle2 size={11} /> {verify.data.probeValues.trigger}</span>
                    <span>{verify.data.probeValues.condition}</span>
                    <span>{verify.data.probeValues.action}</span>
                  </>
                )}
                {verify.isError && <span className="danger-text">{apiErrorMessage(verify.error)}</span>}
              </div>
            </main>
          </div>
        </>
      )}
    </>
  );
}

function CatalogCard({ title, count, values }: { title: string; count: number; values: string[] }) {
  return (
    <div className="rule-card">
      <div className="rule-card-head">
        <span className="pill success">{title}</span>
        <span className="muted">{count}</span>
      </div>
      <div className="rule-card-name">{title}</div>
      <div className="rule-card-desc">{values.join(' · ')}</div>
    </div>
  );
}

export const Route = createFileRoute('/rules')({ component: RulesView });
