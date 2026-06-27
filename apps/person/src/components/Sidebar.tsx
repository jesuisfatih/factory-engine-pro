import { NAV, type NavId } from '../types';
import { Icon } from './Icon';

interface Props {
  current: NavId;
  onSelect: (id: NavId) => void;
  collapsed: boolean;
}

const NAV_ICONS: Record<NavId, Parameters<typeof Icon>[0]['name']> = {
  queue: 'queue',
  customers: 'customers',
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
  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    const key = item.group ?? 'General';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <aside className="sidebar">
      <div className="workspace">
        <div className="ws-badge">DB</div>
        <div className="ws-meta">
          <div className="name">DTF BANK</div>
          <div className="role">Customer Service</div>
        </div>
      </div>

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
        <div className="user-avatar">L</div>
        <div className="user-meta">
          <div className="email">linda@dtfbank.com</div>
          <div className="role">Sales</div>
        </div>
        <button type="button" className="logout" title="Log out"><Icon name="logout" size={14} /></button>
      </div>
    </aside>
  );
}
