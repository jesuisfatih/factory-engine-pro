import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, MarkerType,
  Position, Handle, useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, Plus, Trash2, Save, Filter, Zap, Network, ArrowRight,
  Activity, Eye, EyeOff, Archive,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  fetchRules, saveRule, deleteRule, makeDraftRule, makeCondition, makeAction,
  CONDITION_FIELDS, LIFECYCLE_TONE, ACTION_LABEL, TRIGGER_LABEL,
  type Rule, type RuleAction, type RuleCondition, type ConditionField,
  type ConditionOperator, type AssigneeAxis, type RuleLifecycle,
} from '@/lib/rules';

const QK = ['rules'] as const;

const LIFECYCLE_ICON: Record<RuleLifecycle, typeof Eye> = {
  draft: EyeOff, shadow: Eye, active: Activity, archived: Archive,
};

const AXES: AssigneeAxis[] = ['sales', 'customer_service', 'support_lead', 'accounting', 'admin'];
const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  string:  ['=', '!=', 'contains', 'starts_with'],
  number:  ['>=', '<=', '>', '<', '=', '!='],
  enum:    ['=', '!=', 'in', 'not_in'],
  multi:   ['contains', 'in', 'not_in'],
  boolean: ['='],
};

/* ─── Node types (React Flow custom nodes) ─────────────────────── */

interface TriggerNodeData extends Record<string, unknown> { label: string; }
interface ConditionNodeData extends Record<string, unknown> {
  condition: RuleCondition;
  fieldLabel: string;
  onEdit: (next: RuleCondition) => void;
  onDelete: () => void;
  aiDerived: boolean;
}
interface ActionNodeData extends Record<string, unknown> {
  action: RuleAction;
  onEdit: (next: RuleAction) => void;
  onDelete: () => void;
}

