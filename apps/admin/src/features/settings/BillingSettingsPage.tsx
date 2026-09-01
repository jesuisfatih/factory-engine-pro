import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, CheckCircle2, CreditCard, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { ReactNode } from 'react';
import type { BillingSummary } from '@factory-engine-pro/contracts';
import { adminApi, apiErrorMessage } from '@/lib/api';
import { useCurrentPrincipal } from '@/lib/current-principal';

const queryKey = ['billing', 'summary'] as const;

export function BillingSettingsPage() {
  const qc = useQueryClient();
  const principal = useCurrentPrincipal().data;
  const canWrite = new Set(principal?.permissions ?? []).has('settings.write');
  const query = useQuery({ queryKey, queryFn: () => adminApi.billingSummary(), retry: false });
  const checkout = useMutation({
    mutationFn: () => adminApi.createBillingCheckout(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error('Checkout could not be opened', { description: apiErrorMessage(error) }),
  });
  const portal = useMutation({
    mutationFn: () => adminApi.createBillingPortal(),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error('Billing portal could not be opened', { description: apiErrorMessage(error) }),
  });
  const sync = useMutation({
    mutationFn: () => adminApi.syncBillingSubscription(),
    onSuccess: async () => { toast.success('Subscription status refreshed'); await qc.invalidateQueries({ queryKey }); },
    onError: (error) => toast.error('Subscription could not be refreshed', { description: apiErrorMessage(error) }),
  });

  if (query.isLoading) return <BillingState icon={<RefreshCw className="spin" size={19} />} title="Loading billing" body="Reading this workspace subscription and Stripe readiness." />;
  if (query.isError || !query.data) return <BillingState icon={<AlertTriangle size={19} />} title="Billing unavailable" body={query.isError ? apiErrorMessage(query.error) : 'The billing response was empty.'} action={<button className="btn" onClick={() => query.refetch()}><RefreshCw size={14} /> Retry</button>} />;

  const billing = query.data;
  const busy = checkout.isPending || portal.isPending || sync.isPending;
  return (
    <div className="billing-page">
      <section className="billing-hero panel">
        <div className="billing-hero-copy">
          <span className="billing-eyebrow"><CreditCard size={15} /> Workspace subscription</span>
          <h2>{billing.plan.name}</h2>
          <p>Secure monthly billing is handled by Stripe. The listed price includes tax and there is no trial period.</p>
          <div className="billing-price"><strong>${(billing.plan.amountCents / 100).toFixed(0)}</strong><span>USD / month<br />tax included</span></div>
        </div>
        <div className="billing-hero-status">
          <span className={`billing-status ${statusTone(billing.status)}`}><span />{billing.status.replaceAll('_', ' ')}</span>
          <small>{billing.configured ? 'Stripe setup is ready for this workspace.' : 'Stripe setup details are still required.'}</small>
        </div>
      </section>

      <div className="billing-grid">
        <section className="panel billing-card">
          <header><CalendarClock size={18} /><div><h3>Subscription</h3><p>Current billing period and payment state</p></div></header>
          <BillingRow label="Plan" value={billing.plan.name} />
          <BillingRow label="Price" value={`$${(billing.plan.amountCents / 100).toFixed(2)} USD monthly`} />
          <BillingRow label="Current period ends" value={formatDate(billing.subscription.currentPeriodEnd)} />
          <BillingRow label="Last invoice" value={billing.subscription.lastInvoiceStatus ?? 'No invoice yet'} />
          <div className="billing-actions">
            {billing.checkoutAvailable ? <button className="btn primary" disabled={!canWrite || busy} onClick={() => checkout.mutate()}><CreditCard size={14} /> Activate subscription</button> : null}
            {billing.portalAvailable ? <button className="btn" disabled={!canWrite || busy} onClick={() => portal.mutate()}><ExternalLink size={14} /> Manage payment method</button> : null}
            <button className="btn ghost" disabled={!canWrite || busy} onClick={() => sync.mutate()}><RefreshCw size={14} className={sync.isPending ? 'spin' : ''} /> Refresh status</button>
          </div>
          {!canWrite ? <p className="billing-hint">You need settings.write permission to manage billing.</p> : null}
        </section>

        <section className="panel billing-card">
          <header><ShieldCheck size={18} /><div><h3>Payment protection</h3><p>Prepared access policy — currently inactive</p></div></header>
          <div className="billing-policy-banner"><CheckCircle2 size={18} /><div><strong>Enforcement is OFF</strong><span>The code is ready, but non-payment will not restrict any working panel until activation is approved.</span></div></div>
          <BillingRow label="Grace period" value={`${billing.enforcement.gracePeriodDays} days`} />
          <BillingRow label="Global switch" value={billing.enforcement.globallyEnabled ? 'Enabled' : 'Disabled'} />
          <BillingRow label="Workspace switch" value={billing.enforcement.tenantEnabled ? 'Enabled' : 'Disabled'} />
          <BillingRow label="Current access" value={billing.enforcement.accessAllowed ? 'Allowed' : 'Payment required'} />
          <p className="billing-hint">When enabled later, active subscriptions and past-due accounts inside the 7-day grace period keep access. Customer accounts are not blocked.</p>
        </section>

        <section className="panel billing-card billing-setup">
          <header><CreditCard size={18} /><div><h3>Stripe readiness</h3><p>Tenant-specific configuration checklist</p></div></header>
          <SetupRow label="Secret key" ready={billing.setup.secretKeyPresent} />
          <SetupRow label="Webhook secret" ready={billing.setup.webhookSecretPresent} />
          <SetupRow label="Monthly Price ID" ready={billing.setup.priceIdPresent} />
          <div className="billing-webhook"><span>Webhook endpoint</span><code>{billing.setup.webhookUrl}</code></div>
          <p className="billing-hint">Subscription cancellation must remain disabled in Stripe Customer Portal settings.</p>
        </section>
      </div>
    </div>
  );
}

function BillingRow({ label, value }: { label: string; value: string }) {
  return <div className="billing-row"><span>{label}</span><strong>{value}</strong></div>;
}

function SetupRow({ label, ready }: { label: string; ready: boolean }) {
  return <div className="billing-row"><span>{label}</span><strong className={ready ? 'billing-ready' : 'billing-missing'}>{ready ? 'Present' : 'Required'}</strong></div>;
}

function BillingState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="panel billing-state"><span>{icon}</span><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'Not active yet';
}

function statusTone(status: BillingSummary['status']) {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due' || status === 'incomplete') return 'warn';
  if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') return 'danger';
  return 'neutral';
}
