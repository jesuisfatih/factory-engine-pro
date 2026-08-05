import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { fetchTraining, friendlyError } from '../api/live';
import { QueryState } from '../components/QueryState';
import { personSafeText } from '../lib/personTerminology';

export function TrainingView() {
  const { data, isLoading, error } = useQuery({ queryKey: ['person', 'training'], queryFn: fetchTraining });
  const cards = data?.cards ?? [];

  return (
    <>
      <div className="page-head">
        <h2>Training</h2>
        <div className="sub">
          <BookOpenCheck size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
          {data?.highPriorityCount ?? 0} verified customer moments in your coaching queue
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={cards.length === 0}
        emptyTitle="No verified coaching moments"
        emptyBody="Assigned customer conversations with verified evidence will appear here."
      >
        <div className="announce-feed">
          {cards.map((card) => (
            <article key={card.id} className="announce-card severity-info">
              <div className="head">
                <span className="from">{personSafeText(card.source)}</span>
                <span>{card.updatedAt}</span>
              </div>
              {card.customerName ? <div className="training-customer">{personSafeText(card.customerName)}</div> : null}
              <h3>{personSafeText(card.title)}</h3>
              <p>{personSafeText(card.description)}</p>
              {card.focus ? <div className="training-focus">Focus: {personSafeText(card.focus)}</div> : null}
              <div className="training-evidence" aria-label="Conversation evidence">
                {card.evidence.map((item) => <blockquote key={item}>{personSafeText(item)}</blockquote>)}
              </div>
            </article>
          ))}
        </div>
      </QueryState>
    </>
  );
}