function TriggerNode({ data }: NodeProps<Node<TriggerNodeData>>) {
  return (
    <div className="rule-node rule-node-trigger">
      <div className="rule-node-head">
        <Zap size={12} />
        <span>TRIGGER</span>
      </div>
      <div className="rule-node-title">{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ConditionNode({ data }: NodeProps<Node<ConditionNodeData>>) {
  const { condition, fieldLabel, onEdit, onDelete, aiDerived } = data;
  const fieldDef = CONDITION_FIELDS.find((entry) => entry.id === condition.field)!;
  const ops = OPERATORS_BY_TYPE[fieldDef.value_type] ?? ['='];

  return (
    <div className="rule-node rule-node-condition">
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-head">
        <Filter size={11} />
        <span>WHEN</span>
        <button type="button" className="rule-node-x" onClick={onDelete} title="Remove">
          <Trash2 size={10} />
        </button>
      </div>

      <select
        value={condition.field}
        onChange={(event) => {
          const nextField = event.target.value as ConditionField;
          const nextDef = CONDITION_FIELDS.find((entry) => entry.id === nextField)!;
          onEdit({
            ...condition,
            field: nextField,
            op: (OPERATORS_BY_TYPE[nextDef.value_type] ?? ['='])[0],
            value: nextDef.value_type === 'boolean' ? true : nextDef.value_type === 'number' ? 0 : '',
            confidence_gte: nextDef.ai_derived ? (condition.confidence_gte ?? 0.8) : undefined,
          });
        }}
      >
        {CONDITION_FIELDS.map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>

      <div className="rule-node-row">
        <select
          value={condition.op}
          onChange={(event) => onEdit({ ...condition, op: event.target.value as ConditionOperator })}
        >
          {ops.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>

        {fieldDef.value_type === 'enum' ? (
          <select
            value={String(condition.value ?? '')}
            onChange={(event) => onEdit({ ...condition, value: event.target.value })}
          >
            {(fieldDef.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        ) : fieldDef.value_type === 'boolean' ? (
          <select
            value={String(condition.value)}
            onChange={(event) => onEdit({ ...condition, value: event.target.value === 'true' })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={fieldDef.value_type === 'number' ? 'number' : 'text'}
            value={String(condition.value ?? '')}
            onChange={(event) => onEdit({
              ...condition,
              value: fieldDef.value_type === 'number' ? Number(event.target.value) : event.target.value,
            })}
          />
        )}
      </div>

      {aiDerived && (
        <div className="rule-node-confidence">
          <span className="muted">AI confidence ≥</span>
          <input
            type="number"
            step="0.05" min="0" max="1"
            value={condition.confidence_gte ?? 0.8}
            onChange={(event) => onEdit({ ...condition, confidence_gte: Number(event.target.value) })}
          />
        </div>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ActionNode({ data }: NodeProps<Node<ActionNodeData>>) {
  const { action, onEdit, onDelete } = data;
  return (
    <div className={`rule-node rule-node-action action-${action.type}`}>
      <Handle type="target" position={Position.Left} />
      <div className="rule-node-head">
        <ArrowRight size={11} />
        <span>{ACTION_LABEL[action.type].toUpperCase()}</span>
        <button type="button" className="rule-node-x" onClick={onDelete} title="Remove">
          <Trash2 size={10} />
        </button>
      </div>

      {action.type === 'create_task' && (
        <>
          <label>assignee</label>
          <select
            value={action.config.assignee_axis}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, assignee_axis: event.target.value as AssigneeAxis } })}
          >
            {AXES.map((axis) => <option key={axis} value={axis}>{axis}</option>)}
          </select>

          <label>priority</label>
          <select
            value={action.config.priority}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, priority: event.target.value as 'low' | 'normal' | 'high' | 'urgent' } })}
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="urgent">urgent</option>
          </select>
        </>
      )}

      {action.type === 'escalate' && (
        <>
          <label>to axis</label>
          <select
            value={action.config.to}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, to: event.target.value as AssigneeAxis } })}
          >
            {AXES.map((axis) => <option key={axis} value={axis}>{axis}</option>)}
          </select>
          <label>reason</label>
          <input
            value={action.config.reason}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, reason: event.target.value } })}
          />
        </>
      )}

      {action.type === 'skip' && (
        <>
          <label>reason</label>
          <input
            value={action.config.reason}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, reason: event.target.value } })}
          />
        </>
      )}

      {action.type === 'add_watcher' && (
        <>
          <label>axis</label>
          <select
            value={action.config.axis}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, axis: event.target.value as AssigneeAxis } })}
          >
            {AXES.map((axis) => <option key={axis} value={axis}>{axis}</option>)}
          </select>
        </>
      )}

      {action.type === 'notify' && (
        <>
          <label>channel</label>
          <select
            value={action.config.channel}
            onChange={(event) => onEdit({ ...action, config: { ...action.config, channel: event.target.value as 'slack' | 'email' } })}
          >
            <option value="slack">slack</option>
            <option value="email">email</option>
          </select>
        </>
      )}

      {action.type === 'append_existing' && (
        <div className="muted">Appends call to the open task for this intent.</div>
      )}
    </div>
  );
}

const NODE_TYPES = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode };

/* ─── Canvas (renders one selected rule) ──────────────────────── */

/* Tighter default layout — nodes are now compact, so columns are closer. */
const LAYOUT = {
  TRIGGER_X: 20, TRIGGER_Y: 140,
  COND_X: 240, COND_Y_STEP: 130,
  ACT_X: 500, ACT_Y_STEP: 150,
};

