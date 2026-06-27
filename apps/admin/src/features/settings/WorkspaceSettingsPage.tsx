import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RefreshCw, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { tenantConfigSchema, type TenantConfigInput } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { workspaceBadge, workspaceBrandQueryKey, workspaceName } from '@/lib/workspace-brand';

interface TenantConfigResponse {
  workspaceName: string | null;
  brandBadge: string | null;
  brandLogo: string | null;
}

interface WorkspaceFormState {
  workspaceName: string;
  brandBadge: string;
  brandLogo: string;
}

const tenantConfigQueryKey = ['identity', 'tenant-config'];

const emptyForm: WorkspaceFormState = {
  workspaceName: '',
  brandBadge: '',
  brandLogo: '',
};

export function WorkspaceSettingsPage() {
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = new Set(principal?.permissions ?? []).has('settings.write');
  const [form, setForm] = useState<WorkspaceFormState>(emptyForm);
  const [validationError, setValidationError] = useState<string | null>(null);

  const config = useQuery({
    queryKey: tenantConfigQueryKey,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
    retry: false,
  });

  useEffect(() => {
    if (!config.data) return;
    setForm({
      workspaceName: config.data.workspaceName ?? '',
      brandBadge: config.data.brandBadge ?? '',
      brandLogo: config.data.brandLogo ?? '',
    });
  }, [config.data]);

  const save = useMutation({
    mutationFn: (input: TenantConfigInput) => adminApi.updateTenantConfig(input),
    onSuccess: async () => {
      toast.success('Workspace settings saved');
      await Promise.all([
        qc.invalidateQueries({ queryKey: tenantConfigQueryKey }),
        qc.invalidateQueries({ queryKey: workspaceBrandQueryKey }),
      ]);
    },
    onError: (error) => toast.error('Workspace settings failed', { description: apiErrorMessage(error) }),
  });

  const previewName = workspaceName(form.workspaceName);
  const previewBadge = workspaceBadge(form.brandBadge, previewName);
  const hasSavedBrand = Boolean(config.data?.workspaceName || config.data?.brandBadge || config.data?.brandLogo);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    const input = {
      workspaceName: clean(form.workspaceName),
      brandBadge: clean(form.brandBadge),
      brandLogo: clean(form.brandLogo),
    };
    const parsed = tenantConfigSchema.safeParse(input);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Workspace settings are invalid');
      return;
    }
    save.mutate(parsed.data);
  };

  if (config.isLoading) {
    return (
      <div className="section workspace-state">
        <RefreshCw className="spin" size={18} />
        <div>
          <h3>Loading workspace settings</h3>
          <p>Reading the tenant configuration from the API.</p>
        </div>
      </div>
    );
  }

  if (config.isError) {
    return (
      <div className="section workspace-state error-state">
        <AlertTriangle size={18} />
        <div>
          <h3>Workspace settings unavailable</h3>
          <p>{apiErrorMessage(config.error)}</p>
          <button type="button" className="btn" onClick={() => config.refetch()}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-settings-grid">
      <form className="section" onSubmit={submit}>
        <h3>Workspace identity</h3>
        {!hasSavedBrand && (
          <div className="empty-state workspace-empty">
            <ImageIcon size={18} />
            <div>
              <strong>No workspace brand saved yet.</strong>
              <span>Save a name and badge so navigation, auth and topbar use the tenant record.</span>
            </div>
          </div>
        )}
        {validationError && <div className="error-state">{validationError}</div>}
        <div className="field">
          <label htmlFor="field-workspace-name">Workspace name</label>
          <input
            id="field-workspace-name"
            value={form.workspaceName}
            onChange={(event) => setForm((current) => ({ ...current, workspaceName: event.target.value }))}
            disabled={!canWrite || save.isPending}
            placeholder="Workspace name"
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="field-brand-badge">Badge</label>
            <input
              id="field-brand-badge"
              value={form.brandBadge}
              onChange={(event) => setForm((current) => ({ ...current, brandBadge: event.target.value.toUpperCase().slice(0, 6) }))}
              disabled={!canWrite || save.isPending}
              placeholder={previewBadge}
            />
            <span className="hint">Shown when no logo URL is set.</span>
          </div>
          <div className="field">
            <label htmlFor="field-brand-logo">Logo URL</label>
            <input
              id="field-brand-logo"
              value={form.brandLogo}
              onChange={(event) => setForm((current) => ({ ...current, brandLogo: event.target.value }))}
              disabled={!canWrite || save.isPending}
              placeholder="https://..."
            />
          </div>
        </div>
        <div className="workspace-form-actions">
          <button id="btn-save-workspace" type="submit" className="btn primary" disabled={!canWrite || save.isPending}>
            <Save size={14} />
            {save.isPending ? 'Saving' : 'Save workspace'}
          </button>
          {!canWrite && <span className="hint">You need settings.write permission to update workspace settings.</span>}
        </div>
      </form>

      <div className="section workspace-preview">
        <h3>Live preview</h3>
        <div className="workspace preview-row">
          {form.brandLogo ? <img className="ws-logo" src={form.brandLogo} alt="" /> : <div className="ws-badge">{previewBadge}</div>}
          <div className="ws-meta">
            <div className="name">{previewName}</div>
            <div className="role">Back panel</div>
          </div>
        </div>
        <div className="topbar-workspace preview-pill">
          {form.brandLogo ? <img src={form.brandLogo} alt="" /> : <span>{previewBadge}</span>}
          <strong>{previewName}</strong>
        </div>
      </div>
    </div>
  );
}

function clean(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
