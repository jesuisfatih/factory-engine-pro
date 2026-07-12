import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';

export const workspaceBrandQueryKey = ['identity', 'workspace-brand'];

export function useWorkspaceBrand() {
  return useQuery({
    queryKey: workspaceBrandQueryKey,
    queryFn: () => adminApi.workspaceBrand(),
    retry: false,
  });
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
