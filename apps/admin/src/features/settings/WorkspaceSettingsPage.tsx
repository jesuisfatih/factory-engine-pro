import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Building2,
  Copy,
  Image as ImageIcon,
  KeyRound,
  Palette,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  brandAssetsSchema,
  companyProfileSchema,
  createMcpTokenSchema,
  DEFAULT_BRAND_ASSETS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_URGENCY_SCORING_CONFIG,
  tenantConfigSchema,
  updateCurrentMemberSchema,
  type BrandAssets,
  type CompanyProfile,
  type CreateMcpTokenResponse,
  type CurrentMemberProfile,
  type TenantConfigInput,
  type UrgencyScoringConfig,
} from '@factory-engine-pro/contracts';
import { ADMIN_API_BASE_URL, adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';
import { workspaceBadge, workspaceBrandQueryKey, workspaceName } from '@/lib/workspace-brand';

type WorkspaceSection = 'company' | 'brand' | 'profile' | 'operations' | 'access';

interface TenantConfigResponse {
  workspaceName: string | null;
  brandBadge: string | null;
  brandLogo: string | null;
  companyProfile: CompanyProfile;
  brandAssets: BrandAssets;
  urgencyScoringConfig: UrgencyScoringConfig;
}

interface BrandForm {
  workspaceName: string;
  brandBadge: string;
  assets: BrandAssets;
}

interface McpTokenFormState {
  label: string;
  expiresInDays: number;
  canPublish: boolean;
  canReadAircallTranscripts: boolean;
}

const tenantConfigQueryKey = ['identity', 'tenant-config'] as const;
const profileQueryKey = ['identity', 'me', 'profile'] as const;
const URGENCY_WEIGHT_FIELDS = ['segmentWeight', 'repeatCountWeight', 'intentWeight', 'signalUrgencyWeight', 'waitingHoursWeight'] as const;
const INTENT_SCORE_FIELDS = ['complaint', 'escalation', 'reorder', 'sales', 'support', 'follow_up'] as const;
const RESOLVER_URGENCY_SCORE_FIELDS = ['critical', 'high', 'medium', 'low'] as const;

const sections: Array<{ id: WorkspaceSection; label: string; description: string; icon: typeof Building2 }> = [
  { id: 'company', label: 'Company', description: 'Legal and contact details', icon: Building2 },
  { id: 'brand', label: 'Brand', description: 'Logos and system identity', icon: Palette },
  { id: 'profile', label: 'My profile', description: 'Your workspace identity', icon: UserRound },
  { id: 'operations', label: 'Operations', description: 'Priority scoring', icon: SlidersHorizontal },
  { id: 'access', label: 'API access', description: 'MCP access tokens', icon: KeyRound },
];

const emptyMcpForm: McpTokenFormState = {
  label: 'Claude workflow access',
  expiresInDays: 90,
  canPublish: true,
  canReadAircallTranscripts: true,
};

export function WorkspaceSettingsPage() {
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = new Set(principal?.permissions ?? []).has('settings.write');
  const [active, setActive] = useState<WorkspaceSection>('company');
  const [company, setCompany] = useState<CompanyProfile>(() => ({ ...DEFAULT_COMPANY_PROFILE }));
  const [brand, setBrand] = useState<BrandForm>(() => ({ workspaceName: '', brandBadge: '', assets: { ...DEFAULT_BRAND_ASSETS } }));
  const [profile, setProfile] = useState<CurrentMemberProfile | null>(null);
  const [urgency, setUrgency] = useState<UrgencyScoringConfig>(() => defaultUrgencyConfig());
  const [validationError, setValidationError] = useState<string | null>(null);

  const config = useQuery({
    queryKey: tenantConfigQueryKey,
    queryFn: () => adminApi.tenantConfig() as Promise<TenantConfigResponse>,
    retry: false,
  });
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => adminApi.currentMemberProfile(),
    retry: false,
  });

  useEffect(() => {
    if (!config.data) return;
    const name = workspaceName(config.data.workspaceName);
    const assets = { ...DEFAULT_BRAND_ASSETS, ...config.data.brandAssets };
    if (!assets.primaryLogoUrl && config.data.brandLogo) assets.primaryLogoUrl = config.data.brandLogo;
    setCompany({ ...DEFAULT_COMPANY_PROFILE, ...config.data.companyProfile });
    setBrand({
      workspaceName: config.data.workspaceName ?? name,
      brandBadge: workspaceBadge(config.data.brandBadge, name),
      assets,
    });
    setUrgency(config.data.urgencyScoringConfig ?? defaultUrgencyConfig());
  }, [config.data]);

  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data);
  }, [profileQuery.data]);

  const saveConfig = useMutation({
    mutationFn: (input: TenantConfigInput) => adminApi.updateTenantConfig(input),
    onSuccess: async () => {
      toast.success('Workspace settings saved');
      setValidationError(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: tenantConfigQueryKey }),
        qc.invalidateQueries({ queryKey: workspaceBrandQueryKey }),
      ]);
    },
    onError: (error) => toast.error('Workspace settings could not be saved', { description: apiErrorMessage(error) }),
  });

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Profile is not loaded');
      const parsed = updateCurrentMemberSchema.safeParse({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: nullable(profile.phone),
        jobTitle: nullable(profile.jobTitle),
        avatarUrl: nullable(profile.avatarUrl),
        timezone: nullable(profile.timezone),
      });
      if (!parsed.success) throw new Error(formatIssue(parsed.error.issues[0]));
      return adminApi.updateCurrentMemberProfile(parsed.data);
    },
    onSuccess: async (updated) => {
      setProfile(updated);
      toast.success('Your profile was updated');
      await Promise.all([qc.invalidateQueries({ queryKey: profileQueryKey }), adminApi.refreshSession()]);
    },
    onError: (error) => toast.error('Profile could not be saved', { description: apiErrorMessage(error) }),
  });

  const submitConfig = (input: TenantConfigInput) => {
    setValidationError(null);
    const parsed = tenantConfigSchema.safeParse(input);
    if (!parsed.success) {
      setValidationError(formatIssue(parsed.error.issues[0]));
      return;
    }
    saveConfig.mutate(parsed.data);
  };

  if (config.isLoading) return <StatePanel icon={<RefreshCw className="spin" size={18} />} title="Loading workspace settings" body="Reading company, brand, operations, and access settings from the tenant API." />;
  if (config.isError) return <StatePanel icon={<AlertTriangle size={18} />} title="Workspace settings unavailable" body={apiErrorMessage(config.error)} action={<button type="button" className="btn" onClick={() => config.refetch()}><RefreshCw size={14} /> Retry</button>} />;

  const busy = saveConfig.isPending || saveProfile.isPending;

  return (
    <div className="workspace-settings-layout">
      <aside className="workspace-settings-menu" aria-label="Workspace settings sections">
        <div className="workspace-settings-menu-title">Workspace</div>
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <button key={section.id} type="button" className={active === section.id ? 'active' : ''} onClick={() => { setActive(section.id); setValidationError(null); }}>
              <Icon size={17} />
              <span><strong>{section.label}</strong><small>{section.description}</small></span>
            </button>
          );
        })}
      </aside>

      <main className="workspace-settings-content">
        {validationError ? <div className="error-state">{validationError}</div> : null}
        {active === 'company' ? (
          <SettingsSection title="Company details" description="The official business information used throughout this workspace." icon={<Building2 size={18} />}>
            <div className="field-row">
              <Field label="Display name" value={company.displayName} onChange={(displayName) => setCompany((current) => ({ ...current, displayName }))} disabled={!canWrite || busy} />
              <Field label="Legal company name" value={company.legalName} onChange={(legalName) => setCompany((current) => ({ ...current, legalName }))} disabled={!canWrite || busy} />
            </div>
            <div className="field-row">
              <Field label="Company email" type="email" value={company.email} onChange={(email) => setCompany((current) => ({ ...current, email }))} disabled={!canWrite || busy} />
              <Field label="Company phone" value={company.phone} onChange={(phone) => setCompany((current) => ({ ...current, phone }))} disabled={!canWrite || busy} />
            </div>
            <div className="field-row">
              <Field label="Website" value={company.website} placeholder="https://" onChange={(website) => setCompany((current) => ({ ...current, website }))} disabled={!canWrite || busy} />
              <Field label="Tax ID" value={company.taxId} onChange={(taxId) => setCompany((current) => ({ ...current, taxId }))} disabled={!canWrite || busy} />
            </div>
            <div className="settings-subsection-title">Business address</div>
            <Field label="Address line 1" value={company.addressLine1} onChange={(addressLine1) => setCompany((current) => ({ ...current, addressLine1 }))} disabled={!canWrite || busy} />
            <Field label="Address line 2" value={company.addressLine2} onChange={(addressLine2) => setCompany((current) => ({ ...current, addressLine2 }))} disabled={!canWrite || busy} />
            <div className="field-row field-row-3">
              <Field label="City" value={company.city} onChange={(city) => setCompany((current) => ({ ...current, city }))} disabled={!canWrite || busy} />
              <Field label="State / province" value={company.state} onChange={(state) => setCompany((current) => ({ ...current, state }))} disabled={!canWrite || busy} />
              <Field label="Postal code" value={company.postalCode} onChange={(postalCode) => setCompany((current) => ({ ...current, postalCode }))} disabled={!canWrite || busy} />
            </div>
            <div className="field-row">
              <Field label="Country" value={company.country} onChange={(country) => setCompany((current) => ({ ...current, country }))} disabled={!canWrite || busy} />
              <Field label="Business timezone" value={company.timezone} onChange={(timezone) => setCompany((current) => ({ ...current, timezone }))} disabled={!canWrite || busy} />
            </div>
            <SaveRow canWrite={canWrite} pending={saveConfig.isPending} onSave={() => {
              const parsed = companyProfileSchema.safeParse(company);
              if (!parsed.success) return setValidationError(formatIssue(parsed.error.issues[0]));
              submitConfig({ companyProfile: parsed.data });
            }} />
          </SettingsSection>
        ) : null}

        {active === 'brand' ? (
          <SettingsSection title="Brand identity" description="Manage the logos and system mark used by admin and customer-facing surfaces." icon={<Palette size={18} />}>
            <div className="brand-settings-preview">
              <BrandMark assets={brand.assets} badge={workspaceBadge(brand.brandBadge, brand.workspaceName)} />
              <div><strong>{workspaceName(brand.workspaceName)}</strong><span>{brand.assets.logoAltText || 'Workspace brand preview'}</span></div>
            </div>
            <div className="field-row">
              <Field label="Workspace name" value={brand.workspaceName} onChange={(workspaceNameValue) => setBrand((current) => ({ ...current, workspaceName: workspaceNameValue }))} disabled={!canWrite || busy} />
              <Field label="Short badge" value={brand.brandBadge} maxLength={6} onChange={(brandBadge) => setBrand((current) => ({ ...current, brandBadge: brandBadge.toUpperCase().slice(0, 6) }))} disabled={!canWrite || busy} />
            </div>
            <BrandAssetField label="Logo for light backgrounds" hint="Usually the full-color or dark artwork used on white and pale surfaces." value={brand.assets.primaryLogoUrl} disabled={!canWrite || busy} onChange={(primaryLogoUrl) => setBrandAsset(setBrand, 'primaryLogoUrl', primaryLogoUrl)} />
            <BrandAssetField label="Logo for dark backgrounds" hint="Usually the white or light artwork used on navy, black, and dark surfaces." value={brand.assets.darkLogoUrl} disabled={!canWrite || busy} onChange={(darkLogoUrl) => setBrandAsset(setBrand, 'darkLogoUrl', darkLogoUrl)} />
            <div className="field-row">
              <BrandAssetField label="Square mark" hint="Sidebar, avatar, and compact navigation." value={brand.assets.squareLogoUrl} disabled={!canWrite || busy} onChange={(squareLogoUrl) => setBrandAsset(setBrand, 'squareLogoUrl', squareLogoUrl)} compact />
              <BrandAssetField label="Favicon" hint="Browser and compact system identity." value={brand.assets.faviconUrl} disabled={!canWrite || busy} onChange={(faviconUrl) => setBrandAsset(setBrand, 'faviconUrl', faviconUrl)} compact />
            </div>
            <div className="field-row">
              <Field label="Logo alt text" value={brand.assets.logoAltText} onChange={(logoAltText) => setBrandAsset(setBrand, 'logoAltText', logoAltText)} disabled={!canWrite || busy} />
              <div className="field-row">
                <NumberField label="Width" value={brand.assets.logoWidth} onChange={(logoWidth) => setBrandAsset(setBrand, 'logoWidth', logoWidth)} disabled={!canWrite || busy} />
                <NumberField label="Height" value={brand.assets.logoHeight} onChange={(logoHeight) => setBrandAsset(setBrand, 'logoHeight', logoHeight)} disabled={!canWrite || busy} />
              </div>
            </div>
            <div className="settings-subsection-title">System SVG mark</div>
            <p className="settings-help">Paste a self-contained SVG. Scripts, event handlers, embedded pages, and external styles are rejected.</p>
            <div className="system-svg-editor">
              <textarea rows={8} value={brand.assets.systemIconSvg} disabled={!canWrite || busy} placeholder="<svg viewBox=...>...</svg>" onChange={(event) => setBrandAsset(setBrand, 'systemIconSvg', event.target.value)} />
              <div className="system-svg-preview"><BrandMark assets={brand.assets} badge={workspaceBadge(brand.brandBadge, brand.workspaceName)} preferSvg /></div>
            </div>
            <SaveRow canWrite={canWrite} pending={saveConfig.isPending} onSave={() => {
              const parsedAssets = brandAssetsSchema.safeParse(brand.assets);
              if (!parsedAssets.success) return setValidationError(formatIssue(parsedAssets.error.issues[0]));
              submitConfig({
                workspaceName: brand.workspaceName,
                brandBadge: brand.brandBadge,
                brandLogo: parsedAssets.data.primaryLogoUrl,
                brandAssets: parsedAssets.data,
              });
            }} />
          </SettingsSection>
        ) : null}

        {active === 'profile' ? (
          <SettingsSection title="My profile" description="Your personal identity in this tenant. Role and permissions remain managed under Members." icon={<UserRound size={18} />}>
            {profileQuery.isLoading ? <StatePanel icon={<RefreshCw className="spin" size={16} />} title="Loading your profile" body="Reading your current member record." /> : null}
            {profileQuery.isError ? <StatePanel icon={<AlertTriangle size={16} />} title="Profile unavailable" body={apiErrorMessage(profileQuery.error)} action={<button type="button" className="btn" onClick={() => profileQuery.refetch()}>Retry</button>} /> : null}
            {profile ? (
              <>
                <div className="profile-settings-header">
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{`${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase()}</span>}
                  <div><strong>{profile.firstName} {profile.lastName}</strong><small>{profile.jobTitle || 'Workspace member'}</small></div>
                </div>
                <div className="field-row">
                  <Field label="First name" value={profile.firstName} onChange={(firstName) => setProfile((current) => current ? { ...current, firstName } : current)} disabled={saveProfile.isPending} />
                  <Field label="Last name" value={profile.lastName} onChange={(lastName) => setProfile((current) => current ? { ...current, lastName } : current)} disabled={saveProfile.isPending} />
                </div>
                <div className="field-row">
                  <Field label="Email" type="email" value={profile.email} onChange={(email) => setProfile((current) => current ? { ...current, email } : current)} disabled={saveProfile.isPending} />
                  <Field label="Phone" value={profile.phone ?? ''} onChange={(phone) => setProfile((current) => current ? { ...current, phone } : current)} disabled={saveProfile.isPending} />
                </div>
                <div className="field-row">
                  <Field label="Job title" value={profile.jobTitle ?? ''} onChange={(jobTitle) => setProfile((current) => current ? { ...current, jobTitle } : current)} disabled={saveProfile.isPending} />
                  <Field label="Timezone" value={profile.timezone ?? ''} onChange={(timezone) => setProfile((current) => current ? { ...current, timezone } : current)} disabled={saveProfile.isPending} />
                </div>
                <Field label="Avatar URL" value={profile.avatarUrl ?? ''} placeholder="https://" onChange={(avatarUrl) => setProfile((current) => current ? { ...current, avatarUrl } : current)} disabled={saveProfile.isPending} />
                <SaveRow canWrite pending={saveProfile.isPending} onSave={() => saveProfile.mutate()} />
              </>
            ) : null}
          </SettingsSection>
        ) : null}

        {active === 'operations' ? (
          <SettingsSection title="Operational priority" description="Tune how the tenant ranks customer follow-up work." icon={<SlidersHorizontal size={18} />}>
            <div className="settings-subsection-title">Priority weights</div>
            <div className="field-row field-row-3">
              {URGENCY_WEIGHT_FIELDS.map((field) => <NumberField key={field} label={humanize(field)} value={urgency[field]} step={field === 'waitingHoursWeight' ? 0.01 : 0.1} onChange={(value) => setUrgency((current) => ({ ...current, [field]: value }))} disabled={!canWrite || busy} />)}
            </div>
            <div className="settings-subsection-title">Intent scores</div>
            <div className="field-row field-row-3">
              {INTENT_SCORE_FIELDS.map((field) => <NumberField key={field} label={humanize(field)} value={urgency.intentScores[field] ?? 0} onChange={(value) => setUrgency((current) => ({ ...current, intentScores: { ...current.intentScores, [field]: value } }))} disabled={!canWrite || busy} />)}
            </div>
            <div className="settings-subsection-title">Resolver urgency scores</div>
            <div className="field-row field-row-3">
              {RESOLVER_URGENCY_SCORE_FIELDS.map((field) => <NumberField key={field} label={humanize(field)} value={urgency.signalUrgencyScores[field] ?? 0} onChange={(value) => setUrgency((current) => ({ ...current, signalUrgencyScores: { ...current.signalUrgencyScores, [field]: value } }))} disabled={!canWrite || busy} />)}
            </div>
            <SaveRow canWrite={canWrite} pending={saveConfig.isPending} onSave={() => submitConfig({ urgencyScoringConfig: urgency })} />
          </SettingsSection>
        ) : null}

        {active === 'access' ? <McpAccessPanel canWrite={canWrite} /> : null}
      </main>
    </div>
  );
}

function SettingsSection({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return <section className="section workspace-settings-section"><header><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></header><div className="workspace-settings-section-body">{children}</div></section>;
}

function SaveRow({ canWrite, pending, onSave }: { canWrite: boolean; pending: boolean; onSave: () => void }) {
  return <div className="workspace-form-actions"><button type="button" className="btn primary" disabled={!canWrite || pending} onClick={onSave}><Save size={14} /> {pending ? 'Saving...' : 'Save changes'}</button>{!canWrite ? <span className="hint">You need settings.write permission.</span> : null}</div>;
}

function Field({ label, value, onChange, disabled, type = 'text', placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; type?: string; placeholder?: string; maxLength?: number }) {
  return <div className="field"><label>{label}</label><input type={type} value={value} maxLength={maxLength} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function NumberField({ label, value, onChange, disabled, step = 1 }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean; step?: number }) {
  return <div className="field"><label>{label}</label><input type="number" min={0} max={2400} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function BrandAssetField({ label, hint, value, onChange, disabled, compact = false }: { label: string; hint: string; value: string; onChange: (value: string) => void; disabled: boolean; compact?: boolean }) {
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast.error('Use a PNG, JPEG, or WebP image');
    if (file.size > 4_000_000) return toast.error('Source image must be smaller than 4 MB');
    try {
      onChange(await optimizeBrandImage(file, compact ? 256 : 1000));
    } catch (error) {
      toast.error('Image could not be prepared', { description: error instanceof Error ? error.message : 'Unknown image error' });
    }
  };
  return (
    <div className={`brand-asset-field${compact ? ' compact' : ''}`}>
      <div className="brand-asset-thumb">{value ? <img src={value} alt="" /> : <ImageIcon size={18} />}</div>
      <div className="brand-asset-main">
        <strong>{label}</strong><small>{hint}</small>
        <input value={value.startsWith('data:') ? 'Uploaded image' : value} placeholder="https://" disabled={disabled || value.startsWith('data:')} onChange={(event) => onChange(event.target.value)} />
      </div>
      <label className="btn brand-upload-btn"><Upload size={13} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={upload} /></label>
      {value ? <button type="button" className="icon-btn danger" disabled={disabled} onClick={() => onChange('')} title={`Remove ${label}`}><Trash2 size={14} /></button> : null}
    </div>
  );
}

function BrandMark({ assets, badge, preferSvg = false }: { assets: BrandAssets; badge: string; preferSvg?: boolean }) {
  if ((preferSvg || !assets.squareLogoUrl) && assets.systemIconSvg) return <img src={svgDataUrl(assets.systemIconSvg)} alt={assets.logoAltText} />;
  if (assets.squareLogoUrl) return <img src={assets.squareLogoUrl} alt={assets.logoAltText} />;
  if (assets.primaryLogoUrl) return <img src={assets.primaryLogoUrl} alt={assets.logoAltText} />;
  return <span>{badge}</span>;
}

function setBrandAsset<K extends keyof BrandAssets>(setter: React.Dispatch<React.SetStateAction<BrandForm>>, key: K, value: BrandAssets[K]) {
  setter((current) => ({ ...current, assets: { ...current.assets, [key]: value } }));
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function optimizeBrandImage(file: File, maxDimension: number) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Browser image canvas is unavailable');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let result = canvas.toDataURL('image/webp', 0.88);
  if (result.length > 450_000) result = canvas.toDataURL('image/webp', 0.68);
  if (result.length > 450_000) throw new Error('Optimized image is still larger than 450 KB');
  return result;
}

function StatePanel({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="section workspace-state">{icon}<div><h3>{title}</h3><p>{body}</p>{action}</div></div>;
}

function McpAccessPanel({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<McpTokenFormState>(emptyMcpForm);
  const [created, setCreated] = useState<CreateMcpTokenResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const queryKey = ['auth', 'mcp-tokens'];
  const tokens = useQuery({ queryKey, queryFn: () => adminApi.mcpTokens(), retry: false });
  const create = useMutation({
    mutationFn: () => {
      setValidationError(null);
      const parsed = createMcpTokenSchema.safeParse({ ...form, expiresInDays: Number(form.expiresInDays) });
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Token settings are invalid';
        setValidationError(message);
        throw new Error(message);
      }
      return adminApi.createMcpToken(parsed.data);
    },
    onSuccess: async (result) => { setCreated(result); toast.success(t('settings.workspace.mcp_created')); await qc.invalidateQueries({ queryKey }); },
    onError: (error) => { if (!validationError) toast.error(t('settings.workspace.mcp_create_failed'), { description: apiErrorMessage(error) }); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => adminApi.revokeMcpToken(id),
    onSuccess: async () => { toast.success(t('settings.workspace.mcp_revoked')); await qc.invalidateQueries({ queryKey }); },
    onError: (error) => toast.error(t('settings.workspace.mcp_revoke_failed'), { description: apiErrorMessage(error) }),
  });
  const configText = created ? JSON.stringify(claudeConfig(created.token, created.tenantId), null, 2) : '';
  const activeTokens = tokens.data?.tokens.filter((token) => token.status === 'active') ?? [];

  return (
    <SettingsSection title="API access" description="Issue and revoke scoped MCP credentials for this tenant." icon={<KeyRound size={18} />}>
      <div className="mcp-token-section">
        <div className="settings-summary-row"><strong>Active tokens</strong><span className="pill info">{activeTokens.length}</span></div>
        <div className="field"><label>Token label</label><input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} disabled={!canWrite || create.isPending} /></div>
        <div className="field-row">
          <div className="field"><label>Expires in days</label><input type="number" min={1} max={365} value={form.expiresInDays} onChange={(event) => setForm((current) => ({ ...current, expiresInDays: Number(event.target.value) }))} disabled={!canWrite || create.isPending} /></div>
          <div className="mcp-scope-stack">
            <label className="mcp-check"><input type="checkbox" checked={form.canPublish} onChange={(event) => setForm((current) => ({ ...current, canPublish: event.target.checked }))} disabled={!canWrite || create.isPending} /><span><strong>Publish rules</strong><small>Create and publish tenant workflow rules.</small></span></label>
            <label className="mcp-check"><input type="checkbox" checked={form.canReadAircallTranscripts} onChange={(event) => setForm((current) => ({ ...current, canReadAircallTranscripts: event.target.checked }))} disabled={!canWrite || create.isPending} /><span><strong>Read Aircall transcripts</strong><small>List and export tenant call transcripts.</small></span></label>
          </div>
        </div>
        {validationError ? <div className="error-state">{validationError}</div> : null}
        <button type="button" className="btn primary" disabled={!canWrite || create.isPending} onClick={() => create.mutate()}><KeyRound size={13} /> {create.isPending ? 'Creating...' : 'Create access token'}</button>
        {created ? (
          <div className="mcp-token-created">
            <strong>Copy this token now. It is shown only once.</strong>
            <textarea readOnly value={created.token} rows={4} />
            <button type="button" className="btn" onClick={() => copyText(created.token, 'Token copied')}><Copy size={13} /> Copy token</button>
            <textarea readOnly value={configText} rows={12} />
            <button type="button" className="btn" onClick={() => copyText(configText, 'MCP configuration copied')}><Copy size={13} /> Copy configuration</button>
          </div>
        ) : null}
        {tokens.isLoading ? <div className="workspace-state"><RefreshCw className="spin" size={16} /> Loading tokens...</div> : null}
        {tokens.isError ? <div className="error-state">{apiErrorMessage(tokens.error)} <button type="button" className="btn" onClick={() => tokens.refetch()}>Retry</button></div> : null}
        {tokens.isSuccess && tokens.data.tokens.length === 0 ? <div className="empty-state mcp-empty"><strong>No access tokens</strong><span>Create the first scoped credential for this workspace.</span></div> : null}
        {tokens.isSuccess && tokens.data.tokens.length > 0 ? (
          <div className="mcp-token-list">{tokens.data.tokens.map((token) => (
            <div className="mcp-token-row" key={token.id}><div><strong>{token.label}</strong><span>{mcpTokenScopeLabel(token.canPublish, token.canReadAircallTranscripts)}</span><small>Expires {formatDateTime(token.expiresAt)}{token.lastFour ? ` · ...${token.lastFour}` : ''}</small></div><span className={`pill ${token.status === 'active' ? 'success' : token.status === 'revoked' ? 'danger' : 'warn'}`}>{token.status}</span><button type="button" className="btn danger-outline" disabled={!canWrite || token.status !== 'active' || revoke.isPending} onClick={() => revoke.mutate(token.id)} title="Revoke token"><Trash2 size={13} /></button></div>
          ))}</div>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function nullable(value: string | null) {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function formatIssue(issue: { path: PropertyKey[]; message: string } | undefined) {
  return issue ? `${issue.path.join('.') || 'Settings'}: ${issue.message}` : 'Settings are invalid.';
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function defaultUrgencyConfig(): UrgencyScoringConfig {
  return { ...DEFAULT_URGENCY_SCORING_CONFIG, intentScores: { ...DEFAULT_URGENCY_SCORING_CONFIG.intentScores }, signalUrgencyScores: { ...DEFAULT_URGENCY_SCORING_CONFIG.signalUrgencyScores } };
}

function claudeConfig(token: string, tenantId: string) {
  return { mcpServers: { 'factory-engine-workflow': { type: 'streamable-http', url: `${ADMIN_API_BASE_URL.replace(/\/$/, '')}/mcp/workflow`, headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId } } } };
}

function mcpTokenScopeLabel(canPublish: boolean, canReadAircallTranscripts: boolean) {
  if (canPublish && canReadAircallTranscripts) return 'Workflow publish and Aircall transcript access';
  if (canPublish) return 'Workflow publishing';
  if (canReadAircallTranscripts) return 'Aircall transcript read only';
  return 'Read only';
}

async function copyText(value: string, message: string) {
  await navigator.clipboard.writeText(value);
  toast.success(message);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
