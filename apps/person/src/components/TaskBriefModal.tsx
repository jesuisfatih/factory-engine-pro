import { useEffect, useMemo, useState } from 'react';
import {
  X, Phone, Mail, ExternalLink, Sparkles, AlarmClockOff, CheckCircle2,
  Pencil, RotateCcw, MoreHorizontal, ShoppingBag, DollarSign, Tags,
} from 'lucide-react';
import type { Card as CardData, TaskSource } from '../types';

interface Props {
  card: CardData;
  onClose: () => void;
}

const SOURCE_LABEL: Record<TaskSource, string> = {
  manual: 'Manual',
  ai_transcript: 'AI - Transcript',
  ai_segment: 'AI - Segment',
  ai_stale: 'AI - Stale follow-up',
};

function riskTier(priority: number) {
  if (priority >= 9) return { label: 'High risk', tone: 'danger' as const };
  if (priority >= 7) return { label: 'Watch', tone: 'warn' as const };
  if (priority >= 5) return { label: 'Steady', tone: 'success' as const };
  return { label: 'Routine', tone: 'info' as const };
}

interface NarrativeFieldProps {
  label: string;
  aiValue: string;
  value: string;
  onChange: (next: string) => void;
  multiLine?: boolean;
}

function NarrativeField({ label, aiValue, value, onChange, multiLine }: NarrativeFieldProps) {
  const [editing, setEditing] = useState(false);
  const dirty = value !== aiValue;
  return (
    <div className="brief-block">
      <div className="brief-block-head">
        <span className="lbl">{label}</span>
        <div className="brief-actions">
          {dirty && (
            <button type="button" className="brief-icon-btn" title="Reset to AI" onClick={() => onChange(aiValue)}>
              <RotateCcw size={11} />
            </button>
          )}
          <button
            type="button"
            className={`brief-icon-btn${editing ? ' active' : ''}`}
            title={editing ? 'Done' : 'Edit'}
            onClick={() => setEditing((current) => !current)}
          >
            <Pencil size={11} />
          </button>
        </div>
      </div>
      {editing ? (
        multiLine ? (
          <textarea
            className="brief-edit"
            rows={3}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoFocus
          />
        ) : (
          <input
            className="brief-edit"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoFocus
          />
        )
      ) : (
        <div className="brief-val">{value}{dirty && <span className="brief-dirty">edited</span>}</div>
      )}
    </div>
  );
}

