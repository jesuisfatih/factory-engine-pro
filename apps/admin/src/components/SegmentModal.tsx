import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { X, Plus, Trash2, Target, AlertTriangle, Save } from 'lucide-react';
import { Dialog, DialogTitle, DialogDescription, DialogClose } from '@/components/Dialog';
import {
  FIELD_GROUPS, RULE_OPERATORS,
  previewSegment, saveSegment,
  type SegmentRule, type FieldGroup, type RuleOperator, type LifecycleStage,
} from '@/lib/live-data';

/** Zod schema for the segment wizard. Used as a TanStack Form onChange validator. */
const SegmentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a color'),
  priority: z.number().int().min(0, 'Min 0').max(10, 'Max 10'),
  lifecycleStage: z.enum(['lead', 'engaged', 'active', 'at_risk', 'churned', 'any']),
  matchMode: z.enum(['all', 'any']),
  rules: z.array(z.object({
    id: z.string(),
    group: z.enum(['company', 'company_user', 'shopify', 'behavior']),
    field: z.string().min(1),
    operator: z.string().min(1),
    value: z.string(),
  })),
});

interface Props { open: boolean; onClose: () => void; }

interface SegmentFormShape {
  name: string;
  description: string;
  color: string;
  priority: number;
  lifecycleStage: LifecycleStage | 'any';
  matchMode: 'all' | 'any';
  rules: SegmentRule[];
}

const DEFAULTS: SegmentFormShape = {
  name: '',
  description: '',
  color: '#1d4ed8',
  priority: 5,
  lifecycleStage: 'any',
  matchMode: 'all',
  rules: [],
};

function findField(group: FieldGroup, fieldId: string) {
  const groupDef = FIELD_GROUPS.find((g) => g.id === group);
  return groupDef?.fields.find((f) => f.id === fieldId);
}

