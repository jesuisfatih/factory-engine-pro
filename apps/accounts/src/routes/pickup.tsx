import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronUp, CheckCircle2, Circle, FileImage, ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { fetchPickups, type PickupOrder } from '@/lib/portal';

const QK = ['pickup'] as const;

const STATUS_TONE: Record<PickupOrder['status'], string> = {
  in_production: 'warn', ready_for_pickup: 'success', picked_up: '',
};

function PickupCard({ order, expanded, onToggle }: { order: PickupOrder; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const doneSteps = order.steps.filter((step) => step.done).length;
  const progressPct = (doneSteps / order.steps.length) * 100;

  return (
    <div className={`pickup-card${expanded ? ' expanded' : ''}`}>
      <button type="button" className="pickup-card-head" onClick={onToggle} aria-expanded={expanded}>
        <div>
          <div className="name">{order.orderNumber}</div>
          <div className="muted">{order.placedAt}</div>
        </div>
        <div className="pickup-card-meta">
          {order.shelfCode && (
            <span className="pill accent">{t('pickup.shelf')} {order.shelfCode}</span>
          )}
          <span className={`pill ${STATUS_TONE[order.status]}`}>{t(`pickup.status.${order.status}`)}</span>
          <div className="pickup-progress">
            <div className="pickup-progress-bar"><div style={{ width: `${progressPct}%` }} /></div>
            <span className="muted">{t('pickup.progress_step_of', { current: doneSteps, total: order.steps.length })}</span>
          </div>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {expanded && (
        <div className="pickup-card-body">
          <ol className="pickup-timeline">
            {order.steps.map((step) => (
              <li key={step.key} className={step.done ? 'done' : 'pending'}>
                {step.done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                <div>
                  <div className="name">{step.label}</div>
                  <div className="muted">{step.at ?? '-'}</div>
                </div>
              </li>
            ))}
          </ol>

          {order.shelfCode && (
            <div className="pickup-shelf">
              <div className="muted">{t('pickup.shelf')}</div>
              <div className="shelf-code">{order.shelfCode}</div>
            </div>
          )}

          <div className="pickup-qr">
            <div className="muted">{t('pickup.qr_label')}</div>
            <div className="qr-payload">{order.qrPayload}</div>
          </div>

          <div className="pickup-files">
            <div className="muted">{t('pickup.files')}</div>
            <ul>
              {order.designFiles.map((file) => (
                <li key={file.id}>
                  <FileImage size={11} /> {file.name}
                  {file.previewUrl ? (
                    <a href={file.previewUrl} target="_blank" rel="noopener noreferrer" title="Open design preview">
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="muted">Preview unavailable</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function PickupView() {
  const { t } = useTranslation();
  const { data: orders = [], isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchPickups });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const active = orders.filter((order) => order.status !== 'picked_up');
  const completed = orders.filter((order) => order.status === 'picked_up');

  const toggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <>
      <PageHeader titleI18nKey="pickup.title" subtitleI18nKey="pickup.subtitle" />

      <div className="section" style={{ marginBottom: 14, padding: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          {t('pickup.active_count')}
          <span className="pill accent">{active.length}</span>
        </h3>
      </div>

      {isError ? (
        <ErrorState title="Could not load pickup orders" error={error} retry={() => refetch()} />
      ) : active.length === 0 ? (
        <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
          {isLoading ? t('common.loading') : t('pickup.empty_active')}
        </div>
      ) : (
        <div className="pickup-list">
          {active.map((order) => (
            <PickupCard key={order.id} order={order} expanded={expanded.has(order.id)} onToggle={() => toggle(order.id)} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <>
          <h3 style={{ marginTop: 22, marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>{t('pickup.completed_label')}</h3>
          <div className="data-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('pickup.completed_table.order')}</th>
                  <th>{t('pickup.completed_table.status')}</th>
                  <th>{t('pickup.completed_table.shelf')}</th>
                  <th>{t('pickup.completed_table.picked_at')}</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((order) => (
                  <tr key={order.id}>
                    <td><strong>{order.orderNumber}</strong></td>
                    <td><span className="pill">{t(`pickup.status.${order.status}`)}</span></td>
                    <td>{order.shelfCode ?? '-'}</td>
                    <td className="muted">{order.pickupBy ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export const Route = createFileRoute('/pickup')({ component: PickupView });
