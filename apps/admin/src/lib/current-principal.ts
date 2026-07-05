import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { MEMBER_PERMISSIONS, type AuthSession } from '@factory-engine-pro/contracts';
import { adminApi, readSession, readSessionSnapshot, subscribeSession } from '@/lib/api';

type Principal = AuthSession['principal'];

let sessionRefreshStarted = false;
let sessionRefreshPromise: Promise<void> | null = null;

export function useCurrentPrincipal() {
  const sessionSnapshot = useSyncExternalStore(subscribeSession, readSessionSnapshot, () => null);
  const session = useMemo(() => readSession(), [sessionSnapshot]);
  const principal = session?.principal;
  useEffect(() => {
    if (!session?.refreshToken || sessionRefreshStarted) return;
    sessionRefreshStarted = true;
    sessionRefreshPromise ??= adminApi.refreshSession()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        sessionRefreshPromise = null;
      });
  }, [session?.refreshToken]);
  return useMemo(
    () => ({
      data: principal,
      isLoading: false,
      isError: false,
      error: null,
      refetch: async () => {
        await (sessionRefreshPromise ?? adminApi.refreshSession().then(() => undefined).catch(() => undefined));
        return { data: readSession()?.principal ?? principal };
      },
    }),
    [principal],
  );
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
  if (permissions.has(MEMBER_PERMISSIONS.rolesWrite) && permissions.has(MEMBER_PERMISSIONS.settingsWrite)) return 'Owner';
  if (permissions.has(MEMBER_PERMISSIONS.membersWrite)) return 'Admin';
  if (permissions.has(MEMBER_PERMISSIONS.commissionSubmit)) return 'Sales Personel';
  if (
    permissions.has(MEMBER_PERMISSIONS.supportWrite)
    && permissions.has(MEMBER_PERMISSIONS.customersWrite)
    && !permissions.has(MEMBER_PERMISSIONS.ordersWrite)
  ) return 'Customer Service';
  if (permissions.has(MEMBER_PERMISSIONS.taskAssign)) return 'Agent';
  return principal ? 'Member' : 'No session';
}
