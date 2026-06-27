import { useQuery } from '@tanstack/react-query';
import { accountsApi } from '@/lib/api';

export const workspaceBrandQueryKey = ['identity', 'workspace-brand'];

export function useWorkspaceBrand() {
  return useQuery({
    queryKey: workspaceBrandQueryKey,
    queryFn: () => accountsApi.workspaceBrand(),
    retry: false,
  });
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
