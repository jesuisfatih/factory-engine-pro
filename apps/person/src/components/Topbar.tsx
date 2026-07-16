import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon } from './Icon';
import { syncPersonTasks } from '../api/live';
import { useTheme } from '../theme';
import { resolveBrandLogoUrl } from '@factory-engine-pro/contracts';
import { useWorkspaceBrand, workspaceBadge, workspaceName } from '../lib/workspace-brand';

interface Props {
  title: string;
  onToggleSidebar: () => void;
}

export function Topbar({ title, onToggleSidebar }: Props) {
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();
  const brandQuery = useWorkspaceBrand();
  const brandName = workspaceName(brandQuery.data?.workspaceName);
  const brandBadge = workspaceBadge(brandQuery.data?.brandBadge, brandName);
  const brandLogo = resolveBrandLogoUrl(brandQuery.data?.brandAssets, brandQuery.data?.brandLogo, theme === 'dark' ? 'dark' : 'light');
  const [search, setSearch] = useState(() => currentSearchFromUrl());
  const syncTasks = useMutation({
    mutationFn: syncPersonTasks,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['person'] });
    },
  });

  useEffect(() => {
    const syncFromUrl = () => setSearch(currentSearchFromUrl());
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const goTo = (path: string) => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim();
    goTo(query ? `/staff/customer-archive?q=${encodeURIComponent(query)}` : '/staff/customer-archive');
  };

  return (
    <header className="topbar">
      <button type="button" className="toggle" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icon name="sidebar" size={16} />
      </button>
      <h1>{title}</h1>
      <form className="search-form" onSubmit={submitSearch}>
        <input
          className="search"
          placeholder="Search Shopify customer, e-mail, phone..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search Shopify customers"
        />
      </form>
      <div className="right">
        <div className="topbar-workspace" title={brandName}>
          {brandLogo ? <img src={brandLogo} alt="" /> : <span>{brandBadge}</span>}
          <strong>{brandName}</strong>
        </div>
        <button
          type="button"
          className="icon-btn topbar-update"
          onClick={() => syncTasks.mutate()}
          disabled={syncTasks.isPending}
          title="Pull latest calls and customer work"
        >
          {syncTasks.isPending ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          <span className="topbar-update-label">Update</span>
        </button>
        <button type="button" className="icon-btn" title="Notifications" onClick={() => goTo('/staff/notifications')}><Icon name="bell" size={16} /></button>
        <button type="button" className="icon-btn" onClick={toggle} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
  );
}

function currentSearchFromUrl() {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}