function buildInitialGraph(rule: Rule, handlers: {
  onConditionEdit: (id: string, next: RuleCondition) => void;
  onConditionDelete: (id: string) => void;
  onActionEdit: (id: string, next: RuleAction) => void;
  onActionDelete: (id: string) => void;
}) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'trigger',
    type: 'trigger',
    position: { x: LAYOUT.TRIGGER_X, y: LAYOUT.TRIGGER_Y },
    data: { label: TRIGGER_LABEL[rule.trigger.type] },
  });

  rule.conditions.forEach((condition, index) => {
    const fieldDef = CONDITION_FIELDS.find((entry) => entry.id === condition.field)!;
    nodes.push({
      id: `cond-${condition.id}`,
      type: 'condition',
      position: { x: LAYOUT.COND_X, y: index * LAYOUT.COND_Y_STEP },
      data: {
        condition,
        fieldLabel: fieldDef.label,
        aiDerived: fieldDef.ai_derived,
        onEdit: (next: RuleCondition) => handlers.onConditionEdit(condition.id, next),
        onDelete: () => handlers.onConditionDelete(condition.id),
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

  rule.actions.forEach((action, index) => {
    nodes.push({
      id: `act-${action.id}`,
      type: 'action',
      position: { x: LAYOUT.ACT_X, y: index * LAYOUT.ACT_Y_STEP + 40 },
      data: {
        action,
        onEdit: (next: RuleAction) => handlers.onActionEdit(action.id, next),
        onDelete: () => handlers.onActionDelete(action.id),
      },
    });
    if (rule.conditions.length === 0) {
      edges.push({
        id: `e-trigger-${action.id}`,
        source: 'trigger',
        target: `act-${action.id}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    } else {
      rule.conditions.forEach((condition) => {
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

/**
 * The canvas owns node positions (`useNodesState`) — once the user drags a node,
 * we never recompute its position from `buildInitialGraph`. We do reseed on
 * `rule.id` change (different rule selected) and on add/remove of conditions
 * or actions (we splice new nodes in or remove ones whose id is gone).
 */
function RuleCanvas({ rule, onChange }: { rule: Rule; onChange: (next: Rule) => void }) {
  const onConditionEdit = useCallback((id: string, next: RuleCondition) => {
    onChange({ ...rule, conditions: rule.conditions.map((condition) => condition.id === id ? next : condition) });
  }, [rule, onChange]);
  const onConditionDelete = useCallback((id: string) => {
    onChange({ ...rule, conditions: rule.conditions.filter((condition) => condition.id !== id) });
  }, [rule, onChange]);
  const onActionEdit = useCallback((id: string, next: RuleAction) => {
    onChange({ ...rule, actions: rule.actions.map((action) => action.id === id ? next : action) as RuleAction[] });
  }, [rule, onChange]);
  const onActionDelete = useCallback((id: string) => {
    onChange({ ...rule, actions: rule.actions.filter((action) => action.id !== id) });
  }, [rule, onChange]);

  const handlers = useMemo(() => ({ onConditionEdit, onConditionDelete, onActionEdit, onActionDelete }),
    [onConditionEdit, onConditionDelete, onActionEdit, onActionDelete]);

  const initial = useMemo(() => buildInitialGraph(rule, handlers), [rule.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);

  /* When user adds/removes a condition or action elsewhere in the form,
   * splice the corresponding node in / out without touching others' positions. */
  useEffect(() => {
    setNodes((current) => {
      const byId = new Map(current.map((node) => [node.id, node] as const));
      const next: Node[] = [];

      // trigger always stays
      next.push(byId.get('trigger') ?? {
        id: 'trigger', type: 'trigger',
        position: { x: LAYOUT.TRIGGER_X, y: LAYOUT.TRIGGER_Y },
        data: { label: TRIGGER_LABEL[rule.trigger.type] },
      });

      rule.conditions.forEach((condition, index) => {
        const nodeId = `cond-${condition.id}`;
        const fieldDef = CONDITION_FIELDS.find((entry) => entry.id === condition.field)!;
        const data = {
          condition,
          fieldLabel: fieldDef.label,
          aiDerived: fieldDef.ai_derived,
          onEdit: (input: RuleCondition) => handlers.onConditionEdit(condition.id, input),
          onDelete: () => handlers.onConditionDelete(condition.id),
        };
        const existing = byId.get(nodeId);
        if (existing) next.push({ ...existing, data });
        else next.push({ id: nodeId, type: 'condition', position: { x: LAYOUT.COND_X, y: index * LAYOUT.COND_Y_STEP }, data });
      });

      rule.actions.forEach((action, index) => {
        const nodeId = `act-${action.id}`;
        const data = {
          action,
          onEdit: (input: RuleAction) => handlers.onActionEdit(action.id, input),
          onDelete: () => handlers.onActionDelete(action.id),
        };
        const existing = byId.get(nodeId);
        if (existing) next.push({ ...existing, data });
        else next.push({ id: nodeId, type: 'action', position: { x: LAYOUT.ACT_X, y: index * LAYOUT.ACT_Y_STEP + 40 }, data });
      });

      return next;
    });

    /* Edges: rebuild from scratch each time the underlying rule changes.
     * Edge positions are derived from node handles, so this isn't disruptive. */
    const nextEdges: Edge[] = [];
    rule.conditions.forEach((condition) => {
      nextEdges.push({
        id: `e-trigger-${condition.id}`,
        source: 'trigger',
        target: `cond-${condition.id}`,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    });
    rule.actions.forEach((action) => {
      if (rule.conditions.length === 0) {
        nextEdges.push({
          id: `e-trigger-${action.id}`,
          source: 'trigger',
          target: `act-${action.id}`,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
        });
      } else {
        rule.conditions.forEach((condition) => {
          nextEdges.push({
            id: `e-${condition.id}-${action.id}`,
            source: `cond-${condition.id}`,
            target: `act-${action.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
          });
        });
      }
    });
    setEdges(nextEdges);
  }, [rule, handlers, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.15, minZoom: 0.8, maxZoom: 1 }}
      panOnScroll
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

/* ─── Main page ─────────────────────────────────────────────── */

function RulesView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchRules });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rule | null>(null);

  useEffect(() => {
    if (!selectedId && rules[0]) setSelectedId(rules[0].id);
  }, [rules, selectedId]);

  useEffect(() => {
    const current = rules.find((rule) => rule.id === selectedId) ?? null;
    setDraft(current);
  }, [rules, selectedId]);

  const save = useMutation({
    mutationFn: saveRule,
    onSuccess: () => { toast.success('Rule saved (UI only — engine off)'); qc.invalidateQueries({ queryKey: QK }); },
    onError: (error) => toast.error('Save failed', { description: (error as Error).message }),
  });
  const remove = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => { toast.success('Rule deleted'); qc.invalidateQueries({ queryKey: QK }); setSelectedId(null); setDraft(null); },
    onError: (error) => toast.error('Delete failed', { description: (error as Error).message }),
  });

  const addRule = () => {
    const next = makeDraftRule();
    save.mutate(next, { onSuccess: () => setSelectedId(next.id) });
  };

  const addCondition = () => {
    if (!draft) return;
    setDraft({ ...draft, conditions: [...draft.conditions, makeCondition()] });
  };
  const addAction = (type: RuleAction['type']) => {
    if (!draft) return;
    setDraft({ ...draft, actions: [...draft.actions, makeAction(type)] });
  };

  const isDirty = draft && rules.some((rule) => rule.id === draft.id)
    ? JSON.stringify(draft) !== JSON.stringify(rules.find((rule) => rule.id === draft.id))
    : false;

  return (
    <>
      <PageHeader
        titleI18nKey="rules.title"
        subtitleI18nKey="rules.subtitle"
        actions={(
          <button type="button" className="btn primary" onClick={addRule}>
            <Plus size={14} /> {t('rules.new_rule')}
          </button>
        )}
      />

      <div className="rules-banner">
        <AlertTriangle size={18} />
        <div>
          <div className="rules-banner-title">{t('rules.banner_title')}</div>
          <div className="rules-banner-body">{t('rules.banner_body')}</div>
        </div>
      </div>

      <div className="rules-shell">
        <aside className="rules-list">
          {isLoading && <div className="muted" style={{ padding: 16 }}>{t('common.loading')}</div>}
          {rules.map((rule) => {
            const Icon = LIFECYCLE_ICON[rule.lifecycle];
            return (
              <button
                key={rule.id}
                type="button"
                className={`rule-card${selectedId === rule.id ? ' active' : ''}`}
                onClick={() => setSelectedId(rule.id)}
              >
                <div className="rule-card-head">
                  <span className={`pill ${LIFECYCLE_TONE[rule.lifecycle]}`}>
                    <Icon size={9} /> {rule.lifecycle}
                  </span>
                  <span className="muted">P{rule.priority}</span>
                </div>
                <div className="rule-card-name">{rule.name}</div>
                <div className="rule-card-desc">{rule.description || '—'}</div>
                <div className="rule-card-meta">
                  <span title="Conditions"><Filter size={9} /> {rule.conditions.length}</span>
                  <span title="Actions"><ArrowRight size={9} /> {rule.actions.length}</span>
                  <span title="Fires in last 7 days">
                    <Activity size={9} /> {rule.telemetry.fires_count_7d}
                  </span>
                  {!rule.terminating && <span className="pill" title="Composable rule">compose</span>}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="rules-canvas-wrap">
          {!draft ? (
            <div className="muted" style={{ padding: 32, textAlign: 'center' }}>{t('rules.no_selection')}</div>
          ) : (
            <>
              <div className="rules-canvas-toolbar">
                <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    className="rules-name-input"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    placeholder="Rule name"
                  />
                  <select
                    value={draft.lifecycle}
                    onChange={(event) => setDraft({ ...draft, lifecycle: event.target.value as RuleLifecycle })}
                    title="Lifecycle"
                  >
                    <option value="draft">draft</option>
                    <option value="shadow">shadow (log only)</option>
                    <option value="active">active</option>
                    <option value="archived">archived</option>
                  </select>
                  <label className="muted" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    Priority
                    <input
                      type="number"
                      style={{ width: 64 }}
                      value={draft.priority}
                      onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
                    />
                  </label>
                  <label className="checkbox-row" style={{ marginBottom: 0 }}>
                    <input
                      type="checkbox"
                      checked={!draft.terminating}
                      onChange={(event) => setDraft({ ...draft, terminating: !event.target.checked })}
                    />
                    Composable (don't stop on match)
                  </label>
                </div>

                <button type="button" className="btn ghost" onClick={addCondition}>
                  <Filter size={12} /> {t('rules.add_condition')}
                </button>
                <details className="rules-add-action">
                  <summary className="btn ghost"><ArrowRight size={12} /> {t('rules.add_action')}</summary>
                  <div className="rules-add-menu">
                    {(['create_task', 'append_existing', 'escalate', 'add_watcher', 'notify', 'skip'] as const).map((type) => (
                      <button key={type} type="button" onClick={() => addAction(type)}>
                        {ACTION_LABEL[type]}
                      </button>
                    ))}
                  </div>
                </details>

                <button
                  type="button"
                  className="btn danger-outline"
                  onClick={() => { if (confirm('Delete this rule?')) remove.mutate(draft.id); }}
                >
                  <Trash2 size={12} />
                </button>
                <button
                  type="button"
                  className="save-btn"
                  disabled={!isDirty || !draft.name.trim()}
                  onClick={() => save.mutate(draft)}
                >
                  <Save size={13} /> {t('common.save')}
                </button>
              </div>

              <div className="rules-canvas">
                <ReactFlowProvider>
                  <RuleCanvas rule={draft} onChange={setDraft} />
                </ReactFlowProvider>
              </div>

              <div className="rules-telemetry">
                <Network size={11} />
                <span className="muted">Telemetry preview (engine will fill these):</span>
                <span><strong>{draft.telemetry.fires_total}</strong> total fires</span>
                <span><strong>{draft.telemetry.fires_count_7d}</strong> last 7d</span>
                <span><strong>{draft.telemetry.avg_resolution_hours ?? '—'}</strong> avg resolution (h)</span>
                <span><strong>{draft.telemetry.last_fired_at ?? '—'}</strong> last fired</span>
                <span><strong>{draft.telemetry.reassignment_rate_7d ?? '—'}</strong> reassign rate</span>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}

export const Route = createFileRoute('/rules')({ component: RulesView });
