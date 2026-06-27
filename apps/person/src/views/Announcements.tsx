import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { fetchAnnouncements, friendlyError } from '../api/live';
import { QueryState } from '../components/QueryState';

export function AnnouncementsView() {
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['person', 'announcements'], queryFn: fetchAnnouncements });
  const unread = rows.filter((row) => !row.read).length;

  return (
    <>
      <div className="page-head">
        <h2>Announcements</h2>
        <div className="sub">
          <Megaphone size={11} style={{ verticalAlign: 'text-top', marginRight: 4 }} />
          {unread} unread · broadcasts from owner + engineering
        </div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={rows.length === 0}
        emptyTitle="No operational announcements"
        emptyBody="Aircall, Shopify, sync and mail pipeline events will appear here."
      >
      <div className="announce-feed">
        {rows.map((row) => (
          <article key={row.id} className={`announce-card severity-${row.severity}${row.read ? '' : ' unread'}`}>
            <div className="head">
              <span className="from">{row.from}</span>
              <span>{row.at}</span>
            </div>
            <h3>{row.title}</h3>
            <p>{row.body}</p>
          </article>
        ))}
      </div>
      </QueryState>
    </>
  );
}
