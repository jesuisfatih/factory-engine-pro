import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export const workspaceBrandQueryKey = ['identity', 'workspace-brand'];

export function useWorkspaceBrand() {
  const query = useQuery({
    queryKey: workspaceBrandQueryKey,
    queryFn: () => adminApi.workspaceBrand(),
    retry: false,
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

export function workspaceName(value: string | null | undefined) {
  return value?.trim() || import.meta.env.VITE_WORKSPACE_NAME || 'Workspace';
}

export function workspaceBadge(value: string | null | undefined, name: string) {
  const explicit = value?.trim();
  if (explicit && explicit.length <= 6) return explicit.toUpperCase();
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'WS';
}
