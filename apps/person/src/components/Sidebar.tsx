import { NAV, type NavId } from '../types';
import { clearSurfaceSessions, personApi, readSession } from '../lib/api';
import { Icon } from './Icon';
import { WorkspaceBrand } from './WorkspaceBrand';
import { useQuery } from '@tanstack/react-query';
import { fetchSummary } from '../api/live';

interface Props {
  current: NavId;
  onSelect: (id: NavId) => void;
  collapsed: boolean;
}

const NAV_ICONS: Record<NavId, Parameters<typeof Icon>[0]['name']> = {
  queue: 'queue',
  'daily-archive': 'queue',
  customers: 'customers',
  'customer-archive': 'customers',
  email: 'mail',
  training: 'training',
  calendar: 'calendar',
  notes: 'notes',
  announcements: 'megaphone',
  messaging: 'chat',
  requests: 'inbox',
  notifications: 'bell',
};

export function Sidebar({ current, onSelect, collapsed }: Props) {
  const { data: summary } = useQuery({ queryKey: ['person', 'summary'], queryFn: fetchSummary });
  const principal = readSession()?.principal;
  const name = principal ? `${principal.firstName} ${principal.lastName}`.trim() || principal.email : 'Signed out';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const navItems = NAV.map((item) => ({
    ...item,
    badge: item.id === 'queue'
      ? summary?.queue
      : item.id === 'customers'
        ? summary?.customers
        : item.id === 'notifications'
          ? summary?.notifications
          : undefined,
  }));
  const groups = navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
    const key = item.group ?? 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const logout = async () => {
    try {
      await personApi.logout();
    } catch {
      // Local session cleanup must still happen if the server token is already expired.
    } finally {
      clearSurfaceSessions();
      window.location.replace('/staff/login');
    }
  };

  return (
    <aside className="sidebar">
      <WorkspaceBrand className="workspace" badgeSize={30} badgeFontSize={11} subtitle="Customer Service" />

      <div className="nav-list">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="nav-group">
              <span>{collapsed ? '' : group}</span>
            </div>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item${current === item.id ? ' active' : ''}`}
                onClick={() => onSelect(item.id)}
                title={item.label}
              >
                <Icon name={NAV_ICONS[item.id]} className="ico" />
                <span className="nav-label">{item.label}</span>
                {item.badge !== undefined && <span className="badge">{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="user-card">
        <div className="user-avatar">{initials}</div>
        <div className="user-meta">
          <div className="email">{principal?.email ?? 'No active session'}</div>
          <div className="role">Customer Service</div>
        </div>
        <button id="btn-person-logout" type="button" className="logout" title="Log out" onClick={() => void logout()}>
          <Icon name="logout" size={14} />
        </button>
      </div>
    </aside>
  );
}
