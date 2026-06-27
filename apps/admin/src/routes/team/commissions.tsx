import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Plus, Save, Trash2, Users as UsersIcon, User } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/Tabs';
import {
  fetchCommissionProfiles, saveCommissionProfile, deleteCommissionProfile,
  SELLERUSERS,
  type CommissionProfile, type CommissionRule, type CommissionAssignType,
  type CommissionRuleType, type CommissionPeriod,
} from '@/lib/mock';
import { ROLES, useCan } from '@/lib/permissions';

const QK = ['team', 'commission-profiles'] as const;

function emptyRule(): CommissionRule {
  return { id: `cr-${Date.now()}-${Math.floor(Math.random() * 1000)}`, type: 'flat', target: '', ratePct: 5, period: 'monthly', priority: 1, thresholdUsd: null, capUsd: null };
}

function emptyProfile(): CommissionProfile {
  return {
    id: `cp-${Date.now()}`,
    name: '',
    assignType: 'team',
    assigneeId: 'sales_service',
    active: true,
    rules: [emptyRule()],
    updatedAt: 'draft',
  };
}

interface RowProps {
  profile: CommissionProfile;
  expanded: boolean;
  isDraft: boolean;
  onToggle: () => void;
  onSave: (next: CommissionProfile) => void;
  onDelete: () => void;
  canWrite: boolean;
}

