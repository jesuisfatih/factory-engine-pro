import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Card as CardData, Column as ColumnData } from '../types';
import { Card } from './Card';

interface Props {
  column: ColumnData;
  cards: CardData[];
  onTogglePin: (id: string) => void;
  onOpen: (id: string) => void;
}

export function Column({ column, cards, onTogglePin, onOpen }: Props) {
  /**
   * Whole column is the drop target (not just the body). That way users can drop a
   * card anywhere inside the column - including above the first card or below the
   * last one - and it still registers as a drop.
   */
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  return (
    <div ref={setNodeRef} className={`column${isOver ? ' over' : ''}`}>
      <div className="column-head">
        <span className="title">{column.title}</span>
        <span className="count">{cards.length}</span>
      </div>
      <div className="column-body">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card key={card.id} card={card} onTogglePin={onTogglePin} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
