import { createContext, useContext } from 'react';
import { useCurrentPrincipal } from '@/lib/current-principal';

export type RoleId = 'admin' | 'customer_service' | 'sales_service' | 'accounting' | 'support_lead' | 'viewer';

export const ROLES: RoleId[] = ['admin', 'customer_service', 'sales_service', 'accounting', 'support_lead', 'viewer'];

export type Permission = string;

export const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  admin: ['*'],
  customer_service: [
    'dashboard.view', 'team.view', 'segments.view',
    'tasks.view.self', 'tasks.view.team', 'tasks.update.self',
    'messages.send', 'support.read.team', 'support.write', 'calendar.write',
  ],
  sales_service: [
    'dashboard.view', 'team.view', 'segments.view',
    'tasks.view.self', 'tasks.update.self', 'commissions.view.self',
    'messages.send', 'support.write', 'calendar.write',
  ],
  accounting: [
    'dashboard.view', 'team.view', 'segments.view',
    'commissions.view.all', 'tasks.view.all',
    'messages.send',
  ],
  support_lead: [
    'dashboard.view', 'team.view', 'segments.view',
    'tasks.view.team', 'tasks.assign',
    'messages.send', 'support.read.team', 'support.write', 'calendar.write',
  ],
  viewer: ['dashboard.view'],
};

export interface CurrentRole {
  id: RoleId;
  label: string;
  email: string;
  name: string;
}

export const RoleContext = createContext<CurrentRole>({
  id: 'admin',
  label: 'Admin',
  email: 'owner@dtfbank.com',
  name: 'Muhammed A.',
});

export function useCurrentRole() {
  return useContext(RoleContext);
}

export function useCan(permission: Permission): boolean {
  const principal = useCurrentPrincipal();
  const perms = new Set(principal.data?.permissions ?? []);
  if (perms.has('*')) return true;
  return perms.has(permission);
}