export function TaskBriefModal({ card, onClose }: Props) {
  const hasBrief = card.source !== 'manual' && card.aiBrief;
  const initial = useMemo(() => ({
    why: card.aiBrief?.whyCalling ?? '',
    upset: card.aiBrief?.upsetAbout ?? '',
    goal: card.aiBrief?.callGoal ?? '',
  }), [card]);
  const [why, setWhy] = useState(initial.why);
  const [upset, setUpset] = useState(initial.upset);
  const [goal, setGoal] = useState(initial.goal);
  const tier = riskTier(card.priority);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-brief-title"
    >
      <div className="modal-card brief-modal" role="document">
        <header className="modal-head">
          <div>
            <div className="brief-eyebrow">
              <span className={`brief-source brief-source-${card.source}`}>
                {card.source === 'manual' ? null : <Sparkles size={10} />} {SOURCE_LABEL[card.source]}
              </span>
              <span className={`brief-tier tier-${tier.tone}`}>{tier.label} - P{card.priority}</span>
              <span className="chip" style={{ background: card.segmentColor }}>{card.segment}</span>
            </div>
            <h2 id="task-brief-title" style={{ marginTop: 6 }}>{card.title}</h2>
            <div className="brief-identity">
              {card.phone && (
                <span><Phone size={11} /> {card.phone}</span>
              )}
              {card.email && (
                <span><Mail size={11} /> {card.email}</span>
              )}
            </div>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="modal-body brief-body">
          <div className="brief-main">
            {hasBrief ? (
              <>
                <NarrativeField
                  label="Why you're calling"
                  aiValue={initial.why}
                  value={why}
                  onChange={setWhy}
                  multiLine
                />
                <NarrativeField
                  label="What they're upset about"
                  aiValue={initial.upset}
                  value={upset}
                  onChange={setUpset}
                  multiLine
                />
                <NarrativeField
                  label="Your goal"
                  aiValue={initial.goal}
                  value={goal}
                  onChange={setGoal}
                  multiLine
                />

                {card.aiBrief?.suggestedActions?.length ? (
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Suggested actions</span>
                    </div>
                    <ul className="brief-actions-list">
                      {card.aiBrief.suggestedActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {card.aiBrief?.transcriptSnippet ? (
                  <div className="brief-block">
                    <div className="brief-block-head">
                      <span className="lbl">Transcript snippet</span>
                    </div>
                    <div className="brief-transcript">{card.aiBrief.transcriptSnippet}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="brief-block">
                <div className="brief-block-head">
                  <span className="lbl">Manual task</span>
                </div>
                <div className="brief-val brief-val-muted">
                  Created by an operator. No AI brief - add dial notes as the call progresses to feed
                  the next cycle of intelligence.
                </div>
              </div>
            )}

            <div className="brief-block">
              <div className="brief-block-head">
                <span className="lbl">Dial notes</span>
              </div>
              <textarea
                className="brief-edit"
                rows={3}
                placeholder="Notes during the call (saved to customer history)..."
              />
            </div>
          </div>

          <aside className="brief-side">
            <div className="brief-card">
              <div className="brief-card-head">
                <Tags size={12} /> Customer
              </div>
              <div className="brief-card-row">
                <span className="lbl">Name</span>
                <span className="val">{card.title}</span>
              </div>
              {card.email && (
                <div className="brief-card-row">
                  <span className="lbl">Email</span>
                  <span className="val">{card.email}</span>
                </div>
              )}
              {card.phone && (
                <div className="brief-card-row">
                  <span className="lbl">Phone</span>
                  <span className="val">{card.phone}</span>
                </div>
              )}
              <div className="brief-card-row">
                <span className="lbl">Segment</span>
                <span className="val">{card.segment}</span>
              </div>
            </div>

            <div className="brief-stats">
              <div className="brief-stat">
                <ShoppingBag size={11} />
                <div>
                  <div className="lbl">Orders</div>
                  <div className="val">{card.ordersCount ?? 'N/A'}</div>
                </div>
              </div>
              <div className="brief-stat">
                <DollarSign size={11} />
                <div>
                  <div className="lbl">LTV</div>
                  <div className="val">{card.totalSpent ? `$${card.totalSpent.toLocaleString()}` : 'N/A'}</div>
                </div>
              </div>
            </div>

            {hasBrief && card.aiBrief && (
              <div className="brief-card brief-card-meta">
                <div className="brief-card-head"><Sparkles size={12} /> AI metadata</div>
                <div className="brief-card-row">
                  <span className="lbl">Prompt</span>
                  <span className="val">{card.aiBrief.promptKey} - {card.aiBrief.promptVersion}</span>
                </div>
                <div className="brief-card-row">
                  <span className="lbl">Model</span>
                  <span className="val">{card.aiBrief.modelUsed}</span>
                </div>
                <div className="brief-card-row">
                  <span className="lbl">Confidence</span>
                  <span className="val">{Math.round(card.aiBrief.confidence * 100)}%</span>
                </div>
              </div>
            )}

            <div className="brief-quick-actions">
              <button type="button" className="btn"><Phone size={12} /> Call</button>
              <button type="button" className="btn"><ExternalLink size={12} /> Open</button>
            </div>
          </aside>
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn"><MoreHorizontal size={13} /> More</button>
          <button type="button" className="btn"><AlarmClockOff size={13} /> Snooze</button>
          <button type="button" className="btn"><Phone size={13} /> Call now</button>
          <button type="button" className="btn primary" onClick={onClose}>
            <CheckCircle2 size={13} /> Mark done
          </button>
        </footer>
      </div>
    </div>
  );
}
