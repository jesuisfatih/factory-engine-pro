import { useQuery } from '@tanstack/react-query';
import { AtSign, Briefcase, ShieldAlert, Star, Bell } from 'lucide-react';
import { fetchNotifications } from '../api/mock';

const ICONS = {
  mention: AtSign,
  assigned: Briefcase,
  sla: ShieldAlert,
  pin: Star,
  system: Bell,
};

export function NotificationsView() {
  const { data: rows = [] } = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications });
  const unread = rows.filter((row) => !row.read).length;

  return (
    <>
      <div className="page-head">
        <h2>Notifications</h2>
        <div className="sub">{unread} unread · mentions, assignments, SLA, pins and system events</div>
      </div>

      <div className="notif-feed">
        {rows.map((row) => {
          const Icon = ICONS[row.kind];
          return (
            <div key={row.id} className={`notif-row kind-${row.kind}${row.read ? '' : ' unread'}`}>
              <span className="ico"><Icon size={14} /></span>
              <div className="body">
                <div className="title">{row.title}</div>
                <div className="body-text">{row.body}</div>
              </div>
              <div className="when">{row.at}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
