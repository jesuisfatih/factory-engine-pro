import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { fetchDailyOperations, fetchTaskBrief, friendlyError, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem, SegmentDailyGroup } from '../types';
import { Card } from '../components/Card';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';
import { TransferTaskModal } from '../components/TransferTaskModal';

const QK = ['person', 'daily-operations'] as const;

export function CallQueueView() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkCard, setDeepLinkCard] = useState<CardData | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [transferCard, setTransferCard] = useState<CardData | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { data, isLoading, error } = useQuery({ queryKey: QK, queryFn: fetchDailyOperations });

  const daily = data?.dailyCallList ?? [];
  const priority = data?.priorityKanban ?? [];
  const pinned = data?.pinBoard ?? [];
  const groups = data?.segmentGroups ?? [];

  const customerPin = useMutation<unknown, Error, string>({
    mutationFn: (customerId: string) => toggleCustomerPin(customerId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const taskPin = useMutation<unknown, Error, CardData>({
    mutationFn: (card: CardData) => {
      if (card.kind === 'customer' && card.customerId) return toggleCustomerPin(card.customerId);
      return togglePin(card.id);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('taskId');
    if (!taskId) return;
    let cancelled = false;
    setSelectedId(taskId);
    fetchTaskBrief(taskId)
      .then((detail) => {
        if (!cancelled) {
          setDeepLinkCard(detail.card);
          setDeepLinkError(null);
        }
      })
      .catch((taskError: unknown) => {
        if (!cancelled) setDeepLinkError(friendlyError(taskError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCard = priority.find((card) => card.id === selectedId) ?? (deepLinkCard?.id === selectedId ? deepLinkCard : null);
  const summary = data?.summary;
  const empty = !isLoading && daily.length === 0 && priority.length === 0 && pinned.length === 0;
  const closeTaskModal = () => {
    setSelectedId(null);
    setDeepLinkCard(null);
    setDeepLinkError(null);
    if (window.location.search.includes('taskId=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  return (
    <div className="queue-wrap">
      <div className="kpis">
        <div className="kpi"><div className="label">Daily calls</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">segment customers</div></div>
        <div className="kpi"><div className="label">Priority tasks</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">urgency desc</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>
        <div className="kpi"><div className="label">U80+</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">same formula</div></div>
        <div className="kpi"><div className="label">Axes</div><div className="val">{summary?.visibleAxes.length ?? 0}</div><div className="sub">{summary?.visibleAxes.join(', ') || 'none'}</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle="No segment-owned work yet"
        emptyBody="Assign live Shopify-backed segment ownership to make the daily call groups appear here."
      >
        <div className="ops-grid">
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Daily call list</h2>
                <p>Segment-driven customers, sorted by the urgency formula.</p>
              </div>
              <span className="ops-count">{groups.length} groups</span>
            </div>
            <div className="segment-groups">
              {groups.length === 0 ? (
                <div className="ops-empty">No segment groups assigned to this workspace.</div>
              ) : groups.map((group) => (
                <SegmentGroup
                  key={group.segmentId}
                  group={group}
                  collapsed={Boolean(collapsedGroups[group.segmentId])}
                  onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.segmentId]: !current[group.segmentId] }))}
                  onTogglePin={(item) => customerPin.mutate(item.customerId)}
                  pinDisabled={customerPin.isPending}
                />
              ))}
            </div>
          </section>

          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Priority kanban</h2>
                <p>Rule-engine tasks, axis-scoped and urgency-desc.</p>
              </div>
            </div>
            <div className="ops-list">
              {deepLinkError ? <div className="ops-empty">{deepLinkError}</div> : null}
              {priority.length === 0 ? (
                <div className="ops-empty">No priority tasks in your axis scope.</div>
              ) : priority.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  onTogglePin={() => taskPin.mutate(card)}
                  onOpen={setSelectedId}
                  onTransfer={setTransferCard}
                />
              ))}
            </div>
          </section>

          <div className="ops-panel pin-board-panel">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>
        </div>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} onClose={closeTaskModal} />}
      {transferCard && (
        <TransferTaskModal
          card={transferCard}
          onClose={() => setTransferCard(null)}
          onTransferred={() => {
            setTransferCard(null);
            setSelectedId(null);
            qc.invalidateQueries({ queryKey: QK });
          }}
        />
      )}
    </div>
  );
}

function SegmentGroup({
  group,
  collapsed,
  onToggle,
  onTogglePin,
  pinDisabled,
}: {
  group: SegmentDailyGroup;
  collapsed: boolean;
  onToggle: () => void;
  onTogglePin: (item: DailyCallItem) => void;
  pinDisabled: boolean;
}) {
  const cap = group.dailyCap ?? group.totalCustomers;
  return (
    <section className="segment-group" aria-label={group.segmentName}>
      <button type="button" className={`segment-group-toggle${collapsed ? ' collapsed' : ''}`} onClick={onToggle} aria-expanded={!collapsed}>
        <ChevronDown size={14} className="chevron" />
        <span className="segment-group-dot" style={{ background: group.segmentColor }} />
        <span className="segment-group-title">{group.segmentName}</span>
        <span className="segment-group-meta">{group.items.length}/{cap}</span>
      </button>
      {!collapsed && (
        <div className="segment-group-items">
          {group.items.length === 0 ? (
            <div className="segment-group-empty">No customers in this segment group.</div>
          ) : group.items.map((item) => (
            <DailyCustomerCard
              key={item.id}
              item={item}
              onTogglePin={() => onTogglePin(item)}
              disabled={pinDisabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DailyCustomerCard({ item, onTogglePin, disabled }: { item: DailyCallItem; onTogglePin: () => void; disabled: boolean }) {
  const orderSummary = `${item.ordersCount} orders | $${Math.round(item.totalSpent).toLocaleString()}`;

  return (
    <article className="daily-card">
      <div className="daily-card-row">
        <div className="daily-title">{item.customerName}</div>
        <span className="priority p7">U{item.urgencyScore}</span>
      </div>
      <div className="daily-meta">{item.reason}</div>
      <div className="daily-card-row daily-foot">
        <span className="chip" style={{ background: item.segment.color }}>{item.segment.name}</span>
        <span>{orderSummary}</span>
        <button type="button" className={`pin-btn${item.pinned ? ' pinned' : ''}`} onClick={onTogglePin} disabled={disabled}>
          {item.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </article>
  );
}
