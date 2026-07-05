import { useQuery } from '@tanstack/react-query';
import { AtSign, Briefcase, ShieldAlert, Star, Bell } from 'lucide-react';
import { fetchNotifications, friendlyError } from '../api/live';
import { QueryState } from '../components/QueryState';
import { personSafeText } from '../lib/personTerminology';

const ICONS = {
  mention: AtSign,
  assigned: Briefcase,
  sla: ShieldAlert,
  pin: Star,
  system: Bell,
};

export function NotificationsView() {
  const { data: rows = [], isLoading, error } = useQuery({ queryKey: ['person', 'notifications'], queryFn: fetchNotifications });
  const unread = rows.filter((row) => !row.read).length;

  return (
    <>
      <div className="page-head">
        <h2>Notifications</h2>
        <div className="sub">{unread} unread - mentions, assignments, urgent follow-ups, pins and system events</div>
      </div>

      <QueryState
        isLoading={isLoading}
        error={error ? new Error(friendlyError(error)) : null}
        empty={rows.length === 0}
        emptyTitle="No notifications"
        emptyBody="Assignments, urgent unassigned follow-ups and system events will appear here."
      >
      <div className="notif-feed">
        {rows.map((row) => {
          const Icon = ICONS[row.kind];
          return (
            <div key={row.id} className={`notif-row kind-${row.kind}${row.read ? '' : ' unread'}`}>
              <span className="ico"><Icon size={14} /></span>
              <div className="body">
                <div className="title">{personSafeText(row.title)}</div>
                <div className="body-text">{personSafeText(row.body)}</div>
              </div>
              <div className="when">{row.at}</div>
            </div>
          );
        })}
      </div>
      </QueryState>
    </>
  );
}
