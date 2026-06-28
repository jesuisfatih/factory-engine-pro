import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Mail, PlayCircle, RefreshCw, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { MailMarketingOverviewResponse, SaveEmailTemplateInput, SaveMailAudienceInput, SaveMailFlowInput } from '@factory-engine-pro/contracts';
import { PageHeader } from '@/components/PageHeader';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCan } from '@/lib/permissions';

type Tab = 'overview' | 'contacts' | 'templates' | 'audiences' | 'flows' | 'settings';

interface MailContact {
  id: string;
  customerId: string | null;
  email: string;
  name: string | null;
  tags: string[];
  isSendable: boolean;
  lastActivityAt: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  eventKey: string;
  templateType: 'transactional' | 'marketing';
  subject: string;
  status: string;
  versionCount: number;
  updatedAt: string;
}

interface MailAudience {
  id: string;
  name: string;
  contactCount: number;
  isArchived: boolean;
  updatedAt: string;
}

interface MailFlow {
  id: string;
  name: string;
  triggerType: string;
  status: string;
  sendingEnabled: false;
  updatedAt: string;
}

const QK = {
  overview: ['mail-marketing', 'overview'] as const,
  contacts: ['mail-marketing', 'contacts'] as const,
  templates: ['mail-marketing', 'templates'] as const,
  audiences: ['mail-marketing', 'audiences'] as const,
  flows: ['mail-marketing', 'flows'] as const,
  bootstrap: ['mail-marketing', 'bootstrap'] as const,
};