export function SegmentModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const form = useForm({
    defaultValues: DEFAULTS,
    validators: {
      onChange: ({ value }) => {
        const result = SegmentSchema.safeParse(value);
        if (result.success) return undefined;
        return result.error.flatten().fieldErrors;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(value);
        toast.success('Segment saved', { description: `"${value.name}" is now active.` });
        onClose();
      } catch (error) {
        toast.error('Save failed', { description: (error as Error).message });
      }
    },
  });

  // Reset when closed
  useEffect(() => { if (!open) form.reset(DEFAULTS); }, [open, form]);

  const preview = useMutation({
    mutationFn: () => previewSegment({ rules: form.state.values.rules, matchMode: form.state.values.matchMode }),
    onSuccess: (data) => {
      toast.success('Preview ready', {
        description: `${data.matchedCompanies} matched companies · ${data.shopifyCustomers} Shopify customers.`,
      });
    },
    onError: (error) => toast.error('Preview failed', { description: (error as Error).message }),
  });
  const save = useMutation({
    mutationFn: saveSegment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['segments'] }); },
  });

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }} cardClassName="modal-card" labelledBy="seg-modal-title">
      <header className="modal-head">
        <div>
          <DialogTitle asChild>
            <h2 id="seg-modal-title" data-i18n-key="segments.modal.title">{t('segments.modal.title')}</h2>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="sub" data-i18n-key="segments.modal.subtitle">{t('segments.modal.subtitle')}</div>
          </DialogDescription>
        </div>
        <DialogClose asChild>
          <button id="btn-modal-close" type="button" className="close" title={t('segments.modal.close')}>
            <X size={16} />
          </button>
        </DialogClose>
      </header>

        <form
          id="form-new-segment"
          className="modal-body"
          onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void form.handleSubmit(); }}
        >
          {/* ─── LEFT: Identity + Rules ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <section className="modal-section" id="modal-step-1">
              <h3 data-i18n-key="segments.modal.step1_title">{t('segments.modal.step1_title')}</h3>

              <form.Field name="name">
                {(field) => (
                  <div className="field">
                    <label htmlFor="seg-name" data-i18n-key="segments.modal.field_package_name">
                      {t('segments.modal.field_package_name')}
                    </label>
                    <input
                      id="seg-name"
                      data-i18n-key="segments.modal.field_package_name"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      placeholder={t('segments.modal.field_package_name_placeholder')}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name="description">
                {(field) => (
                  <div className="field">
                    <label htmlFor="seg-description" data-i18n-key="segments.modal.field_description">
                      {t('segments.modal.field_description')}
                    </label>
                    <textarea
                      id="seg-description"
                      data-i18n-key="segments.modal.field_description"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      rows={2}
                      placeholder={t('segments.modal.field_description_placeholder')}
                    />
                  </div>
                )}
              </form.Field>

              <div className="field-row">
                <form.Field name="color">
                  {(field) => (
                    <div className="field">
                      <label htmlFor="seg-color" data-i18n-key="segments.modal.field_color">
                        {t('segments.modal.field_color')}
                      </label>
                      <input
                        id="seg-color"
                        type="color"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        style={{ height: 40, padding: 2 }}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="priority">
                  {(field) => (
                    <div className="field">
                      <label htmlFor="seg-priority" data-i18n-key="segments.modal.field_priority">
                        {t('segments.modal.field_priority')}
                      </label>
                      <input
                        id="seg-priority"
                        type="number"
                        min={0}
                        max={10}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(Number(event.target.value))}
                      />
                    </div>
                  )}
                </form.Field>
              </div>

              <div className="field-row">
                <form.Field name="lifecycleStage">
                  {(field) => (
                    <div className="field">
                      <label htmlFor="seg-lifecycle" data-i18n-key="segments.modal.field_lifecycle_stage">
                        {t('segments.modal.field_lifecycle_stage')}
                      </label>
                      <select
                        id="seg-lifecycle"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value as LifecycleStage | 'any')}
                      >
                        <option value="any">{t('segments.modal.any_lifecycle')}</option>
                        <option value="lead">Lead</option>
                        <option value="engaged">Engaged</option>
                        <option value="active">Active</option>
                        <option value="at_risk">At risk</option>
                        <option value="churned">Churned</option>
                      </select>
                    </div>
                  )}
                </form.Field>
                <form.Field name="matchMode">
                  {(field) => (
                    <div className="field">
                      <label htmlFor="seg-match-mode" data-i18n-key="segments.modal.field_match_mode">
                        {t('segments.modal.field_match_mode')}
                      </label>
                      <select
                        id="seg-match-mode"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value as 'all' | 'any')}
                      >
                        <option value="all">{t('segments.modal.match_all')}</option>
                        <option value="any">{t('segments.modal.match_any')}</option>
                      </select>
                    </div>
                  )}
                </form.Field>
              </div>
            </section>

            <section className="modal-section" id="modal-step-2">
              <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span data-i18n-key="segments.modal.step2_title">{t('segments.modal.step2_title')}</span>
              </h3>

              <form.Field name="rules" mode="array">
                {(rulesField) => (
                  <>
                    {rulesField.state.value.length === 0 && (
                      <div className="rules-empty" data-i18n-key="segments.modal.rule_helper">
                        {t('segments.modal.rule_helper')}
                      </div>
                    )}

                    {rulesField.state.value.map((rule, index) => {
                      const fieldDef = findField(rule.group, rule.field);
                      const operators = fieldDef ? RULE_OPERATORS[fieldDef.type] : [];

                      return (
                        <div key={rule.id} className="rule-row" id={`rule-row-${rule.id}`}>
                          {/* field picker (grouped) */}
                          <form.Field name={`rules[${index}].field`}>
                            {(fieldFld) => (
                              <select
                                id={`rule-${index}-field`}
                                data-i18n-key="segments.modal.rule_field_placeholder"
                                value={`${rule.group}::${fieldFld.state.value}`}
                                onChange={(event) => {
                                  const [group, fieldId] = event.target.value.split('::') as [FieldGroup, string];
                                  const nextField = findField(group, fieldId);
                                  const nextOps = nextField ? RULE_OPERATORS[nextField.type] : ['eq' as RuleOperator];
                                  const updated = [...rulesField.state.value];
                                  updated[index] = { ...updated[index], group, field: fieldId as SegmentRule['field'], operator: nextOps[0] };
                                  rulesField.handleChange(updated);
                                }}
                              >
                                <option value="::">{t('segments.modal.rule_field_placeholder')}</option>
                                {FIELD_GROUPS.map((g) => (
                                  <optgroup key={g.id} label={t(`segments.modal.field_groups.${g.id}`)}>
                                    {g.fields.map((f) => (
                                      <option key={`${g.id}-${f.id}`} value={`${g.id}::${f.id}`}>{f.label}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            )}
                          </form.Field>

                          {/* operator */}
                          <form.Field name={`rules[${index}].operator`}>
                            {(opFld) => (
                              <select
                                id={`rule-${index}-operator`}
                                value={opFld.state.value}
                                onChange={(event) => opFld.handleChange(event.target.value as RuleOperator)}
                              >
                                {(operators.length ? operators : ['eq' as RuleOperator]).map((op) => (
                                  <option key={op} value={op}>{t(`segments.modal.operators.${op}`)}</option>
                                ))}
                              </select>
                            )}
                          </form.Field>

                          {/* value */}
                          <form.Field name={`rules[${index}].value`}>
                            {(valFld) => (
                              fieldDef?.type === 'boolean' ? (
                                <input
                                  id={`rule-${index}-value`}
                                  value={String(valFld.state.value || 'false')}
                                  disabled
                                  placeholder={t('segments.modal.rule_value_placeholder')}
                                />
                              ) : (
                                <input
                                  id={`rule-${index}-value`}
                                  data-i18n-key="segments.modal.rule_value_placeholder"
                                  value={valFld.state.value}
                                  onChange={(event) => valFld.handleChange(event.target.value)}
                                  placeholder={t('segments.modal.rule_value_placeholder')}
                                />
                              )
                            )}
                          </form.Field>

                          <button
                            id={`rule-${index}-remove`}
                            type="button"
                            className="remove"
                            onClick={() => rulesField.removeValue(index)}
                            title={t('common.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      id="btn-add-rule"
                      type="button"
                      className="btn ghost"
                      onClick={() => {
                        const nextId = `r${Date.now()}`;
                        const seed = FIELD_GROUPS[0].fields[0];
                        rulesField.pushValue({
                          id: nextId,
                          group: FIELD_GROUPS[0].id,
                          field: seed.id,
                          operator: RULE_OPERATORS[seed.type][0],
                          value: '',
                        });
                      }}
                    >
                      <Plus size={14} /> {t('segments.modal.add_rule')}
                    </button>
                  </>
                )}
              </form.Field>
            </section>
          </div>

          {/* ─── RIGHT: Preview pane ─── */}
          <aside className="modal-section" id="modal-step-3" style={{ background: 'var(--surface)', alignSelf: 'flex-start', position: 'sticky', top: 0 }}>
            <h3 data-i18n-key="segments.modal.step3_title">{t('segments.modal.step3_title')}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12, lineHeight: 1.5 }}
              data-i18n-key="segments.modal.step3_subtitle">
              {t('segments.modal.step3_subtitle')}
            </p>

            <form.Subscribe selector={(state) => state.values.rules.filter((r) => r.field).length}>
              {(usableRulesCount) => (
                <button
                  id="btn-run-preview"
                  type="button"
                  className="btn"
                  style={{ width: '100%', marginBottom: 14 }}
                  disabled={usableRulesCount === 0 || preview.isPending}
                  onClick={() => preview.mutate()}
                >
                  <Target size={14} />
                  {preview.isPending ? t('common.loading') : t('segments.modal.run_preview')}
                </button>
              )}
            </form.Subscribe>

            {preview.data ? (
              <>
                <div className="preview-stats">
                  <div className="stat">
                    <div className="label" data-i18n-key="segments.modal.preview_matched_companies">
                      {t('segments.modal.preview_matched_companies')}
                    </div>
                    <div className="val">{preview.data.matchedCompanies}</div>
                  </div>
                  <div className="stat">
                    <div className="label" data-i18n-key="segments.modal.preview_shopify_customers">
                      {t('segments.modal.preview_shopify_customers')}
                    </div>
                    <div className="val">{preview.data.shopifyCustomers}</div>
                  </div>
                  <div className="stat" style={{ gridColumn: '1 / -1' }}>
                    <div className="label" data-i18n-key="segments.modal.preview_unlinked">
                      {t('segments.modal.preview_unlinked')}
                    </div>
                    <div className="val">{preview.data.unlinkedShopifyCustomers}</div>
                  </div>
                </div>
                {preview.data.sampleNames.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .4 }}
                      data-i18n-key="segments.modal.preview_samples">
                      {t('segments.modal.preview_samples')}
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                      {preview.data.sampleNames.map((name) => (
                        <li key={name} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)' }}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div className="preview-empty">
                <div className="ico"><AlertTriangle size={28} /></div>
                <div className="title" data-i18n-key="segments.modal.no_preview_yet">
                  {t('segments.modal.no_preview_yet')}
                </div>
                <div className="note" data-i18n-key="segments.modal.no_preview_yet_note">
                  {t('segments.modal.no_preview_yet_note')}
                </div>
              </div>
            )}
          </aside>
        </form>

        <footer className="modal-foot">
          <button id="btn-modal-cancel" type="button" className="btn ghost" onClick={onClose}>
            {t('segments.modal.cancel')}
          </button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting, state.values.name.trim().length > 0] as const}
          >
            {([canSubmit, isSubmitting, hasName]) => (
              <button
                id="btn-modal-save"
                type="submit"
                form="form-new-segment"
                className="save-btn"
                disabled={!canSubmit || !hasName || isSubmitting}
              >
                <Save size={14} />
                {isSubmitting ? t('segments.modal.saving') : t('segments.modal.save')}
              </button>
            )}
          </form.Subscribe>
        </footer>
    </Dialog>
  );
}
