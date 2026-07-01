import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, X } from 'lucide-react';
import { fetchTransferTargets, friendlyError, transferTask } from '../api/live';
import type { Card as CardData, TransferTaskResult } from '../types';
import { focusLabel, personSafeText } from '../lib/personTerminology';

type TransferAxis = 'sales' | 'account';

interface Props {
  card: CardData;
  onClose: () => void;
  onTransferred: (result: TransferTaskResult) => void;
}

export function TransferTaskModal({ card, onClose, onTransferred }: Props) {
  const [targetMemberId, setTargetMemberId] = useState('');
  const [targetAxis, setTargetAxis] = useState<TransferAxis>(isTransferAxis(card.axis) ? card.axis : 'sales');
  const [reason, setReason] = useState('');
  const { data: targets = [], isLoading, error } = useQuery({
    queryKey: ['person', 'transfer-targets'],
    queryFn: fetchTransferTargets,
  });

  const selectedTarget = useMemo(
    () => targets.find((target) => target.id === targetMemberId) ?? null,
    [targets, targetMemberId],
  );

  useEffect(() => {
    if (!targetMemberId && targets[0]) setTargetMemberId(targets[0].id);
  }, [targetMemberId, targets]);

  useEffect(() => {
    if (!selectedTarget) return;
    if (!selectedTarget.axes.includes(targetAxis)) setTargetAxis(selectedTarget.axes[0] ?? 'sales');
  }, [selectedTarget, targetAxis]);

  const mutation = useMutation({
    mutationFn: () => transferTask(card.id, { targetMemberId, targetAxis, reason: reason.trim() || undefined }),
    onSuccess: (result) => onTransferred(result),
  });

  const canSubmit = Boolean(targetMemberId && selectedTarget?.axes.includes(targetAxis));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="transfer-task-title" onMouseDown={onClose}>
      <form
        className="modal-card transfer-modal"
        role="document"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) mutation.mutate();
        }}
      >
        <header className="modal-head">
          <div>
            <h2 id="transfer-task-title">Transfer follow-up</h2>
            <div className="sub">
              <span>{personSafeText(card.title)}</span>
              <span>{focusLabel(card.axis)}</span>
              <span>{card.assignedMemberName ?? 'unassigned'}</span>
            </div>
          </div>
          <button type="button" className="close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="modal-body transfer-body">
          <section className="transfer-summary">
            <div className="transfer-row">
              <span>Current owner</span>
              <strong>{card.assignedMemberName ?? 'Unassigned'}</strong>
            </div>
            <div className="transfer-row">
              <span>Current focus</span>
              <strong>{focusLabel(card.axis)}</strong>
            </div>
            <div className="transfer-row">
              <span>Customer</span>
              <strong>{card.customerId ? personSafeText(card.title) : 'No linked customer'}</strong>
            </div>
          </section>

          <section className="transfer-form">
            {isLoading ? (
              <div className="state-panel">Loading transfer targets...</div>
            ) : error ? (
              <div className="state-panel error">{friendlyError(error)}</div>
            ) : targets.length === 0 ? (
              <div className="state-panel empty">
                <strong>No transfer targets</strong>
                <span>Active teammates with task assignment permissions will appear here.</span>
              </div>
            ) : (
              <>
                <label className="field">
                  <span>Target teammate</span>
                  <select value={targetMemberId} onChange={(event) => setTargetMemberId(event.target.value)}>
                    {targets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name} - {target.email}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field">
                  <span>Follow-up focus</span>
                  <div className="axis-options">
                    {(selectedTarget?.axes ?? []).map((axis) => (
                      <button
                        key={axis}
                        type="button"
                        className={axis === targetAxis ? 'active' : ''}
                        onClick={() => setTargetAxis(axis)}
                      >
                        {focusLabel(axis)}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field">
                  <span>Reason</span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                    placeholder="Why is this task moving?"
                    rows={4}
                  />
                </label>
              </>
            )}
          </section>
        </div>

        <footer className="modal-foot">
          {mutation.isError ? <span className="transfer-error">{friendlyError(mutation.error)}</span> : null}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!canSubmit || mutation.isPending || isLoading || Boolean(error) || targets.length === 0}>
            <ArrowRightLeft size={13} /> {mutation.isPending ? 'Transferring...' : 'Transfer'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function isTransferAxis(value: unknown): value is TransferAxis {
  return value === 'sales' || value === 'account';
}
