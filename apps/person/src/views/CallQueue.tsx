import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDailyOperations, friendlyError, toggleCustomerPin, togglePin } from '../api/live';
import type { Card as CardData, DailyCallItem } from '../types';
import { Card } from '../components/Card';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';

const QK = ['person', 'daily-operations'] as const;

export function CallQueueView() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [segmentFilter, setSegmentFilter] = useState('all');
  const { data, isLoading, error } = useQuery({ queryKey: QK, queryFn: fetchDailyOperations });

  const daily = data?.dailyCallList ?? [];
  const priority = data?.priorityKanban ?? [];
  const pinned = data?.pinBoard ?? [];
  const groups = data?.segmentGroups ?? [];

  const filteredDaily = useMemo(() => {
    if (segmentFilter === 'all') return daily;
    return groups.find((group) => group.segmentId === segmentFilter)?.items ?? [];
  }, [daily, groups, segmentFilter]);

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

  const selectedCard = priority.find((card) => card.id === selectedId) ?? null;
  const summary = data?.summary;
  const empty = !isLoading && daily.length === 0 && priority.length === 0 && pinned.length === 0;

  return (
    <div className="queue-wrap">
      <div className="kpis">
        <div className="kpi"><div className="label">Daily calls</div><div className="val">{summary?.dailyCount ?? 0}</div><div className="sub">axis-scoped customers</div></div>
        <div className="kpi"><div className="label">Priority tasks</div><div className="val">{summary?.priorityCount ?? 0}</div><div className="sub">urgency desc</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{summary?.pinnedCount ?? 0}</div><div className="sub">persistent board</div></div>
        <div className="kpi"><div className="label">U80+</div><div className="val">{summary?.highUrgencyCount ?? 0}</div><div className="sub">same formula</div></div>
        <div className="kpi"><div className="label">Axes</div><div className="val">{summary?.visibleAxes.length ?? 0}</div><div className="sub">{summary?.visibleAxes.join(', ') || 'none'}</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={empty}
        emptyTitle="No axis-owned work yet"
        emptyBody="Assign a segment and customer axis ownership to make the daily operation list appear here."
      >
        <div className="ops-grid">
          <section className="ops-panel">
            <div className="ops-head">
              <div>
                <h2>Daily call list</h2>
                <p>Segment-driven customers, sorted by the urgency formula.</p>
              </div>
              <select value={segmentFilter} onChange={(event) => setSegmentFilter(event.target.value)}>
                <option value="all">All assigned segments</option>
                {groups.map((group) => (
                  <option key={group.segmentId} value={group.segmentId}>
                    {group.segmentName} ({group.items.length}/{group.dailyCap ?? group.totalCustomers})
                  </option>
                ))}
              </select>
            </div>
            <div className="ops-list">
              {filteredDaily.length === 0 ? (
                <div className="ops-empty">No customers in this segment group.</div>
              ) : filteredDaily.map((item) => (
                <DailyCustomerCard
                  key={item.id}
                  item={item}
                  onTogglePin={() => customerPin.mutate(item.customerId)}
                  disabled={customerPin.isPending}
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
              {priority.length === 0 ? (
                <div className="ops-empty">No priority tasks in your axis scope.</div>
              ) : priority.map((card) => (
                <Card key={card.id} card={card} onTogglePin={() => taskPin.mutate(card)} onOpen={setSelectedId} />
              ))}
            </div>
          </section>

          <div className="ops-panel pin-board-panel">
            <PinPanel pinned={pinned} onUnpin={(card) => taskPin.mutate(card)} />
          </div>
        </div>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function DailyCustomerCard({ item, onTogglePin, disabled }: { item: DailyCallItem; onTogglePin: () => void; disabled: boolean }) {
  return (
    <article className="daily-card">
      <div className="daily-card-row">
        <div className="daily-title">{item.customerName}</div>
        <span className="priority p7">U{item.urgencyScore}</span>
      </div>
      <div className="daily-meta">{item.reason}</div>
      <div className="daily-card-row daily-foot">
        <span className="chip" style={{ background: item.segment.color }}>{item.segment.name}</span>
        <span>{item.ordersCount} orders · ${Math.round(item.totalSpent).toLocaleString()}</span>
        <button type="button" className={`pin-btn${item.pinned ? ' pinned' : ''}`} onClick={onTogglePin} disabled={disabled}>
          {item.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </article>
  );
}
