import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export const workspaceBrandQueryKey = ['identity', 'workspace-brand'];

export function useWorkspaceBrand() {
  const query = useQuery({
    queryKey: workspaceBrandQueryKey,
    queryFn: () => accountsApi.workspaceBrand(),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const faviconUrl = query.data?.brandAssets.faviconUrl?.trim();
  useEffect(() => {
    if (!faviconUrl) return;
    let icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.append(icon);
    }
    icon.href = faviconUrl;
    icon.type = faviconUrl.toLowerCase().includes('.png') ? 'image/png' : 'image/jpeg';
  }, [faviconUrl]);
  return query;
}

export function useOrderHistoryPortalMode() {
  return useWorkspaceBrand().data?.accountPortalExperience.portalMode === 'order_history';
}

export function workspaceName(value: string | null | undefined) {
  return value?.trim() || import.meta.env.VITE_WORKSPACE_NAME || 'Workspace';
}

export function workspaceBadge(value: string | null | undefined, name: string) {
  const source = value?.trim() || name;
  return source
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'WS';
}
