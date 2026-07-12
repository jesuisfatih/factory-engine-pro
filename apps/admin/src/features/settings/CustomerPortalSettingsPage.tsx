import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  accountPortalExperienceSchema,
  DEFAULT_ACCOUNT_PORTAL_EXPERIENCE,
  type AccountPortalExperience,
} from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { workspaceBadge, workspaceBrandQueryKey, workspaceName } from '@/lib/workspace-brand';
import { AccountPortalExperienceEditor } from './AccountPortalExperienceEditor';

const tenantConfigQueryKey = ['identity', 'tenant-config'] as const;

interface PortalTenantConfig {
  workspaceName: string | null;
  brandBadge: string | null;
  brandLogo: string | null;
  accountPortalExperience: AccountPortalExperience;
}

export function CustomerPortalSettingsPage() {
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = new Set(principal?.permissions ?? []).has('settings.write');
  const [experience, setExperience] = useState<AccountPortalExperience>(() => clone(DEFAULT_ACCOUNT_PORTAL_EXPERIENCE));
  const [validationError, setValidationError] = useState<string | null>(null);
  const config = useQuery({
    queryKey: tenantConfigQueryKey,
    queryFn: () => adminApi.tenantConfig() as Promise<PortalTenantConfig>,
    retry: false,
  });

  useEffect(() => {
    if (config.data) setExperience(clone(config.data.accountPortalExperience ?? DEFAULT_ACCOUNT_PORTAL_EXPERIENCE));
  }, [config.data]);

  const save = useMutation({
    mutationFn: async () => {
      setValidationError(null);
      const parsed = accountPortalExperienceSchema.safeParse(experience);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const message = issue ? `${issue.path.join('.')}: ${issue.message}` : 'Portal settings are invalid.';
        setValidationError(message);
        throw new Error(message);
      }
      return adminApi.updateTenantConfig({ accountPortalExperience: parsed.data });
    },
    onSuccess: async () => {
      toast.success('Customer portal pages saved');
      await Promise.all([
        qc.invalidateQueries({ queryKey: tenantConfigQueryKey }),
        qc.invalidateQueries({ queryKey: workspaceBrandQueryKey }),
      ]);
    },
    onError: (error) => {
      if (!validationError) toast.error('Customer portal pages could not be saved', { description: apiErrorMessage(error) });
    },
  });

  if (config.isLoading) return <PortalState icon={<RefreshCw className="spin" size={18} />} title="Loading customer portal" body="Reading the live login, registration, and B2B request presentation." />;
  if (config.isError) return <PortalState icon={<AlertTriangle size={18} />} title="Customer portal unavailable" body={apiErrorMessage(config.error)} action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> Retry</button>} />;
  if (!config.data) return <PortalState icon={<AlertTriangle size={18} />} title="Customer portal unavailable" body="The tenant configuration response was empty." />;

  const name = workspaceName(config.data.workspaceName);
  const badge = workspaceBadge(config.data.brandBadge, name);

  return (
    <div className="customer-portal-settings">
      <div className="section portal-settings-intro">
        <div>
          <span className="settings-eyebrow">Customer account experience</span>
          <h3>Portal page editor</h3>
          <p>Edit the customer-facing login, registration, and B2B request pages with a live desktop or mobile preview.</p>
        </div>
        <div className="portal-save-status">
          <span><CheckCircle2 size={14} /> Live tenant configuration</span>
          <button id="btn-save-customer-portal" type="button" className="btn primary" disabled={!canWrite || save.isPending} onClick={() => save.mutate()}>
            <Save size={14} /> {save.isPending ? 'Saving...' : 'Save portal pages'}
          </button>
        </div>
      </div>
      {validationError ? <div className="error-state">{validationError}</div> : null}
      <div className="section portal-editor-shell">
        <AccountPortalExperienceEditor
          value={experience}
          onChange={setExperience}
          workspaceName={name}
          brandBadge={badge}
          brandLogo={config.data.brandLogo ?? ''}
          disabled={!canWrite || save.isPending}
        />
      </div>
      {!canWrite ? <div className="empty-state">You need settings.write permission to edit customer portal pages.</div> : null}
    </div>
  );
}

function PortalState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <div className="section workspace-state">{icon}<div><h3>{title}</h3><p>{body}</p>{action}</div></div>;
}

function clone(value: AccountPortalExperience) {
  return JSON.parse(JSON.stringify(value)) as AccountPortalExperience;
}
