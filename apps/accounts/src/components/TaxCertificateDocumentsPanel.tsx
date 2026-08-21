import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, FileUp, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api';
import { fetchProfile, submitTaxExemptionRenewal } from '@/lib/portal';

function fmtDate(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function TaxCertificateDocumentsPanel() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: fetchProfile });
  const [expiresAt, setExpiresAt] = useState('');
  const [certificate, setCertificate] = useState<File | null>(null);
  const renewal = useMutation({
    mutationFn: () => {
      if (!certificate || !expiresAt) throw new Error('Select the certificate file and expiration date.');
      return submitTaxExemptionRenewal(expiresAt, certificate);
    },
    onSuccess: async () => {
      toast.success('Certificate submitted for review');
      setExpiresAt('');
      setCertificate(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['profile'] }),
        qc.invalidateQueries({ queryKey: ['home', 'profile'] }),
        qc.invalidateQueries({ queryKey: ['documents'] }),
      ]);
    },
    onError: (error) => toast.error('Certificate submission failed', { description: apiErrorMessage(error) }),
  });
  const current = profile.data;

  return <section className="section tax-renewal-section documents-tax-panel" aria-labelledby="documents-tax-title">
    <div className="tax-renewal-heading">
      <div><span>Account document</span><h3 id="documents-tax-title">Tax exemption certificate</h3><p>Replace an expiring certificate here. The new file is sent to the Eagle team for approval, so no email is required.</p></div>
      <span className={`pill ${current?.taxExemption?.purchasingRestricted ? 'danger' : current?.taxExemption ? 'success' : 'info'}`}>
        {profile.isLoading ? 'Loading' : current?.taxExemption?.purchasingRestricted ? 'Purchasing paused' : current?.taxExemption ? current.taxExemption.status : 'Not on file'}
      </span>
    </div>
    {current?.taxExemption ? <div className={`tax-certificate-status${current.taxExemption.purchasingRestricted ? ' restricted' : ''}`}><CalendarClock size={18} /><div><strong>Current certificate expires {fmtDate(current.taxExemption.expiresAt)}</strong><span>{current.taxExemption.warningMessage ?? `${Math.max(0, current.taxExemption.daysRemaining)} days remain before renewal is required.`}</span></div></div> : null}
    {current?.taxExemptionRenewal ? <div className="tax-renewal-pending"><ShieldCheck size={18} /><div><strong>Replacement certificate is awaiting review</strong><span>Submitted {fmtDate(current.taxExemptionRenewal.submittedAt)} for expiration {fmtDate(current.taxExemptionRenewal.expiresAt)}.</span></div></div> : <div className="tax-renewal-form">
      <div className="field-row"><div className="field"><label htmlFor="documents-tax-expiration">Certificate expiration date</label><input id="documents-tax-expiration" type="date" min={tomorrowDate()} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div><div className="field"><label htmlFor="documents-tax-file">Replacement certificate</label><input id="documents-tax-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setCertificate(event.target.files?.[0] ?? null)} /><small>PDF, JPEG, PNG or WebP, up to 10 MB.</small></div></div>
      <div className="tax-renewal-action"><span>Approval updates this account and its connected Shopify tax status.</span><button type="button" className="save-btn" disabled={!certificate || !expiresAt || renewal.isPending} onClick={() => renewal.mutate()}><FileUp size={14} /> {renewal.isPending ? 'Submitting...' : 'Submit replacement'}</button></div>
    </div>}
  </section>;
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}
