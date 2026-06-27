import { Fragment, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { fetchCards, friendlyError, moveCard, togglePin } from '../api/live';
import { COLUMNS, type Card as CardData, type ColumnId } from '../types';
import { Card } from '../components/Card';
import { Column } from '../components/Column';
import { PinPanel } from '../components/PinPanel';
import { QueryState } from '../components/QueryState';
import { TaskBriefModal } from '../components/TaskBriefModal';

const QK = ['person', 'cards'] as const;

function groupByColumn(cards: CardData[]) {
  const groups: Record<ColumnId, CardData[]> = {
    unassigned: [],
    in_progress: [],
    positive: [],
    closed: [],
  };
  for (const card of cards) groups[card.columnId].push(card);
  return groups;
}

export function CallQueueView() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: cards = [], isLoading, error } = useQuery({ queryKey: QK, queryFn: fetchCards });

  const move = useMutation({
    mutationFn: moveCard,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<CardData[]>(QK) ?? [];
      const item = prev.find((card) => card.id === vars.id);
      if (!item) return { prev };
      const without = prev.filter((card) => card.id !== vars.id);
      const targetCol = without.filter((card) => card.columnId === vars.columnId);
      const others = without.filter((card) => card.columnId !== vars.columnId);
      const insertAt = Math.max(0, Math.min(vars.index, targetCol.length));
      targetCol.splice(insertAt, 0, { ...item, columnId: vars.columnId });
      qc.setQueryData<CardData[]>(QK, others.concat(targetCol));
      return { prev };
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const pin = useMutation({
    mutationFn: togglePin,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<CardData[]>(QK) ?? [];
      qc.setQueryData<CardData[]>(QK, prev.map((card) =>
        card.id === id ? { ...card, pinned: !card.pinned, pinnedAt: !card.pinned ? Date.now() : null } : card,
      ));
      return { prev };
    },
    onError: (_error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 120, tolerance: 6 } }));
  const groups = useMemo(() => groupByColumn(cards), [cards]);
  const pinned = useMemo(
    () => [...cards.filter((card) => card.pinned)].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [cards],
  );
  const activeCard = cards.find((card) => card.id === activeId) ?? null;
  const selectedCard = cards.find((card) => card.id === selectedId) ?? null;
  const overdue = cards.filter((card) => card.priority >= 9).length;
  const aiCount = cards.filter((card) => card.source !== 'manual').length;

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeCard = cards.find((card) => card.id === activeIdStr);
    if (!activeCard) return;

    const overColumn = COLUMNS.find((column) => column.id === overIdStr)?.id || null;
    let targetCol: ColumnId | null = overColumn;
    let targetIndex = 0;
    if (!targetCol) {
      const overCard = cards.find((card) => card.id === overIdStr);
      if (!overCard) return;
      targetCol = overCard.columnId;
      const arr = groups[targetCol];
      const overIndex = arr.findIndex((card) => card.id === overCard.id);
      const activeIndex = arr.findIndex((card) => card.id === activeCard.id);
      if (activeCard.columnId === targetCol && activeIndex !== -1 && overIndex !== -1) {
        const reordered = arrayMove(arr, activeIndex, overIndex);
        const others = cards.filter((card) => card.columnId !== targetCol);
        qc.setQueryData<CardData[]>(QK, others.concat(reordered));
        move.mutate({ id: activeIdStr, columnId: targetCol, index: overIndex });
        return;
      }
      targetIndex = overIndex >= 0 ? overIndex : arr.length;
    } else {
      targetIndex = groups[targetCol].length;
    }
    if (activeCard.columnId !== targetCol) move.mutate({ id: activeIdStr, columnId: targetCol, index: targetIndex });
  };

  return (
    <div className="queue-wrap">
      <div className="kpis">
        <div className="kpi"><div className="label">Customers</div><div className="val">{cards.length}</div><div className="sub">in your queue</div></div>
        <div className="kpi"><div className="label">Overdue</div><div className="val">{overdue}</div><div className="sub">P9 priority</div></div>
        <div className="kpi"><div className="label">AI-tasked</div><div className="val">{aiCount}</div><div className="sub">click to open brief</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{pinned.length}</div><div className="sub">on board</div></div>
        <div className="kpi"><div className="label">Status</div><div className="val">{isLoading ? '...' : 'Live'}</div><div className="sub">API bound</div></div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={cards.length === 0}
        emptyTitle="No queue cards"
        emptyBody="Create or assign a service request to start the support kanban."
      >
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <Group id="callqueue-layout" orientation="horizontal" className="queue-panels">
            {COLUMNS.map((column) => (
              <Fragment key={column.id}>
                <Panel id={`col-${column.id}`} defaultSize={18} minSize={10} maxSize={50} className="queue-panel">
                  <Column column={column} cards={groups[column.id]} onTogglePin={pin.mutate} onOpen={setSelectedId} />
                </Panel>
                <Separator className="resize-handle" />
              </Fragment>
            ))}
            <Panel id="pinned-rail" defaultSize={20} minSize={12} maxSize={40} className="queue-panel">
              <PinPanel pinned={pinned} onUnpin={pin.mutate} />
            </Panel>
          </Group>

          <DragOverlay>
            {activeCard ? <Card card={activeCard} onTogglePin={() => undefined} /> : null}
          </DragOverlay>
        </DndContext>
      </QueryState>

      {selectedCard && <TaskBriefModal card={selectedCard} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