export function MailMarketingPage() {
  const qc = useQueryClient();
  const canWrite = useCan('settings.write');
  const [tab, setTab] = useState<Tab>('overview');

  const overview = useQuery({
    queryKey: QK.overview,
    queryFn: () => adminApi.mailMarketingOverview() as Promise<MailMarketingOverviewResponse>,
    retry: false,
  });
  const contacts = useQuery({
    queryKey: QK.contacts,
    queryFn: () => adminApi.mailMarketingContacts({ limit: 75 }) as Promise<MailContact[]>,
    retry: false,
  });
  const templates = useQuery({
    queryKey: QK.templates,
    queryFn: () => adminApi.mailMarketingTemplates({ limit: 100 }) as Promise<EmailTemplate[]>,
    retry: false,
  });
  const audiences = useQuery({
    queryKey: QK.audiences,
    queryFn: () => adminApi.mailMarketingAudiences() as Promise<MailAudience[]>,
    retry: false,
  });
  const flows = useQuery({
    queryKey: QK.flows,
    queryFn: () => adminApi.mailMarketingFlows() as Promise<MailFlow[]>,
    retry: false,
  });
  const bootstrap = useQuery({
    queryKey: QK.bootstrap,
    queryFn: () => adminApi.mailMarketingSettingsBootstrap() as Promise<{ settings: Record<string, unknown>; triggerTypes: string[]; nodeTypes: string[] }>,
    retry: false,
  });

  const refresh = () => {
    [overview, contacts, templates, audiences, flows, bootstrap].forEach((query) => query.refetch());
  };

  const createTemplate = useMutation({
    mutationFn: () => {
      const input: SaveEmailTemplateInput = {
        name: 'Workflow Follow-up',
        eventKey: 'workflow.send_mail.disabled',
        templateType: 'marketing',
        folderKey: 'workflow',
        subject: 'Follow-up for {{customer.name}}',
        html: '<p>Hello {{customer.name}},</p><p>Our team will follow up with you shortly.</p>',
        text: 'Hello {{customer.name}}, our team will follow up with you shortly.',
        variables: ['customer.name'],
        metadata: { source: 'admin_mail_marketing_cta' },
      };
      return adminApi.createMailMarketingTemplate(input);
    },
    onSuccess: async () => {
      toast.success('Template created');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.templates }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Template create failed', { description: apiErrorMessage(error) }),
  });

  const createAudience = useMutation({
    mutationFn: () => {
      const input: SaveMailAudienceInput = {
        name: 'Sendable Customers',
        filters: { matchMode: 'all', conditions: [{ field: 'isSendable', operator: 'eq', value: true }], segmentIds: [] },
        isArchived: false,
      };
      return adminApi.createMailMarketingAudience(input);
    },
    onSuccess: async () => {
      toast.success('Audience created');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.audiences }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Audience create failed', { description: apiErrorMessage(error) }),
  });

  const createFlow = useMutation({
    mutationFn: () => {
      const input: SaveMailFlowInput = {
        name: 'Segment Enter Follow-up',
        triggerType: 'segment_enter',
        status: 'draft',
        graph: {
          nodes: [
            { id: 'trigger', type: 'trigger', triggerType: 'segment_enter' },
            { id: 'send', type: 'send_email', disabled: true, reason: 'mail_marketing_delivery_disabled' },
          ],
          edges: [{ id: 'trigger-send', source: 'trigger', target: 'send' }],
        },
        metadata: { source: 'admin_mail_marketing_cta' },
      };
      return adminApi.createMailMarketingFlow(input);
    },
    onSuccess: async () => {
      toast.success('Draft flow created');
      await Promise.all([qc.invalidateQueries({ queryKey: QK.flows }), qc.invalidateQueries({ queryKey: QK.overview })]);
    },
    onError: (error) => toast.error('Flow create failed', { description: apiErrorMessage(error) }),
  });

  const counts = overview.data?.counts;
  const hasError = overview.isError || contacts.isError || templates.isError || audiences.isError || flows.isError || bootstrap.isError;

  return (
    <>
      <PageHeader
        titleI18nKey="mail_marketing.title"
        subtitleI18nKey="mail_marketing.subtitle"
        actions={<button className="btn" type="button" onClick={refresh}><RefreshCw size={14} /> Refresh</button>}
      />

      <div className="sr-kpi-row">
        <Kpi label="Contacts" value={counts?.contacts ?? 0} tone="" icon={<Users size={15} />} />
        <Kpi label="Sendable" value={counts?.sendableContacts ?? 0} tone="success" icon={<Send size={15} />} />
        <Kpi label="Templates" value={counts?.templates ?? 0} tone="info" icon={<FileText size={15} />} />
        <Kpi label="Flows" value={counts?.flows ?? 0} tone="warn" icon={<PlayCircle size={15} />} />
      </div>

      {overview.data && (
        <div className="section" style={{ marginBottom: 16 }}>
          <h3>
            <span>Delivery mode</span>
            <span className="pill warn">Disabled</span>
          </h3>
          <div className="muted">{overview.data.provider.message}</div>
        </div>
      )}

      <div className="orders-toolbar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {(['overview', 'contacts', 'templates', 'audiences', 'flows', 'settings'] as Tab[]).map((entry) => (
          <button key={entry} type="button" className={`btn ${tab === entry ? 'primary' : ''}`} onClick={() => setTab(entry)}>
            {label(entry)}
          </button>
        ))}
      </div>

      {hasError && (
        <StateBlock
          title="Mail Marketing data could not load"
          body={[overview.error, contacts.error, templates.error, audiences.error, flows.error, bootstrap.error].filter(Boolean).map(apiErrorMessage)[0] ?? 'Request failed'}
          action={<button className="btn" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button>}
        />
      )}

      {!hasError && tab === 'overview' && (
        <OverviewPanel
          loading={overview.isLoading}
          overview={overview.data}
          canWrite={canWrite}
          onCreateTemplate={() => createTemplate.mutate()}
          onCreateAudience={() => createAudience.mutate()}
          onCreateFlow={() => createFlow.mutate()}
          creating={createTemplate.isPending || createAudience.isPending || createFlow.isPending}
        />
      )}
      {!hasError && tab === 'contacts' && <ContactsPanel loading={contacts.isLoading} rows={contacts.data ?? []} />}
      {!hasError && tab === 'templates' && (
        <TemplatesPanel loading={templates.isLoading} rows={templates.data ?? []} canWrite={canWrite} onCreate={() => createTemplate.mutate()} creating={createTemplate.isPending} />
      )}
      {!hasError && tab === 'audiences' && (
        <AudiencesPanel loading={audiences.isLoading} rows={audiences.data ?? []} canWrite={canWrite} onCreate={() => createAudience.mutate()} creating={createAudience.isPending} />
      )}
      {!hasError && tab === 'flows' && (
        <FlowsPanel loading={flows.isLoading} rows={flows.data ?? []} canWrite={canWrite} onCreate={() => createFlow.mutate()} creating={createFlow.isPending} />
      )}
      {!hasError && tab === 'settings' && <SettingsPanel loading={bootstrap.isLoading} data={bootstrap.data} />}
    </>
  );
}

