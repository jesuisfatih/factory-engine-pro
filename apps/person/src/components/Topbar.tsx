import { Icon } from './Icon';
import { useTheme } from '../theme';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '../lib/workspace-brand';

interface Props {
  title: string;
  onToggleSidebar: () => void;
}

export function Topbar({ title, onToggleSidebar }: Props) {
  const { theme, toggle } = useTheme();
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  return (
    <header className="topbar">
      <button type="button" className="toggle" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icon name="sidebar" size={16} />
      </button>
      <h1>{title}</h1>
      <input className="search" placeholder="Search customer, order no, phone…" />
      <div className="right">
        <div className="topbar-workspace" title={brandName}>
          {brandQuery.data?.brandLogo ? <img src={brandQuery.data.brandLogo} alt="" /> : <span>{brandBadge}</span>}
          <strong>{brandName}</strong>
        </div>
        <button type="button" className="icon-btn" title="Notifications"><Icon name="bell" size={16} /></button>
        <button type="button" className="icon-btn" onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
  );
}
