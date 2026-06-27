import { useQuery } from '@tanstack/react-query';
import type { AuthSession } from '@factory-engine-pro/contracts';
import { adminApi, readSession } from '@/lib/api';

type Principal = AuthSession['principal'];

export function useCurrentPrincipal() {
  const session = readSession();
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => adminApi.me(),
    enabled: Boolean(session?.accessToken),
    initialData: session?.principal,
    retry: false,
  });
}

export function principalName(principal: Principal | undefined) {
  if (!principal) return 'Signed out';
  return `${principal.firstName} ${principal.lastName}`.trim() || principal.email;
}

export function principalInitials(principal: Principal | undefined) {
  const source = principal ? principalName(principal) : 'Workspace';
  return source
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function adminRoleLabel(principal: Principal | undefined) {
  const permissions = new Set(principal?.permissions ?? []);
  if (permissions.has('roles.write') && permissions.has('settings.write')) return 'Owner';
  if (permissions.has('members.write')) return 'Admin';
  if (permissions.has('task.assign')) return 'Agent';
  return principal ? 'Member' : 'No session';
}