function ProfileRow({ profile, expanded, isDraft, onToggle, onSave, onDelete, canWrite }: RowProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CommissionProfile>(profile);

  const updateRule = (id: string, patch: Partial<CommissionRule>) => {
    setDraft((current) => ({ ...current, rules: current.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) }));
  };
  const addRule = () => setDraft((current) => ({ ...current, rules: [...current.rules, emptyRule()] }));
  const removeRule = (id: string) => setDraft((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }));

  const assigneeOptions = draft.assignType === 'rep'
    ? SELLERUSERS.map((su) => ({ value: su.id, label: `${su.name} · ${su.email}` }))
    : ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }));

  const headerSummary = `${profile.rules.length} ${profile.rules.length === 1 ? 'rule' : 'rules'} · base ${profile.rules.find((rule) => rule.type === 'flat')?.ratePct ?? 0}%`;
  const assigneeLabel = profile.assignType === 'rep'
    ? SELLERUSERS.find((su) => su.id === profile.assigneeId)?.name ?? '—'
    : t(`roles.${profile.assigneeId ?? 'admin'}`);

  return (
    <div id={`commission-profile-${profile.id}`} className="commission-profile">
      <button
        type="button"
        className="commission-profile-head"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`commission-profile-body-${profile.id}`}
      >
        <div className="commission-profile-title">
          <span className={`commission-type-badge ${profile.assignType}`}>
            {profile.assignType === 'rep' ? <User size={11} /> : <UsersIcon size={11} />}
            {t(`team.commissions.profile_type_${profile.assignType}`)}
          </span>
          <strong>{profile.name || (isDraft ? 'New profile' : '—')}</strong>
          <span className="commission-profile-assignee">{assigneeLabel}</span>
        </div>
        <div className="commission-profile-meta">
          {!profile.active && <span className="pill warn">Inactive</span>}
          <span className="muted">{headerSummary}</span>
          <span className="muted">{profile.updatedAt}</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div id={`commission-profile-body-${profile.id}`} className="commission-profile-body">
          <div className="field-row">
            <div className="field">
              <label htmlFor={`profile-name-${profile.id}`} data-i18n-key="team.commissions.profile_name">
                {t('team.commissions.profile_name')}
              </label>
              <input
                id={`profile-name-${profile.id}`}
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder={t('team.commissions.profile_name_placeholder')}
                disabled={!canWrite}
              />
            </div>
            <div className="field">
              <label htmlFor={`profile-type-${profile.id}`} data-i18n-key="team.commissions.profile_type">
                {t('team.commissions.profile_type')}
              </label>
              <select
                id={`profile-type-${profile.id}`}
                value={draft.assignType}
                onChange={(event) => setDraft((current) => {
                  const nextType = event.target.value as CommissionAssignType;
                  return {
                    ...current,
                    assignType: nextType,
                    assigneeId: nextType === 'rep' ? SELLERUSERS[0].id : 'sales_service',
                  };
                })}
                disabled={!canWrite}
              >
                <option value="team">{t('team.commissions.profile_type_team')}</option>
                <option value="rep">{t('team.commissions.profile_type_rep')}</option>
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={`profile-assignee-${profile.id}`}>
                {t(draft.assignType === 'rep' ? 'team.commissions.profile_assignee_rep' : 'team.commissions.profile_assignee_team')}
              </label>
              <select
                id={`profile-assignee-${profile.id}`}
                value={draft.assigneeId ?? ''}
                onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))}
                disabled={!canWrite}
              >
                {assigneeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <label className="checkbox-row" style={{ marginTop: 24 }}>
                <input
                  id={`profile-active-${profile.id}`}
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))}
                  disabled={!canWrite}
                />
                {t('team.commissions.profile_active')}
              </label>
            </div>
          </div>

          <h4 className="commission-rules-title">
            <span>{t('team.commissions.rules_title')}</span>
            {canWrite && (
              <button id={`btn-add-rule-${profile.id}`} type="button" className="btn ghost" onClick={addRule}>
                <Plus size={13} /> {t('team.commissions.add_rule')}
              </button>
            )}
          </h4>

          <div className="commission-rules">
            <div className="commission-rule head">
              <div>{t('team.commissions.rule_type')}</div>
              <div>{t('team.commissions.rule_target')}</div>
              <div>{t('team.commissions.rule_rate')}</div>
              <div>{t('team.commissions.rule_period')}</div>
              <div>{t('team.commissions.rule_priority')}</div>
              <div>{t('team.commissions.rule_threshold')}</div>
              <div>{t('team.commissions.rule_cap')}</div>
              <div />
            </div>
            {draft.rules.map((rule) => (
              <div key={rule.id} className="commission-rule">
                <select
                  value={rule.type}
                  onChange={(event) => updateRule(rule.id, { type: event.target.value as CommissionRuleType })}
                  disabled={!canWrite}
                >
                  <option value="flat">{t('team.commissions.rule_type_flat')}</option>
                  <option value="tiered">{t('team.commissions.rule_type_tiered')}</option>
                  <option value="segment">{t('team.commissions.rule_type_segment')}</option>
                  <option value="product">{t('team.commissions.rule_type_product')}</option>
                </select>
                <input
                  value={rule.target}
                  placeholder={t('team.commissions.rule_target_placeholder')}
                  onChange={(event) => updateRule(rule.id, { target: event.target.value })}
                  disabled={rule.type === 'flat' || !canWrite}
                />
                <input
                  type="number"
                  step="0.1"
                  value={rule.ratePct}
                  onChange={(event) => updateRule(rule.id, { ratePct: Number(event.target.value) })}
                  disabled={!canWrite}
                />
                <select
                  value={rule.period}
                  onChange={(event) => updateRule(rule.id, { period: event.target.value as CommissionPeriod })}
                  disabled={!canWrite}
                >
                  <option value="monthly">{t('team.commissions.period_monthly')}</option>
                  <option value="quarterly">{t('team.commissions.period_quarterly')}</option>
                  <option value="lifetime">{t('team.commissions.period_lifetime')}</option>
                </select>
                <input
                  type="number"
                  value={rule.priority}
                  onChange={(event) => updateRule(rule.id, { priority: Number(event.target.value) })}
                  disabled={!canWrite}
                />
                <input
                  type="number"
                  value={rule.thresholdUsd ?? ''}
                  placeholder="—"
                  onChange={(event) => updateRule(rule.id, { thresholdUsd: event.target.value === '' ? null : Number(event.target.value) })}
                  disabled={rule.type !== 'tiered' || !canWrite}
                />
                <input
                  type="number"
                  value={rule.capUsd ?? ''}
                  placeholder="—"
                  onChange={(event) => updateRule(rule.id, { capUsd: event.target.value === '' ? null : Number(event.target.value) })}
                  disabled={!canWrite}
                />
                {canWrite ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => removeRule(rule.id)}
                    disabled={draft.rules.length === 1}
                    title="Remove rule"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : <span />}
              </div>
            ))}
          </div>

          {canWrite && (
            <div className="commission-profile-actions">
              {!isDraft && (
                <button
                  id={`btn-delete-profile-${profile.id}`}
                  type="button"
                  className="btn danger-outline"
                  onClick={() => {
                    if (confirm(t('team.commissions.delete_confirm'))) onDelete();
                  }}
                >
                  <Trash2 size={13} /> {t('team.commissions.delete_profile')}
                </button>
              )}
              <button
                id={`btn-save-profile-${profile.id}`}
                type="button"
                className="save-btn"
                disabled={!draft.name.trim()}
                onClick={() => onSave(draft)}
              >
                <Save size={13} /> {t('team.commissions.save_profile')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CommissionsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useCan('team.commissions.write');

  const { data: profiles = [] } = useQuery({ queryKey: QK, queryFn: fetchCommissionProfiles });

  const [drafts, setDrafts] = useState<CommissionProfile[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const save = useMutation({
    mutationFn: saveCommissionProfile,
    onSuccess: (saved, input) => {
      toast.success('Profile saved', { description: `${input.name} updated.` });
      setDrafts((current) => current.filter((draft) => draft.id !== input.id));
      qc.invalidateQueries({ queryKey: QK });
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(input.id);
        next.add(saved.id);
        return next;
      });
    },
    onError: (error) => toast.error('Save failed', { description: (error as Error).message }),
  });

  const remove = useMutation({
    mutationFn: deleteCommissionProfile,
    onSuccess: (_data, id) => {
      toast.success('Profile deleted');
      qc.invalidateQueries({ queryKey: QK });
      setExpandedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    },
    onError: (error) => toast.error('Delete failed', { description: (error as Error).message }),
  });

  const allProfiles: { profile: CommissionProfile; isDraft: boolean }[] = [
    ...drafts.map((draft) => ({ profile: draft, isDraft: true })),
    ...profiles.map((profile) => ({ profile, isDraft: false })),
  ];

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddDraft = () => {
    const draft = emptyProfile();
    setDrafts((current) => [draft, ...current]);
    setExpandedIds((current) => new Set(current).add(draft.id));
  };

  return (
    <>
      <PageHeader
        titleI18nKey="team.title"
        subtitleI18nKey="team.subtitle"
        actions={canWrite ? (
          <button id="btn-new-profile" data-i18n-key="team.commissions.new_profile" type="button" className="btn primary" onClick={handleAddDraft}>
            <Plus size={14} /> {t('team.commissions.new_profile')}
          </button>
        ) : null}
      />
      <Tabs
        tabs={[
          { to: '/team/roles', i18nKey: 'team.tabs.roles', id: 'tab-team-roles' },
          { to: '/team/users', i18nKey: 'team.tabs.users', id: 'tab-team-users' },
          { to: '/team/commissions', i18nKey: 'team.tabs.commissions', id: 'tab-team-commissions' },
        ]}
      />

      <div className="section" style={{ marginBottom: 16 }}>
        <h3>
          <span data-i18n-key="team.commissions.title">{t('team.commissions.title')}</span>
        </h3>
        <p className="subtitle" data-i18n-key="team.commissions.subtitle" style={{ marginTop: -4, marginBottom: 12 }}>
          {t('team.commissions.subtitle')}
        </p>
        <div className="pill accent" data-i18n-key="team.commissions.sales_only_note" style={{ display: 'inline-block' }}>
          {t('team.commissions.sales_only_note')}
        </div>
      </div>

      {allProfiles.length === 0 && (
        <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
          {t('team.commissions.empty_state')}
        </div>
      )}

      <div className="commission-profile-list">
        {allProfiles.map(({ profile, isDraft }) => (
          <ProfileRow
            key={profile.id}
            profile={profile}
            isDraft={isDraft}
            expanded={expandedIds.has(profile.id)}
            onToggle={() => toggleExpand(profile.id)}
            onSave={(next) => save.mutate(next)}
            onDelete={() => remove.mutate(profile.id)}
            canWrite={canWrite}
          />
        ))}
      </div>
    </>
  );
}

export const Route = createFileRoute('/team/commissions')({ component: CommissionsView });
