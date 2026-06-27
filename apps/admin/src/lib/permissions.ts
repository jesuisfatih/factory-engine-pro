import { createContext, useContext } from 'react';

export type RoleId = 'admin' | 'customer_service' | 'sales_service' | 'accounting' | 'support_lead' | 'viewer';

export const ROLES: RoleId[] = ['admin', 'customer_service', 'sales_service', 'accounting', 'support_lead', 'viewer'];

export type Permission =
  | '*'
  | 'dashboard.view'
  | 'team.view' | 'team.create' | 'team.update' | 'team.delete'
  | 'team.roles.write' | 'team.commissions.write'
  | 'segments.view' | 'segments.create' | 'segments.update' | 'segments.delete'
  | 'settings.view' | 'settings.write'
  | 'tasks.view.self' | 'tasks.view.team' | 'tasks.view.all'
  | 'tasks.update.self' | 'tasks.assign'
  | 'commissions.view.self' | 'commissions.view.all'
  | 'messages.send' | 'support.read.team' | 'support.write'
  | 'calendar.write';

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
  const role = useCurrentRole();
  const perms = ROLE_PERMISSIONS[role.id];
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}
