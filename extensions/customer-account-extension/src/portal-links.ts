export type PortalLinkStatusContext = {
  shopDomain?: string;
  shopifyCustomerId?: string;
  customer?: null | {
    email?: string | null;
    companyName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  };
  customerUser?: null | {
    email?: string | null;
  };
};

export function portalParamsFromStatus(status: PortalLinkStatusContext | null) {
  return compactParams({
    sourceSurface: 'shopify-customer-account',
    shop: status?.shopDomain,
    shopifyCustomerId: status?.shopifyCustomerId,
    email: status?.customer?.email ?? status?.customerUser?.email,
    companyName: status?.customer?.companyName,
    firstName: status?.customer?.firstName,
    lastName: status?.customer?.lastName,
    phone: status?.customer?.phone,
  });
}

export function buildPortalLink(
  accountsUrl: string,
  path = '/',
  params: Record<string, string | null | undefined> = {},
) {
  if (!accountsUrl) return '';
  const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const base = `${accountsUrl.replace(/\/+$/, '')}${normalizedPath}`;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value?.trim()) search.set(key, value.trim());
  }
  const suffix = search.toString();
  return suffix ? `${base}?${suffix}` : base;
}

function compactParams(input: Record<string, string | null | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => Boolean(value?.trim())),
  ) as Record<string, string>;
}
