import { useQuery } from '@tanstack/react-query';
import type { AuthSession } from '@factory-engine-pro/contracts';
import { accountsApi, readSession } from '@/lib/api';

type Principal = AuthSession['principal'];

export function useCurrentPrincipal() {
  const session = readSession();
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => accountsApi.me(),
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

export function customerRoleLabel(principal: Principal | undefined) {
  const permissions = new Set(principal?.permissions ?? []);
  if (permissions.has('spending_limits.write')) return 'B2B Admin';
  if (permissions.has('orders.create')) return 'B2B User';
  return principal ? 'Customer user' : 'No session';
}
