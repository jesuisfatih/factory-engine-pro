import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlarmClockOff, Sparkles, Tags } from 'lucide-react';
import type { Card as CardData, TaskSource } from '../types';

interface Props {
  card: CardData;
  onTogglePin: (id: string) => void;
  onOpen?: (id: string) => void;
}

function priorityClass(priority: number) {
  if (priority >= 9) return 'priority p9';
  if (priority >= 7) return 'priority p7';
  if (priority >= 5) return 'priority p5';
  return 'priority p3';
}

const SOURCE_META: Record<Exclude<TaskSource, 'manual'>, { label: string; icon: typeof Sparkles }> = {
  ai_transcript: { label: 'AI - Transcript', icon: Sparkles },
  ai_segment: { label: 'AI - Segment', icon: Tags },
  ai_stale: { label: 'AI - Stale', icon: AlarmClockOff },
};

export function Card({ card, onTogglePin, onOpen }: Props) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
  const meta = card.source === 'manual' ? null : SOURCE_META[card.source];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`card${isDragging ? ' dragging' : ''}`}
      onClick={() => {
        if (!isDragging) onOpen?.(card.id);
      }}
      {...attributes}
      {...listeners}
    >
      <div className="row1">
        <span className="title">{card.title}</span>
        {meta ? (
          <span className={`src-badge src-${card.source}`} title={meta.label}>
            <meta.icon size={9} />
            <span>{meta.label}</span>
          </span>
        ) : null}
        <span className={priorityClass(card.priority)}>P{card.priority}</span>
      </div>
      <div className="summary">{card.summary}</div>
      <div className="row2">
        <span className="chip" style={{ background: card.segmentColor }}>{card.segment}</span>
        <button
          type="button"
          className={`pin-btn${card.pinned ? ' pinned' : ''}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin(card.id);
          }}
        >
          {card.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </div>
  );
}
