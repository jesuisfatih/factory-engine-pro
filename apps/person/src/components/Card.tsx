import { Activity, AlarmClockOff, ShoppingBag, Sparkles, Tags } from 'lucide-react';
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

function fmtMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function Card({ card, onTogglePin, onOpen }: Props) {
  const meta = card.source === 'manual' ? null : SOURCE_META[card.source];
  const lastOrder = card.miniOrder
    ? `${card.miniOrder.orderNumber ?? card.miniOrder.id} ${fmtMoney(card.miniOrder.totalPrice, card.miniOrder.currency)}`
    : 'No Shopify order';
  const performance = card.performance30d
    ? `${card.performance30d.orders} orders - ${fmtMoney(card.performance30d.revenue)} - ${card.performance30d.serviceRequests} tasks`
    : '30d performance pending';
  return (
    <div
      className="card"
      onClick={() => {
        onOpen?.(card.id);
      }}
    >
      <div className="row1">
        <span className="title">{card.title}</span>
        {meta ? (
          <span className={`src-badge src-${card.source}`} title={meta.label}>
            <meta.icon size={9} />
            <span>{meta.label}</span>
          </span>
        ) : null}
        <span className={priorityClass(card.priority)} title={card.urgencyBreakdown.intent ?? 'urgency score'}>
          U{card.urgencyScore}
        </span>
      </div>
      <div className="summary">{card.summary}</div>
      <div className="card-signals">
        <span title="Latest Shopify order"><ShoppingBag size={10} /> {lastOrder}</span>
        <span title="Last 30 days"><Activity size={10} /> {performance}</span>
      </div>
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
