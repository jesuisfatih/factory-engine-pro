import { Icon } from './Icon';
import { useTheme } from '../theme';

interface Props {
  title: string;
  onToggleSidebar: () => void;
}

export function Topbar({ title, onToggleSidebar }: Props) {
  const { theme, toggle } = useTheme();
  return (
    <header className="topbar">
      <button type="button" className="toggle" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icon name="sidebar" size={16} />
      </button>
      <h1>{title}</h1>
      <input className="search" placeholder="Search customer, order no, phone…" />
      <div className="right">
        <button type="button" className="icon-btn" title="Notifications"><Icon name="bell" size={16} /></button>
        <button type="button" className="icon-btn" onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
  );
}
