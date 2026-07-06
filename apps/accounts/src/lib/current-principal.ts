import { useQuery } from '@tanstack/react-query';
import { CUSTOMER_PERMISSIONS, type AuthSession } from '@factory-engine-pro/contracts';
import { accountsApi, readSession } from '@/lib/api';

type Principal = AuthSession['principal'];
type RouteAccessRule = {
  test: RegExp;
  permissions: string[];
  title: string;
  body: string;
};

const ROUTE_ACCESS: RouteAccessRule[] = [
  {
    test: /^\/$/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Account home is not available',
    body: 'Ask the account owner to activate your portal access.',
  },
  {
    test: /^\/orders/,
    permissions: [CUSTOMER_PERMISSIONS.ordersRead],
    title: 'Order history is not available for this login',
    body: 'Ask the account owner for order visibility before opening order history.',
  },
  {
    test: /^\/tracking/,
    permissions: [CUSTOMER_PERMISSIONS.ordersRead],
    title: 'Tracking is not available for this login',
    body: 'Ask the account owner for order visibility before opening tracking.',
  },
  {
    test: /^\/pickup/,
    permissions: [CUSTOMER_PERMISSIONS.ordersRead],
    title: 'Pickup details are not available for this login',
    body: 'Ask the account owner for order visibility before opening pickup details.',
  },
  {
    test: /^\/cart/,
    permissions: [CUSTOMER_PERMISSIONS.cartWrite],
    title: 'Cart access is not enabled',
    body: 'Ask the account owner for buyer access before creating or checking out reorder carts.',
  },
  {
    test: /^\/products/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Product catalog is not available',
    body: 'Ask the account owner to activate your portal access.',
  },
  {
    test: /^\/reorder/,
    permissions: [CUSTOMER_PERMISSIONS.ordersReorder],
    title: 'Reorder access is not enabled',
    body: 'Ask the account owner for buyer access before reordering previous items.',
  },
  {
    test: /^\/invoices/,
    permissions: [CUSTOMER_PERMISSIONS.invoicesRead],
    title: 'Invoices are not available for this login',
    body: 'Ask the account owner for billing access before opening official invoices.',
  },
  {
    test: /^\/documents/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Documents are not available',
    body: 'Ask the account owner to activate your portal access.',
  },
  {
    test: /^\/profile/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Profile is not available',
    body: 'Ask the account owner to activate your portal access.',
  },
  {
    test: /^\/addresses/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Addresses are not available',
    body: 'Ask the account owner to activate your portal access.',
  },
  {
    test: /^\/team/,
    permissions: [CUSTOMER_PERMISSIONS.subUsersRead],
    title: 'Company team is not available for this login',
    body: 'Only account owners and delegated team admins can view company team seats.',
  },
  {
    test: /^\/support/,
    permissions: [CUSTOMER_PERMISSIONS.accountRead],
    title: 'Customer requests are not available',
    body: 'Ask the account owner to activate your portal access before opening customer requests.',
  },
];

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
  if (permissions.has(CUSTOMER_PERMISSIONS.subUsersWrite)) return 'B2B Admin';
  if (permissions.has(CUSTOMER_PERMISSIONS.cartWrite) || permissions.has(CUSTOMER_PERMISSIONS.ordersReorder)) return 'Buyer';
  if (permissions.has(CUSTOMER_PERMISSIONS.invoicesRead)) return 'Accounting';
  if (permissions.has(CUSTOMER_PERMISSIONS.accountRead)) return 'Viewer';
  return principal ? 'Customer user' : 'No session';
}

export function accountRouteAccess(pathname: string, principal: Principal | undefined) {
  const rule = ROUTE_ACCESS.find((item) => item.test.test(pathname));
  if (!rule) {
    return {
      allowed: true,
      title: '',
      body: '',
    };
  }
  const permissions = new Set(principal?.permissions ?? []);
  const allowed = rule.permissions.every((permission) => permissions.has(permission));
  return {
    allowed,
    title: rule.title,
    body: rule.body,
  };
}
