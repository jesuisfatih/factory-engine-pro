import { Activity, AlarmClockOff, Archive, ArrowRightLeft, FileText, Mail, Phone, ShoppingBag, Tags } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FrontendCustomizationRuntimeDto } from '@factory-engine-pro/contracts';
import type { Card as CardData, TaskSource } from '../types';
import { focusLabel, personSafeText, staffActionLabel, staffActionTone, staffBriefLine, taskSourceLabel } from '../lib/personTerminology';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible } from './FrontendCustomization';

interface Props {
  card: CardData;
  onTogglePin: (id: string) => void;
  onArchive?: (card: CardData) => void;
  onOpen?: (id: string) => void;
  onTransfer?: (card: CardData) => void;
  customization?: FrontendCustomizationRuntimeDto | null;
  summary?: unknown;
}

function priorityClass(priority: number) {
  if (priority >= 9) return 'priority p9';
  if (priority >= 7) return 'priority p7';
  if (priority >= 5) return 'priority p5';
  return 'priority p3';
}

const SOURCE_META: Record<Exclude<TaskSource, 'manual'>, { label: string; icon: LucideIcon }> = {
  call_analysis: { label: taskSourceLabel('call_analysis'), icon: FileText },
  segment_priority: { label: taskSourceLabel('segment_priority'), icon: Tags },
  stale_follow_up: { label: taskSourceLabel('stale_follow_up'), icon: AlarmClockOff },
  admin_transfer: { label: taskSourceLabel('admin_transfer'), icon: ArrowRightLeft },
};

function fmtMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function Card({ card, onTogglePin, onArchive, onOpen, onTransfer, customization, summary }: Props) {
  const meta = card.source === 'manual' ? null : SOURCE_META[card.source];
  const override = frontendElementOverride(customization, 'daily.card', { dailyCall: card, summary });
  const actionInput = {
    intent: card.callIntent ?? card.urgencyBreakdown.intent,
    tags: card.psychTags,
    upset: card.aiBrief?.upsetAbout,
    goal: card.aiBrief?.callGoal,
    summary: card.aiBrief?.whyCalling ?? card.summary,
    urgencyScore: card.urgencyScore,
  };
  const actionLabel = staffActionLabel(actionInput);
  const actionTone = staffActionTone(actionInput);
  const briefLine = frontendCopy(override, 'requiredAction', staffBriefLine(actionInput));
  const lastOrder = card.miniOrder
    ? `${card.miniOrder.orderNumber ?? card.miniOrder.id} ${fmtMoney(card.miniOrder.totalPrice, card.miniOrder.currency)}`
    : card.ordersCount
      ? `${card.ordersCount} orders ${fmtMoney(card.totalSpent ?? 0)}`
      : 'No linked order';
  const performance = card.performance30d
    ? `${card.performance30d.orders} orders - ${fmtMoney(card.performance30d.revenue)} - ${card.performance30d.serviceRequests} follow-ups`
    : '30d customer activity pending';
  const staffSegment = card.source === 'call_analysis' ? null : personSafeText(card.segment);
  return (
    <div
      className={`card ${frontendElementClassName(override, card.urgencyScore)}`}
      onClick={() => {
        onOpen?.(card.id);
      }}
    >
      <div className="row1">
        {frontendFieldVisible(override, 'title') ? <span className="title">{personSafeText(card.title)}</span> : null}
        {meta && frontendFieldVisible(override, 'actionBadge') ? (
          <span className={`action-badge tone-${actionTone}`} title={meta.label}>
            <meta.icon size={9} />
            <span>{frontendCopy(override, 'actionLabel', actionLabel)}</span>
          </span>
        ) : null}
        {frontendFieldVisible(override, 'urgencyScore') ? (
          <span className={priorityClass(card.priority)} title={card.urgencyBreakdown.intent ?? 'urgency score'}>
            U{card.urgencyScore}
          </span>
        ) : null}
      </div>
      {frontendFieldVisible(override, 'requiredAction') ? <div className={`staff-brief tone-${actionTone}`}>{briefLine}</div> : null}
      {(card.phone || card.email) && (frontendFieldVisible(override, 'phone') || frontendFieldVisible(override, 'email')) ? (
        <div className="card-contact-line">
          {card.phone && frontendFieldVisible(override, 'phone') ? <span><Phone size={12} /> {card.phone}</span> : null}
          {card.email && frontendFieldVisible(override, 'email') ? <span><Mail size={12} /> {card.email}</span> : null}
        </div>
      ) : null}
      {(frontendFieldVisible(override, 'assignee') || frontendFieldVisible(override, 'focus') || frontendFieldVisible(override, 'segmentPriority')) ? (
        <div className="assign-line">
          {frontendFieldVisible(override, 'assignee') ? <span>{card.assignedMemberName ? card.assignedMemberName : frontendCopy(override, 'assigneeFallback', 'Unassigned')}</span> : null}
          {frontendFieldVisible(override, 'focus') ? <span>{frontendCopy(override, 'focusLabel', focusLabel(card.axis))}</span> : null}
          {frontendFieldVisible(override, 'segmentPriority') && card.segmentPriority !== null && card.segmentPriority !== undefined ? (
            <span>{frontendCopy(override, 'segmentPriorityLabel', `Customer group P${card.segmentPriority}`)}</span>
          ) : null}
        </div>
      ) : null}
      {(frontendFieldVisible(override, 'latestOrder') || frontendFieldVisible(override, 'performance30d')) ? (
        <div className="card-signals">
          {frontendFieldVisible(override, 'latestOrder') ? <span title={frontendCopy(override, 'latestOrderTitle', 'Latest Shopify order')}><ShoppingBag size={10} /> {lastOrder}</span> : null}
          {frontendFieldVisible(override, 'performance30d') ? <span title={frontendCopy(override, 'performanceTitle', 'Last 30 days')}><Activity size={10} /> {performance}</span> : null}
        </div>
      ) : null}
      <div className="row2">
        {staffSegment && frontendFieldVisible(override, 'segmentChip') ? <span className="chip" style={{ background: card.segmentColor }}>{staffSegment}</span> : null}
        {frontendFieldVisible(override, 'pinButton') ? (
          <button
            type="button"
            className={`pin-btn${card.pinned ? ' pinned' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(card.id);
            }}
          >
            {card.pinned ? frontendCopy(override, 'pinnedLabel', 'Pinned') : frontendCopy(override, 'pinLabel', 'Pin')}
          </button>
        ) : null}
        {card.kind === 'task' && onArchive && frontendFieldVisible(override, 'archiveButton') ? (
          <button
            type="button"
            className="archive-btn"
            title={frontendCopy(override, 'archiveTitle', 'Archive from my Daily list')}
            aria-label={`Archive ${card.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onArchive(card);
            }}
          >
            <Archive size={12} />
            <span>{frontendCopy(override, 'archiveLabel', 'Archive')}</span>
          </button>
        ) : null}
        {card.kind === 'task' && frontendFieldVisible(override, 'transferButton') ? (
          <button
            type="button"
            className="transfer-btn"
            title={frontendCopy(override, 'transferTitle', 'Transfer follow-up')}
            aria-label={`Transfer ${card.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onTransfer?.(card);
            }}
          >
            <ArrowRightLeft size={12} />
            <span>{frontendCopy(override, 'transferLabel', 'Transfer')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
