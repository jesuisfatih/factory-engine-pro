import { Activity, AlarmClockOff, Archive, ArrowRightLeft, FileText, Phone, ShoppingBag, Tags, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FrontendCustomizationRuntimeDto } from '@factory-engine-pro/contracts';
import type { Card as CardData, TaskSource } from '../types';
import { focusLabel, personSafeText, staffActionLabel, staffActionTone, taskSourceLabel } from '../lib/personTerminology';
import { frontendCopy, frontendElementClassName, frontendElementOverride, frontendFieldVisible } from './FrontendCustomization';

interface Props {
  card: CardData;
  onTogglePin: (id: string) => void;
  onArchive?: (card: CardData) => void;
  onOpen?: (id: string) => void;
  onCall?: (card: CardData) => void;
  callDisabled?: boolean;
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

const AVATAR_COLORS = ['#dc4b3e', '#d99a2b', '#2f7f7a', '#6366f1', '#0e7490', '#9333ea'];

function avatarColor(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(title: string) {
  const words = title.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '#';
  return `${words[0][0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase() || '#';
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

function displayToneClass(tone: string | undefined) {
  if (tone === 'warning') return 'warn';
  if (tone === 'danger' || tone === 'success' || tone === 'info') return tone;
  return 'info';
}

export function Card({ card, onTogglePin, onArchive, onOpen, onCall, callDisabled = false, onTransfer, customization, summary }: Props) {
  const meta = card.source === 'manual' ? null : SOURCE_META[card.source];
  const override = frontendElementOverride(customization, 'daily.card', { dailyCall: card, summary });
  const safeCardTitle = personSafeText(card.displayTitle || card.title);
  const primaryBadge = card.displayBadges[0];
  const actionInput = {
    intent: card.callIntent ?? card.urgencyBreakdown.intent,
    tags: card.psychTags,
    upset: card.displayConcern,
    goal: card.displayOutcome,
    summary: card.displayReason,
    urgencyScore: card.urgencyScore,
  };
  const actionLabel = primaryBadge?.label ?? staffActionLabel(actionInput);
  const actionTone = displayToneClass(primaryBadge?.tone ?? staffActionTone(actionInput));
  const briefLine = frontendCopy(
    override,
    'requiredAction',
    personSafeText(card.displayOutcome || card.displayReason || actionLabel || 'Review this customer and save the next step.'),
  );
  const lastOrder = card.miniOrder
    ? `${card.miniOrder.orderNumber ?? card.miniOrder.id} ${fmtMoney(card.miniOrder.totalPrice, card.miniOrder.currency)}`
    : card.ordersCount
      ? `${card.ordersCount} orders ${fmtMoney(card.totalSpent ?? 0)}`
      : 'No linked order';
  const performance = card.displayCallSnapshot || (card.performance30d
    ? `${card.performance30d.orders} orders - ${fmtMoney(card.performance30d.revenue)} - ${card.performance30d.serviceRequests} follow-ups`
    : '30d customer activity pending');
  const staffSegment = card.source === 'call_analysis' ? null : personSafeText(card.segment);
  return (
    <div
      className={`card card-v2 ${card.urgencyScore >= 8 ? 'urgency-high' : card.urgencyScore >= 6 ? 'urgency-med' : 'urgency-low'} ${frontendElementClassName(override, card.urgencyScore)}`}
      onClick={() => {
        onOpen?.(card.id);
      }}
    >
      <span className="missed-avatar card-avatar" style={{ background: avatarColor(safeCardTitle) }}>{initialsFor(safeCardTitle)}</span>
      <div className="card-body">
        <div className="row1">
          {frontendFieldVisible(override, 'title') ? <span className="title">{safeCardTitle}</span> : null}
          {meta && frontendFieldVisible(override, 'actionBadge') ? (
            <span className={`action-badge tone-${actionTone}`} title={meta.label}>
              <meta.icon size={9} />
              <span>{frontendCopy(override, 'actionLabel', actionLabel)}</span>
            </span>
          ) : null}
          {staffSegment && frontendFieldVisible(override, 'segmentChip') ? <span className="chip" style={{ background: card.segmentColor }}>{staffSegment}</span> : null}
          {frontendFieldVisible(override, 'urgencyScore') ? (
            <span className={priorityClass(card.priority)} title={personSafeText(card.urgencyBreakdown.intent ?? 'urgency score')}>
              U{card.urgencyScore}
            </span>
          ) : null}
        </div>
        {frontendFieldVisible(override, 'requiredAction') ? <div className={`staff-brief tone-${actionTone}`}>{briefLine}</div> : null}
        <div className="card-foot">
          <div className="card-meta">
            {frontendFieldVisible(override, 'phone') ? <span title="Phone"><span className="sig-ic green"><Phone size={11} /></span> {card.phone || 'No phone'}</span> : null}
            {frontendFieldVisible(override, 'latestOrder') ? <span title={frontendCopy(override, 'latestOrderTitle', 'Latest Shopify order')}><span className="sig-ic indigo"><ShoppingBag size={11} /></span> {card.displayCommerceSnapshot || lastOrder}</span> : null}
            {frontendFieldVisible(override, 'performance30d') ? <span title={frontendCopy(override, 'performanceTitle', 'Last 30 days')}><span className="sig-ic amber"><Activity size={11} /></span> {performance}</span> : null}
            {frontendFieldVisible(override, 'assignee') ? <span title="Owner"><span className="sig-ic blue"><UserRound size={11} /></span> {card.assignedMemberName ? card.assignedMemberName : frontendCopy(override, 'assigneeFallback', 'Unassigned')}</span> : null}
            {frontendFieldVisible(override, 'focus') ? <span>{frontendCopy(override, 'focusLabel', focusLabel(card.axis))}</span> : null}
            {frontendFieldVisible(override, 'segmentPriority') && card.segmentPriority !== null && card.segmentPriority !== undefined ? (
              <span>{frontendCopy(override, 'segmentPriorityLabel', `Customer group P${card.segmentPriority}`)}</span>
            ) : null}
          </div>
          <div className="card-actions">
            {frontendFieldVisible(override, 'callButton') ? (
              <button
                type="button"
                className="call-btn"
                title={card.phone ? frontendCopy(override, 'callTitle', `Call ${card.phone}`) : frontendCopy(override, 'noPhoneTitle', 'No phone on file')}
                aria-label={card.phone ? `Call ${safeCardTitle}` : `No phone for ${safeCardTitle}`}
                disabled={!card.phone || callDisabled}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (card.phone) onCall?.(card);
                }}
              >
                <Phone size={12} />
                <span>{frontendCopy(override, 'callLabel', callDisabled ? 'Calling' : 'Call')}</span>
              </button>
            ) : null}
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
                aria-label={`Archive ${safeCardTitle}`}
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
                aria-label={`Transfer ${safeCardTitle}`}
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
      </div>
    </div>
  );
}