function OverviewPanel({
  loading,
  overview,
  canWrite,
  onCreateTemplate,
  onCreateAudience,
  onCreateFlow,
  creating,
}: {
  loading: boolean;
  overview?: MailMarketingOverviewResponse;
  canWrite: boolean;
  onCreateTemplate: () => void;
  onCreateAudience: () => void;
  onCreateFlow: () => void;
  creating: boolean;
}) {
  if (loading) return <StateBlock title="Loading Mail Marketing" body="Reading live tenant mail state." />;
  if (!overview) return null;
  const empty = overview.counts.templates === 0 && overview.counts.audiences === 0 && overview.counts.flows === 0;
  if (empty) {
    return (
      <StateBlock
        title="No marketing assets yet"
        body="Create the first live template, audience, and disabled workflow flow from tenant data."
        action={canWrite ? (
          <div className="orders-toolbar" style={{ justifyContent: 'center' }}>
            <button className="btn primary" type="button" disabled={creating} onClick={onCreateTemplate}><FileText size={14} /> Template</button>
            <button className="btn" type="button" disabled={creating} onClick={onCreateAudience}><Users size={14} /> Audience</button>
            <button className="btn" type="button" disabled={creating} onClick={onCreateFlow}><PlayCircle size={14} /> Flow</button>
          </div>
        ) : undefined}
      />
    );
  }
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, .7fr)' }}>
      <section className="section">
        <h3>Recent mail events</h3>
        {overview.recentEvents.length === 0 ? (
          <StateBlock title="No events recorded" body="Mail Marketing events will appear here after audiences or flows are changed." />
        ) : (
          <div className="data-card">
            <table className="data-table">
              <thead><tr><th>Event</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {overview.recentEvents.map((event) => (
                  <tr key={event.id}><td>{event.eventType}</td><td><span className="pill info">{event.status}</span></td><td className="muted">{fmtDate(event.createdAt)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="section">
        <h3>Quick create</h3>
        <div className="row-stack">
          <button className="btn" type="button" disabled={!canWrite || creating} onClick={onCreateTemplate}><FileText size={14} /> Workflow template</button>
          <button className="btn" type="button" disabled={!canWrite || creating} onClick={onCreateAudience}><Users size={14} /> Sendable audience</button>
          <button className="btn" type="button" disabled={!canWrite || creating} onClick={onCreateFlow}><PlayCircle size={14} /> Segment flow</button>
        </div>
      </section>
    </div>
  );
}

function ContactsPanel({ loading, rows }: { loading: boolean; rows: MailContact[] }) {
  if (loading) return <StateBlock title="Loading contacts" body="Importing live customer emails into mail contacts." />;
  if (rows.length === 0) return <StateBlock title="No contacts" body="No customer email addresses are available for this tenant yet." />;
  return (
    <Table headers={['Contact', 'Tags', 'Sendable', 'Last activity']}>
      {rows.map((row) => (
        <tr key={row.id}>
          <td><div className="name">{row.name ?? row.email}</div><div className="muted">{row.email}</div></td>
          <td>{row.tags.slice(0, 3).join(', ') || '-'}</td>
          <td><span className={`pill ${row.isSendable ? 'success' : 'warn'}`}>{row.isSendable ? 'Yes' : 'No'}</span></td>
          <td className="muted">{fmtDate(row.lastActivityAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

function TemplatesPanel({ loading, rows, canWrite, onCreate, creating }: { loading: boolean; rows: EmailTemplate[]; canWrite: boolean; onCreate: () => void; creating: boolean }) {
  if (loading) return <StateBlock title="Loading templates" body="Reading live email template workspace." />;
  if (rows.length === 0) return <StateBlock title="No templates" body="Create the first workflow template." action={canWrite ? <button className="btn primary" disabled={creating} onClick={onCreate}><FileText size={14} /> Create template</button> : undefined} />;
  return (
    <Table headers={['Template', 'Event', 'Status', 'Versions', 'Updated']}>
      {rows.map((row) => (
        <tr key={row.id}>
          <td><div className="name">{row.name}</div><div className="muted">{row.subject}</div></td>
          <td>{row.eventKey}</td>
          <td><span className={`pill ${row.status === 'published' ? 'success' : 'warn'}`}>{row.status}</span></td>
          <td>{row.versionCount}</td>
          <td className="muted">{fmtDate(row.updatedAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

function AudiencesPanel({ loading, rows, canWrite, onCreate, creating }: { loading: boolean; rows: MailAudience[]; canWrite: boolean; onCreate: () => void; creating: boolean }) {
  if (loading) return <StateBlock title="Loading audiences" body="Reading live audience definitions." />;
  if (rows.length === 0) return <StateBlock title="No audiences" body="Create an audience from sendable tenant contacts." action={canWrite ? <button className="btn primary" disabled={creating} onClick={onCreate}><Users size={14} /> Create audience</button> : undefined} />;
  return (
    <Table headers={['Audience', 'Contacts', 'Status', 'Updated']}>
      {rows.map((row) => (
        <tr key={row.id}>
          <td><div className="name">{row.name}</div><div className="muted">{row.id}</div></td>
          <td>{row.contactCount}</td>
          <td><span className={`pill ${row.isArchived ? 'warn' : 'success'}`}>{row.isArchived ? 'Archived' : 'Active'}</span></td>
          <td className="muted">{fmtDate(row.updatedAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

function FlowsPanel({ loading, rows, canWrite, onCreate, creating }: { loading: boolean; rows: MailFlow[]; canWrite: boolean; onCreate: () => void; creating: boolean }) {
  if (loading) return <StateBlock title="Loading flows" body="Reading live Mail Marketing flows." />;
  if (rows.length === 0) return <StateBlock title="No flows" body="Create a disabled draft flow connected to segment events." action={canWrite ? <button className="btn primary" disabled={creating} onClick={onCreate}><PlayCircle size={14} /> Create flow</button> : undefined} />;
  return (
    <Table headers={['Flow', 'Trigger', 'Status', 'Delivery', 'Updated']}>
      {rows.map((row) => (
        <tr key={row.id}>
          <td><div className="name">{row.name}</div><div className="muted">{row.id}</div></td>
          <td>{row.triggerType}</td>
          <td><span className={`pill ${row.status === 'published' ? 'success' : 'warn'}`}>{row.status}</span></td>
          <td><span className="pill warn">Disabled</span></td>
          <td className="muted">{fmtDate(row.updatedAt)}</td>
        </tr>
      ))}
    </Table>
  );
}

function SettingsPanel({ loading, data }: { loading: boolean; data?: { settings: Record<string, unknown>; triggerTypes: string[]; nodeTypes: string[] } }) {
  if (loading) return <StateBlock title="Loading settings" body="Reading Mail Marketing settings." />;
  if (!data) return null;
  return (
    <div className="two-col" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
      <section className="section">
        <h3>Settings</h3>
        <DetailLine label="Sending enabled" value="false" />
        <DetailLine label="Provider mode" value={String(data.settings.providerMode ?? 'disabled')} />
        <DetailLine label="Daily cap" value={String(data.settings.dailySendCap ?? 0)} />
      </section>
      <section className="section">
        <h3>Catalog</h3>
        <DetailLine label="Triggers" value={data.triggerTypes.join(', ')} />
        <DetailLine label="Nodes" value={data.nodeTypes.join(', ')} />
      </section>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: ReactNode }) {
  return (
    <div className={`sr-kpi ${tone}`}>
      <div className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon}{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="data-card">
      <table className="data-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function StateBlock({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="pricing-list-empty">
      <AlertTriangle size={18} />
      <div className="name" style={{ marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ marginBottom: action ? 14 : 0 }}>{body}</div>
      {action}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, marginBottom: 10 }}>
      <span className="muted">{label}</span>
      <strong style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

function label(tab: Tab) {
  return tab.replace('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function fmtDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}
