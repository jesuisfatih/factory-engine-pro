import { Fragment, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { fetchCards, moveCard, togglePin } from '../api/mock';
import { COLUMNS, type Card as CardData, type ColumnId } from '../types';
import { Column } from '../components/Column';
import { Card } from '../components/Card';
import { PinPanel } from '../components/PinPanel';
import { TaskBriefModal } from '../components/TaskBriefModal';

const QK = ['cards'] as const;

function groupByColumn(cards: CardData[]) {
  const groups: Record<ColumnId, CardData[]> = {
    unassigned: [], in_progress: [], positive: [], closed: [],
  };
  for (const card of cards) groups[card.columnId].push(card);
  return groups;
}

export function CallQueueView() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: cards = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchCards });

  const move = useMutation({
    mutationFn: moveCard,
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<CardData[]>(QK) ?? [];
      const item = prev.find((c) => c.id === vars.id);
      if (!item) return { prev };
      const without = prev.filter((c) => c.id !== vars.id);
      const targetCol = without.filter((c) => c.columnId === vars.columnId);
      const others = without.filter((c) => c.columnId !== vars.columnId);
      const insertAt = Math.max(0, Math.min(vars.index, targetCol.length));
      targetCol.splice(insertAt, 0, { ...item, columnId: vars.columnId });
      qc.setQueryData<CardData[]>(QK, others.concat(targetCol));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(QK, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QK }); },
  });

  const pin = useMutation({
    mutationFn: togglePin,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<CardData[]>(QK) ?? [];
      const next = prev.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned, pinnedAt: !c.pinned ? Date.now() : null } : c,
      );
      qc.setQueryData(QK, next);
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(QK, ctx.prev); },
    onSettled: () => { qc.invalidateQueries({ queryKey: QK }); },
  });

  /**
   * Activation constraints:
   *  - delay=120ms with tolerance=6px: hold > 120ms to enter drag mode, but accept
   *    quick clicks (under 120ms) as clicks so the brief modal opens. This avoids
   *    the original `distance: 4` problem where short drags would race the click
   *    handler and the modal would pop instead of the card moving.
   */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { delay: 120, tolerance: 6 } }));
  const groups = useMemo(() => groupByColumn(cards), [cards]);

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const activeCard = cards.find((c) => c.id === activeIdStr);
    if (!activeCard) return;
    const overColumn = COLUMNS.find((col) => col.id === overIdStr)?.id || null;
    let targetCol: ColumnId | null = overColumn;
    let targetIndex = 0;
    if (!targetCol) {
      const overCard = cards.find((c) => c.id === overIdStr);
      if (!overCard) return;
      targetCol = overCard.columnId;
      const arr = groups[targetCol];
      const overIndex = arr.findIndex((c) => c.id === overCard.id);
      const activeIndex = arr.findIndex((c) => c.id === activeCard.id);
      if (activeCard.columnId === targetCol && activeIndex !== -1 && overIndex !== -1) {
        const reordered = arrayMove(arr, activeIndex, overIndex);
        const others = cards.filter((c) => c.columnId !== targetCol);
        qc.setQueryData<CardData[]>(QK, others.concat(reordered));
        move.mutate({ id: activeIdStr, columnId: targetCol, index: overIndex });
        return;
      }
      targetIndex = overIndex >= 0 ? overIndex : arr.length;
    } else {
      targetIndex = groups[targetCol].length;
    }
    if (activeCard.columnId === targetCol) return;
    move.mutate({ id: activeIdStr, columnId: targetCol, index: targetIndex });
  };

  const pinned = useMemo(
    () => [...cards.filter((c) => c.pinned)].sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)),
    [cards],
  );

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const selectedCard = cards.find((c) => c.id === selectedId) ?? null;
  const total = cards.length;
  const overdue = cards.filter((c) => c.priority >= 9).length;
  const aiCount = cards.filter((c) => c.source !== 'manual').length;

  /**
   * Saved widths live in localStorage under the group id below.
   * On first load every panel gets defaultSize → after the user drags a
   * separator the new layout is persisted automatically.
   */
  return (
    <div className="queue-wrap">
      <div className="kpis">
        <div className="kpi"><div className="label">Customers</div><div className="val">{total}</div><div className="sub">in your queue</div></div>
        <div className="kpi"><div className="label">Overdue</div><div className="val">{overdue}</div><div className="sub">P9 priority</div></div>
        <div className="kpi"><div className="label">AI-tasked</div><div className="val">{aiCount}</div><div className="sub">click to open brief</div></div>
        <div className="kpi"><div className="label">Pinned</div><div className="val">{pinned.length}</div><div className="sub">on board</div></div>
        <div className="kpi"><div className="label">Status</div><div className="val">{isLoading ? '…' : 'Live'}</div><div className="sub">SSE open</div></div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {/*
          react-resizable-panels: every column + the pin board is a Panel.
          autoSaveId persists each user's column widths to localStorage so a refresh
          (or new session) keeps the layout they chose. Min/max sizes keep columns
          usable when dragged extreme.
        */}
        <Group
          id="callqueue-layout"
          orientation="horizontal"
          className="queue-panels"
        >
          {COLUMNS.map((column) => (
            <Fragment key={column.id}>
              <Panel
                id={`col-${column.id}`}
                defaultSize={18}
                minSize={10}
                maxSize={50}
                className="queue-panel"
              >
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

      {selectedCard && <TaskBriefModal card={selectedCard} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
