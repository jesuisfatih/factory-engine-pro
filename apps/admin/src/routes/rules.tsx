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
  BarChart3,
  CheckCircle2,
  Database,
  FilePlus2,
  Filter,
  History,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Zap,
} from 'lucide-react';
import type {
  WorkflowAction,
  WorkflowCondition,
  WorkflowEnumCatalogResponse,
  WorkflowRuleDefinition,
  WorkflowRuleDto,
  WorkflowTrigger,
} from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api';
import {
  defaultOperator,
  defaultValue,
  cooldownLabel,
  draftFromWorkflowRule,
  fireWorkflowTrigger,
  fetchWorkflowCatalog,
  fetchWorkflowRuleBackfills,
  fetchWorkflowRuleVersions,
  fetchWorkflowRules,
  LIFECYCLE_TONE,
  makeAction,
  makeCondition,
  makeRuleDraft,
  rollbackWorkflowRule,
  runWorkflowRuleBackfill,
  saveWorkflowRule,
  type ConditionOperator,
  type RuleDraft,
  type RuleDraftAction,
  type RuleDraftCondition,
  verifyWorkflowEnumChain,
} from '@/lib/rules';

const CATALOG_QK = ['rules', 'catalog'] as const;
const RULES_QK = ['rules', 'saved'] as const;
const versionsQk = (ruleId: string | null) => ['rules', 'versions', ruleId ?? 'none'] as const;
const backfillsQk = (ruleId: string | null) => ['rules', 'backfills', ruleId ?? 'none'] as const;

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
  groupLabel?: string;
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
      {data.groupLabel && <div className="rule-node-title">{data.groupLabel}</div>}
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
  const conditions = conditionEntries(draft);

  conditions.forEach((entry, index) => {
    const nodeId = conditionNodeId(entry);
    nodes.push({
      id: nodeId,
      type: 'condition',
      position: { x: 260, y: index * 145 + 30 },
      data: {
        catalog,
        condition: entry.condition,
        groupLabel: entry.groupId,
        onEdit: (next: RuleDraftCondition) => onChange(updateConditionEntry(draft, entry, next)),
        onDelete: () => onChange(removeConditionEntry(draft, entry)),
      },
    });
    edges.push({
      id: `e-trigger-${nodeId}`,
      source: 'trigger',
      target: nodeId,
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

    if (conditions.length === 0) {
      edges.push({
        id: `e-trigger-${action.id}`,
        source: 'trigger',
        target: `act-${action.id}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    } else {
      conditions.forEach((entry) => {
        const nodeId = conditionNodeId(entry);
        edges.push({
          id: `e-${nodeId}-${action.id}`,
          source: nodeId,
          target: `act-${action.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      });
    }
  });

  return { nodes, edges };
}

interface ConditionEntry {
  groupId?: string;
  condition: RuleDraftCondition;
}

function conditionEntries(draft: RuleDraft): ConditionEntry[] {
  if (draft.whenGroups.length > 0) {
    return draft.whenGroups.flatMap((group) => group.conditions.map((condition) => ({ groupId: group.id, condition })));
  }
  return draft.when.map((condition) => ({ condition }));
}

function conditionNodeId(entry: ConditionEntry) {
  return `cond-${entry.groupId ?? 'flat'}-${entry.condition.id}`;
}

function updateConditionEntry(draft: RuleDraft, entry: ConditionEntry, next: RuleDraftCondition): RuleDraft {
  if (entry.groupId) {
    return {
      ...draft,
      whenGroups: draft.whenGroups.map((group) => group.id === entry.groupId
        ? { ...group, conditions: group.conditions.map((condition) => condition.id === entry.condition.id ? next : condition) }
        : group),
    };
  }
  return { ...draft, when: draft.when.map((condition) => condition.id === entry.condition.id ? next : condition) };
}

function removeConditionEntry(draft: RuleDraft, entry: ConditionEntry): RuleDraft {
  if (entry.groupId) {
    const whenGroups = draft.whenGroups
      .map((group) => group.id === entry.groupId
        ? { ...group, conditions: group.conditions.filter((condition) => condition.id !== entry.condition.id) }
        : group)
      .filter((group) => group.conditions.length > 0);
    return { ...draft, whenGroups };
  }
  return { ...draft, when: draft.when.filter((condition) => condition.id !== entry.condition.id) };
}

function appendCondition(draft: RuleDraft, catalog: WorkflowEnumCatalogResponse): RuleDraft {
  const condition = makeCondition(catalog);
  if (draft.whenGroups.length > 0) {
    const [first, ...rest] = draft.whenGroups;
    return { ...draft, whenGroups: [{ ...first, conditions: [...first.conditions, condition] }, ...rest] };
  }
  return { ...draft, when: [...draft.when, condition] };
}

function conditionCount(definition: WorkflowRuleDefinition) {
  return definition.when.length + (definition.whenGroups ?? []).reduce((sum, group) => sum + group.conditions.length, 0);
}

function whenGroupCount(definition: WorkflowRuleDefinition) {
  return definition.whenGroups?.length ?? (definition.when.length > 0 ? 1 : 0);
}

function RulesView() {
  const queryClient = useQueryClient();
  const catalogQuery = useQuery({ queryKey: CATALOG_QK, queryFn: fetchWorkflowCatalog });
  const rulesQuery = useQuery({ queryKey: RULES_QK, queryFn: fetchWorkflowRules });
  const verify = useMutation({ mutationFn: verifyWorkflowEnumChain });
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [backfillDays, setBackfillDays] = useState(7);
  const [didHydratePersistedRule, setDidHydratePersistedRule] = useState(false);
  const versionsQuery = useQuery({
    queryKey: versionsQk(selectedRuleId),
    queryFn: () => fetchWorkflowRuleVersions(selectedRuleId!),
    enabled: Boolean(selectedRuleId),
  });
  const backfillsQuery = useQuery({
    queryKey: backfillsQk(selectedRuleId),
    queryFn: () => fetchWorkflowRuleBackfills(selectedRuleId!),
    enabled: Boolean(selectedRuleId),
  });

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
      await queryClient.invalidateQueries({ queryKey: versionsQk(rule.id) });
      await queryClient.invalidateQueries({ queryKey: backfillsQk(rule.id) });
      toast.success('Rule saved', { description: `${rule.name} is now persisted as workflow JSON.` });
    },
    onError: (error) => toast.error('Rule save failed', { description: apiErrorMessage(error) }),
  });
  const rollbackMutation = useMutation({
    mutationFn: async (versionNo: number) => {
      if (!selectedRuleId) throw new Error('Select a saved rule before rollback.');
      return rollbackWorkflowRule(selectedRuleId, versionNo);
    },
    onSuccess: async (rule) => {
      setSelectedRuleId(rule.id);
      setDraft(draftFromWorkflowRule(rule));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: RULES_QK }),
        queryClient.invalidateQueries({ queryKey: versionsQk(rule.id) }),
        queryClient.invalidateQueries({ queryKey: backfillsQk(rule.id) }),
      ]);
      toast.success('Rule rolled back', { description: `${rule.name} restored and audited as a new version.` });
    },
    onError: (error) => toast.error('Rollback failed', { description: apiErrorMessage(error) }),
  });
  const fireMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Rule draft is not ready.');
      return fireWorkflowTrigger({
        trigger: draft.trigger,
        source: 'rules-ui',
        params: defaultTriggerParams(draft.trigger),
      });
    },
    onSuccess: (result) => toast.success('Event fired', {
      description: `${result.tasksCreated} task(s) created from ${result.matchedRules} active rule(s).`,
    }),
    onError: (error) => toast.error('Event fire failed', { description: apiErrorMessage(error) }),
  });
  const backfillMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRuleId) throw new Error('Save or select a rule before running backfill.');
      return runWorkflowRuleBackfill(selectedRuleId, backfillDays);
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: backfillsQk(result.report.ruleId) });
      toast.success('Shadow backfill completed', {
        description: `${result.report.matchedEvents}/${result.report.evaluatedEvents} event(s), ${result.report.actualTasksCreated} task(s) created.`,
      });
    },
    onError: (error) => toast.error('Backfill failed', { description: apiErrorMessage(error) }),
  });
  const latestBackfill = backfillsQuery.data?.reports[0];

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
                    <span>{conditionCount(rule.definition)} conditions</span>
                    {whenGroupCount(rule.definition) > 1 && <span>{whenGroupCount(rule.definition)} WHEN groups</span>}
                    <span>{rule.composable ? 'composable' : 'single fire'}</span>
                    <span>{cooldownLabel(rule.definition.cooldown)}</span>
                  </div>
                </button>
              ))}

              <div className="rules-section-head">
                <span><History size={12} /> Rule audit</span>
                <span className="muted">{versionsQuery.data?.versions.length ?? 0}</span>
              </div>
              {!selectedRuleId && (
                <div className="rules-empty">
                  <History size={16} /> Select a saved rule to inspect versions.
                </div>
              )}
              {selectedRuleId && versionsQuery.isLoading && (
                <div className="rules-empty">
                  <RefreshCw size={16} /> Loading version audit...
                </div>
              )}
              {selectedRuleId && versionsQuery.isError && (
                <div className="rules-empty danger-text">
                  <AlertTriangle size={16} /> {apiErrorMessage(versionsQuery.error)}
                </div>
              )}
              {selectedRuleId && versionsQuery.isSuccess && versionsQuery.data.versions.length === 0 && (
                <div className="rules-empty">
                  <History size={16} /> No version audit rows yet.
                </div>
              )}
              {selectedRuleId && versionsQuery.isSuccess && versionsQuery.data.versions.map((version) => (
                <div className="rule-card rule-version-card" key={version.id}>
                  <div className="rule-card-head">
                    <span className="pill">v{version.versionNo}</span>
                    <span className="muted">{new Date(version.editedAt).toLocaleString()}</span>
                  </div>
                  <div className="rule-card-name">{version.jsonSnapshot.name}</div>
                  <div className="rule-card-desc">{version.comment ?? 'No comment'}</div>
                  <div className="rule-card-meta">
                    <span>{version.jsonSnapshot.definition.status}</span>
                    <span>{version.jsonSnapshot.definition.trigger}</span>
                  </div>
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={rollbackMutation.isPending}
                    onClick={() => rollbackMutation.mutate(version.versionNo)}
                  >
                    <RotateCcw size={11} /> Rollback
                  </button>
                </div>
              ))}

              <div className="rules-section-head">
                <span><BarChart3 size={12} /> Shadow reports</span>
                <span className="muted">{backfillsQuery.data?.reports.length ?? 0}</span>
              </div>
              {!selectedRuleId && (
                <div className="rules-empty">
                  <BarChart3 size={16} /> Select a saved rule to inspect shadow reports.
                </div>
              )}
              {selectedRuleId && backfillsQuery.isLoading && (
                <div className="rules-empty">
                  <RefreshCw size={16} /> Loading shadow reports...
                </div>
              )}
              {selectedRuleId && backfillsQuery.isError && (
                <div className="rules-empty danger-text">
                  <AlertTriangle size={16} /> {apiErrorMessage(backfillsQuery.error)}
                </div>
              )}
              {selectedRuleId && backfillsQuery.isSuccess && backfillsQuery.data.reports.length === 0 && (
                <div className="rules-empty">
                  <BarChart3 size={16} />
                  <div>No shadow backfill reports yet.</div>
                  <button
                    type="button"
                    className="btn small"
                    disabled={backfillMutation.isPending}
                    onClick={() => backfillMutation.mutate()}
                  >
                    <Activity size={12} /> Run 7d
                  </button>
                </div>
              )}
              {selectedRuleId && backfillsQuery.isSuccess && backfillsQuery.data.reports.map((report) => (
                <div className="rule-card rule-backfill-card" key={report.id}>
                  <div className="rule-card-head">
                    <span className={`pill ${report.status === 'completed' && report.actualTasksCreated === 0 ? 'success' : 'danger'}`}>
                      {report.actualTasksCreated === 0 ? 'shadow' : 'mutated'}
                    </span>
                    <span className="muted">{new Date(report.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="rule-card-name">{report.recentDays}d backfill</div>
                  <div className="rule-card-desc">
                    {report.matchedEvents}/{report.evaluatedEvents} matched / {report.wouldCreateTasks} task(s) would create
                  </div>
                  <div className="rule-card-meta">
                    <span>{report.result.candidateSource}</span>
                    <span>{report.actualTasksCreated} real task(s)</span>
                  </div>
                </div>
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
                <label className="rules-inline-control">
                  <span>Cooldown h</span>
                  <input
                    className="rules-priority-input"
                    type="number"
                    min="0"
                    max="8760"
                    value={draft.cooldownHours}
                    onChange={(event) => setDraft({ ...draft, cooldownHours: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
                <label className="rules-inline-control">
                  <span>Limit</span>
                  <input
                    className="rules-priority-input"
                    type="number"
                    min="1"
                    max="100"
                    disabled={draft.cooldownHours === 0}
                    value={draft.cooldownLimit}
                    onChange={(event) => setDraft({ ...draft, cooldownLimit: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <span className={`pill ${LIFECYCLE_TONE[draft.status]}`}>{draft.status}</span>
                <button type="button" className="btn ghost" onClick={() => setDraft(appendCondition(draft, catalog))}>
                  <Plus size={12} /> Condition
                </button>
                <button type="button" className="btn ghost" onClick={() => setDraft({ ...draft, actions: [...draft.actions, makeAction(catalog)] })}>
                  <Plus size={12} /> Action
                </button>
                <button
                  type="button"
                  id="btn-fire-workflow-trigger"
                  className="btn ghost"
                  disabled={!draft || fireMutation.isPending}
                  onClick={() => fireMutation.mutate()}
                >
                  <Zap size={12} /> {fireMutation.isPending ? 'Firing...' : 'Fire event'}
                </button>
                <label className="rules-inline-control">
                  <span>Backfill d</span>
                  <input
                    className="rules-priority-input"
                    type="number"
                    min="1"
                    max="90"
                    value={backfillDays}
                    onChange={(event) => setBackfillDays(Math.max(1, Math.min(90, Number(event.target.value) || 7)))}
                  />
                </label>
                <button
                  type="button"
                  id="btn-backfill-workflow-rule"
                  className="btn ghost"
                  disabled={!selectedRuleId || backfillMutation.isPending}
                  onClick={() => backfillMutation.mutate()}
                >
                  <Activity size={12} /> {backfillMutation.isPending ? 'Running...' : 'Run shadow'}
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
                {fireMutation.data && <span><strong>Last fire:</strong> {fireMutation.data.tasksCreated} task(s)</span>}
                <span>
                  <strong>Shadow:</strong>{' '}
                  {latestBackfill
                    ? `${latestBackfill.recentDays}d ${latestBackfill.matchedEvents}/${latestBackfill.evaluatedEvents} matched, ${latestBackfill.actualTasksCreated} real task(s)`
                    : 'no report'}
                </span>
                <span><strong>Executor:</strong> {verify.data ? 'verified' : 'not checked'}</span>
                {saveMutation.isError && <span className="danger-text">{apiErrorMessage(saveMutation.error)}</span>}
                {fireMutation.isError && <span className="danger-text">{apiErrorMessage(fireMutation.error)}</span>}
                {backfillMutation.isError && <span className="danger-text">{apiErrorMessage(backfillMutation.error)}</span>}
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

function defaultTriggerParams(trigger: WorkflowTrigger) {
  if (trigger === 'shopify.order.created') return { shopifyOrderId: `ui-${Date.now()}`, totalPrice: 0 };
  if (trigger === 'psych.tag.detected') return { tag: 'angry' };
  if (trigger === 'customer.repeat_call.detected') return { count: 2, windowDays: 30 };
  if (trigger === 'call_intent.classified') return { intent: 'inquiry' };
  return {};
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
