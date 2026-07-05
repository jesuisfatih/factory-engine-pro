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
          {data?.highPriorityCount ?? 0} high-priority customer moments shaping today&apos;s coaching queue
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={cards.length === 0}
        emptyTitle="No live training cards"
        emptyBody="Active customer lists and high-priority customer conversations will create coaching cards here."
      >
        <div className="announce-feed">
          {cards.map((card) => (
            <article key={card.id} className="announce-card severity-info">
              <div className="head">
                <span className="from">{personSafeText(card.source)}</span>
                <span>{card.updatedAt}</span>
              </div>
              <h3>{personSafeText(card.title)}</h3>
              <p>{personSafeText(card.description)}</p>
            </article>
          ))}
        </div>
      </QueryState>
    </>
  );
}
