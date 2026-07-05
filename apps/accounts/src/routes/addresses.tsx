import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Plus, Edit3, Trash2, Copy, MapPin, AlertTriangle, X, Save, Star, Building2,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Dialog, DialogTitle, DialogClose } from '@/components/Dialog';
import { ErrorState } from '@/components/QueryState';
import { apiErrorMessage } from '@/lib/api';
import {
  fetchAccountAddresses, saveAccountAddress, deleteAccountAddress,
  type AccountAddress, type AddressType,
} from '@/lib/portal';

const QK = ['addresses'] as const;

function emptyAddress(type: AddressType): AccountAddress {
  return {
    id: `addr-draft-${Date.now()}`,
    type, firstName: '', lastName: '', company: '',
    address1: '', address2: '', city: '', province: '', zip: '', country: 'US',
    phone: '', isDefault: false,
  };
}

function AddressCard({ address, onEdit, onDelete, onCopy, onSetDefault }: {
  address: AccountAddress;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onSetDefault: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article id={`address-${address.id}`} className="address-card">
      <header>
        <span className={`address-type ${address.type}`}>
          <MapPin size={11} /> {t(`addresses.${address.type}_badge`)}
        </span>
        {address.isDefault && (
          <span className="pill warn"><Star size={10} /> {t('addresses.default_badge')}</span>
        )}
      </header>
      <h3>{address.firstName} {address.lastName}</h3>
      {address.company && <div className="muted-row"><Building2 size={11} /> {address.company}</div>}
      <p className="address-lines">
        {address.address1}{address.address2 ? `, ${address.address2}` : ''}<br />
        {address.city}, {address.province} {address.zip}<br />
        {address.country}
      </p>
      <div className="muted-row">{address.phone}</div>
      <footer>
        {!address.isDefault && (
          <button type="button" className="btn ghost" onClick={onSetDefault} title={t('addresses.make_default')}>
            <Star size={12} /> {t('addresses.make_default')}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onCopy} title={t('addresses.copy')}>
          <Copy size={12} />
        </button>
        <button type="button" className="btn ghost" onClick={onEdit} title={t('addresses.edit')}>
          <Edit3 size={12} /> {t('addresses.edit')}
        </button>
        <button type="button" className="btn danger-outline" onClick={onDelete} title={t('addresses.delete')}>
          <Trash2 size={12} />
        </button>
      </footer>
    </article>
  );
}

function AddressModal({ open, draft, onClose, onSave }: {
  open: boolean;
  draft: AccountAddress;
  onClose: () => void;
  onSave: (next: AccountAddress) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AccountAddress>(draft);
  const isNew = draft.id.startsWith('addr-draft');
  const update = (patch: Partial<AccountAddress>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }} cardClassName="modal-card" labelledBy="address-modal-title">
      <header className="modal-head">
        <div>
          <DialogTitle asChild>
            <h2 id="address-modal-title">{isNew ? t('addresses.modal.create_title') : t('addresses.modal.edit_title')}</h2>
          </DialogTitle>
        </div>
        <DialogClose asChild>
          <button type="button" className="close"><X size={16} /></button>
        </DialogClose>
      </header>

      <form
        id="form-address"
        className="modal-body"
        style={{ gridTemplateColumns: '1fr' }}
        onSubmit={(event) => { event.preventDefault(); onSave(form); }}
      >
        <section className="modal-section">
          <div className="field">
            <label htmlFor="addr-type">{t('addresses.modal.field_type')}</label>
            <select id="addr-type" value={form.type} onChange={(event) => update({ type: event.target.value as AddressType })}>
              <option value="shipping">{t('addresses.shipping_badge')}</option>
              <option value="billing">{t('addresses.billing_badge')}</option>
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="addr-first">{t('addresses.modal.field_first_name')}</label>
              <input id="addr-first" value={form.firstName} onChange={(event) => update({ firstName: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="addr-last">{t('addresses.modal.field_last_name')}</label>
              <input id="addr-last" value={form.lastName} onChange={(event) => update({ lastName: event.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="addr-company">{t('addresses.modal.field_company')}</label>
            <input id="addr-company" value={form.company} onChange={(event) => update({ company: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="addr-1">{t('addresses.modal.field_address1')}</label>
            <input id="addr-1" value={form.address1} onChange={(event) => update({ address1: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="addr-2">{t('addresses.modal.field_address2')}</label>
            <input id="addr-2" value={form.address2} onChange={(event) => update({ address2: event.target.value })} />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="addr-city">{t('addresses.modal.field_city')}</label>
              <input id="addr-city" value={form.city} onChange={(event) => update({ city: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="addr-state">{t('addresses.modal.field_province')}</label>
              <input id="addr-state" value={form.province} onChange={(event) => update({ province: event.target.value })} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="addr-zip">{t('addresses.modal.field_zip')}</label>
              <input id="addr-zip" value={form.zip} onChange={(event) => update({ zip: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="addr-country">{t('addresses.modal.field_country')}</label>
              <input id="addr-country" value={form.country} onChange={(event) => update({ country: event.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="addr-phone">{t('addresses.modal.field_phone')}</label>
            <input id="addr-phone" value={form.phone} onChange={(event) => update({ phone: event.target.value })} />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(event) => update({ isDefault: event.target.checked })}
            />
            {t('addresses.modal.field_is_default')}
          </label>
        </section>
      </form>

      <footer className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          form="form-address"
          className="save-btn"
          disabled={!form.firstName.trim() || !form.address1.trim()}
        >
          <Save size={14} /> {t('addresses.modal.save')}
        </button>
      </footer>
    </Dialog>
  );
}

function AddressesView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: addresses = [], isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchAccountAddresses });

  const [tab, setTab] = useState<'all' | AddressType>('all');
  const [editing, setEditing] = useState<AccountAddress | null>(null);

  const save = useMutation({
    mutationFn: saveAccountAddress,
    onSuccess: () => { toast.success('Address saved'); qc.invalidateQueries({ queryKey: QK }); setEditing(null); },
    onError: (error) => toast.error('Save failed', { description: apiErrorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: deleteAccountAddress,
    onSuccess: () => { toast.success('Address deleted'); qc.invalidateQueries({ queryKey: QK }); },
    onError: (error) => toast.error('Delete failed', { description: apiErrorMessage(error) }),
  });

  const filtered = useMemo(() => tab === 'all' ? addresses : addresses.filter((row) => row.type === tab), [addresses, tab]);

  const shippingCount = addresses.filter((row) => row.type === 'shipping').length;
  const billingCount = addresses.filter((row) => row.type === 'billing').length;
  const defaultsCount = addresses.filter((row) => row.isDefault).length;
  const hasDefaultShipping = addresses.some((row) => row.type === 'shipping' && row.isDefault);

  return (
    <>
      <PageHeader
        titleI18nKey="addresses.title"
        subtitleI18nKey="addresses.subtitle"
        actions={(
          <button type="button" className="btn primary" onClick={() => setEditing(emptyAddress('shipping'))}>
            <Plus size={14} /> {t('addresses.add_new')}
          </button>
        )}
      />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('addresses.kpi_total')}</div><div className="val">{addresses.length}</div><div className="sub">on file</div></div>
        <div className="kpi"><div className="label">{t('addresses.kpi_shipping')}</div><div className="val">{shippingCount}</div><div className="sub">ship-to</div></div>
        <div className="kpi"><div className="label">{t('addresses.kpi_billing')}</div><div className="val">{billingCount}</div><div className="sub">bill-to</div></div>
        <div className="kpi"><div className="label">{t('addresses.kpi_defaults')}</div><div className="val">{defaultsCount}</div><div className="sub">marked default</div></div>
      </div>

      {!hasDefaultShipping && !isLoading && (
        <div className="warn-banner">
          <AlertTriangle size={14} /> {t('addresses.default_warning')}
        </div>
      )}

      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {(['all', 'shipping', 'billing'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={`tab${tab === value ? ' active' : ''}`}
            onClick={() => setTab(value)}
          >
            {t(`addresses.tab_${value}`)}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState title="Could not load addresses" error={error} retry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
          {isLoading ? t('common.loading') : t('addresses.empty_state')}
        </div>
      ) : (
        <div className="address-grid">
          {filtered.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => setEditing(address)}
              onCopy={() => {
                const copy: AccountAddress = { ...address, id: `addr-draft-${Date.now()}`, isDefault: false };
                setEditing(copy);
              }}
              onSetDefault={() => save.mutate({ ...address, isDefault: true })}
              onDelete={() => { if (confirm(t('addresses.modal.delete_confirm'))) remove.mutate(address.id); }}
            />
          ))}
          <button type="button" className="address-card address-card-add" onClick={() => setEditing(emptyAddress(tab === 'billing' ? 'billing' : 'shipping'))}>
            <Plus size={20} />
            <span>{t('addresses.add_new')}</span>
          </button>
        </div>
      )}

      {editing && (
        <AddressModal
          open
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => save.mutate(next)}
        />
      )}
    </>
  );
}

export const Route = createFileRoute('/addresses')({ component: AddressesView });
