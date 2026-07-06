import {
  reactExtension,
  useApi,
  useSettings,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Divider,
  Grid,
  Heading,
  InlineLayout,
  InlineStack,
  Page,
  SkeletonTextBlock,
  Text,
  TextBlock,
} from '@shopify/ui-extensions-react/customer-account';
import { useCallback, useEffect, useState } from 'react';
import { apiBaseError, apiFetch } from './api';
import { buildPortalLink, portalParamsFromStatus } from './portal-links';

export default reactExtension(
  'customer-account.page.render',
  () => <CustomerAccountPage />,
);

type AccountContext = {
  profile: {
    companyName?: string;
    company?: string;
    firstName?: string;
    email?: string;
  };
  orders: Array<{
    id: string;
    orderNumber: string;
    placedAt: string;
    status: string;
    totalUsd: number;
    canReorder: boolean;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    balanceUsd: number;
    canPay: boolean;
    hasFile: boolean;
  }>;
  reorderTemplates: Array<{
    id: string;
    name: string;
    canReorder: boolean;
    items: Array<{ id: string; name: string; canReorder: boolean }>;
  }>;
  activeCart: null | {
    id: string;
    status: string;
    itemCount: number;
    checkoutUrl?: string | null;
  };
  summary: {
    recentOrders: number;
    openInvoices: number;
    reorderReady: number;
    hasActiveCart: boolean;
  };
};

type AccountLinkStatus = {
  shopDomain: string;
  shopifyCustomerId: string;
  hasPortalAccount: boolean;
  status: 'portal_ready' | 'portal_account_required' | 'customer_sync_required' | string;
  customer: null | {
    id: string;
    email: string | null;
    companyName: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    status: string;
  };
  customerUser: null | {
    id: string;
    email: string;
    status: string;
  };
  b2bAccessRequest: null | {
    id: string;
    status: string;
    submittedAt: string;
    reviewedAt: string | null;
  };
  message: string;
};

function CustomerAccountPage() {
  const { sessionToken } = useApi();
  const settings = useSettings<{ api_base_url?: string; accounts_url?: string }>();
  const apiBaseUrl = settings.api_base_url?.trim();
  const accountsUrl = normalizePortalUrl(settings.accounts_url);
  const configError = apiBaseError(apiBaseUrl);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<AccountContext | null>(null);
  const [linkStatus, setLinkStatus] = useState<AccountLinkStatus | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (configError) {
      setError(configError);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await sessionToken.get();
      const status = await apiFetch<AccountLinkStatus>(apiBaseUrl, '/link-status', token);
      setLinkStatus(status);
      if (!status.hasPortalAccount) {
        setContext(null);
        return;
      }
      const payload = await apiFetch<AccountContext>(apiBaseUrl, '/context', token);
      setContext(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Account services could not load.');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, configError, sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Page title="Account desk">
        <BlockStack spacing="loose">
          <Card padding>
            <SkeletonTextBlock />
          </Card>
          <Grid columns={['fill', 'fill', 'fill']} spacing="base">
            <Card padding><SkeletonTextBlock /></Card>
            <Card padding><SkeletonTextBlock /></Card>
            <Card padding><SkeletonTextBlock /></Card>
          </Grid>
        </BlockStack>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Account desk">
        <Card padding>
          <BlockStack spacing="base">
            <Heading level={2}>Account services need attention</Heading>
            <Text appearance="subdued">
              Orders, invoices, and reorder actions could not be loaded inside Shopify.
            </Text>
            <Banner status="critical" title="Could not load account desk">
              <TextBlock>{error}</TextBlock>
            </Banner>
            <InlineStack spacing="base">
              <Button kind="secondary" onPress={load}>Try again</Button>
              {accountsUrl ? <Button to={buildPortalLink(accountsUrl, '/', portalParamsFromStatus(linkStatus))}>Open full portal</Button> : null}
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (!context) {
    return (
      <Page title="Account desk">
        <AccountSetupState linkStatus={linkStatus} accountsUrl={accountsUrl} />
      </Page>
    );
  }

  const companyName = context.profile.companyName || context.profile.company || 'Your account';
  const portalParams = portalParamsFromStatus(linkStatus);
  const primaryAction = context.activeCart?.checkoutUrl
    ? { label: 'Continue checkout', href: context.activeCart.checkoutUrl }
    : accountsUrl
      ? { label: 'Open full portal', href: buildPortalLink(accountsUrl, '/', portalParams) }
      : null;

  return (
    <Page title="Account desk">
      <BlockStack spacing="loose">
        <Card padding>
          <BlockStack spacing="base">
            <InlineLayout columns={['fill', 'auto']} spacing="base">
              <BlockStack spacing="tight">
                <Heading level={1}>{companyName}</Heading>
                <Text appearance="subdued">
                  Review recent orders, open invoices, reorder-ready items, and active cart state.
                </Text>
              </BlockStack>
              {primaryAction ? <Button to={primaryAction.href}>{primaryAction.label}</Button> : null}
            </InlineLayout>
            <DecisionStrip context={context} />
          </BlockStack>
        </Card>

        <Grid columns={['fill', 'fill', 'fill']} spacing="base">
          <RecentOrders orders={context.orders} accountsUrl={accountsUrl} portalParams={portalParams} />
          <OpenInvoices invoices={context.invoices} accountsUrl={accountsUrl} portalParams={portalParams} />
          <ReorderReady templates={context.reorderTemplates} accountsUrl={accountsUrl} portalParams={portalParams} />
        </Grid>

        <CartState cart={context.activeCart} accountsUrl={accountsUrl} portalParams={portalParams} />
      </BlockStack>
    </Page>
  );
}

function DecisionStrip({ context }: { context: AccountContext }) {
  return (
    <Grid columns={['fill', 'fill', 'fill', 'fill']} spacing="base">
      <Metric label="Recent orders" value={String(context.summary.recentOrders)} detail="available to inspect" />
      <Metric label="Open invoices" value={String(context.summary.openInvoices)} detail="need review or payment" />
      <Metric label="Reorder-ready" value={String(context.summary.reorderReady)} detail="templates with eligible items" />
      <Metric label="Cart state" value={context.summary.hasActiveCart ? 'Active' : 'None'} detail="checkout or review status" />
    </Grid>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card padding>
      <BlockStack spacing="tight">
        <Text appearance="subdued" size="small">{label}</Text>
        <Heading level={2}>{value}</Heading>
        <Text appearance="subdued" size="small">{detail}</Text>
      </BlockStack>
    </Card>
  );
}

function RecentOrders({
  orders,
  accountsUrl,
  portalParams,
}: {
  orders: AccountContext['orders'];
  accountsUrl: string;
  portalParams: Record<string, string>;
}) {
  return (
    <Card padding>
      <BlockStack spacing="base">
        <Heading level={2}>Recent orders</Heading>
        <Text appearance="subdued">Open the full portal for line items, properties, files, and item-level reorder.</Text>
        <Divider />
        {orders.length === 0 ? (
          <Text appearance="subdued">No synced orders are linked to this customer yet.</Text>
        ) : orders.map((order) => (
          <InlineLayout key={order.id} columns={['fill', 'auto']} spacing="base">
            <BlockStack spacing="tight">
              <Text emphasis="bold">{order.orderNumber}</Text>
              <Text appearance="subdued" size="small">{order.status} - ${order.totalUsd.toFixed(2)}</Text>
            </BlockStack>
            {order.canReorder ? <Badge status="success">Reorder ready</Badge> : <Badge>View</Badge>}
          </InlineLayout>
        ))}
        {accountsUrl ? <Button kind="secondary" to={buildPortalLink(accountsUrl, '/orders', portalParams)}>View orders</Button> : null}
      </BlockStack>
    </Card>
  );
}

function OpenInvoices({
  invoices,
  accountsUrl,
  portalParams,
}: {
  invoices: AccountContext['invoices'];
  accountsUrl: string;
  portalParams: Record<string, string>;
}) {
  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid');
  return (
    <Card padding>
      <BlockStack spacing="base">
        <Heading level={2}>Invoices</Heading>
        <Text appearance="subdued">Payable, download-only, and paid states stay separated.</Text>
        <Divider />
        {openInvoices.length === 0 ? (
          <Text appearance="subdued">No open invoices need action right now.</Text>
        ) : openInvoices.map((invoice) => (
          <InlineLayout key={invoice.id} columns={['fill', 'auto']} spacing="base">
            <BlockStack spacing="tight">
              <Text emphasis="bold">{invoice.invoiceNumber}</Text>
              <Text appearance="subdued" size="small">${invoice.balanceUsd.toFixed(2)} balance</Text>
            </BlockStack>
            <Badge status={invoice.canPay ? 'attention' : 'info'}>
              {invoice.canPay ? 'Payment link ready' : invoice.hasFile ? 'Download' : 'Contact billing'}
            </Badge>
          </InlineLayout>
        ))}
        {accountsUrl ? <Button kind="secondary" to={buildPortalLink(accountsUrl, '/invoices', portalParams)}>Review invoices</Button> : null}
      </BlockStack>
    </Card>
  );
}

function ReorderReady({
  templates,
  accountsUrl,
  portalParams,
}: {
  templates: AccountContext['reorderTemplates'];
  accountsUrl: string;
  portalParams: Record<string, string>;
}) {
  const ready = templates.filter((template) => template.canReorder);
  return (
    <Card padding>
      <BlockStack spacing="base">
        <Heading level={2}>Reorder</Heading>
        <Text appearance="subdued">Only eligible reorder items are presented as ready.</Text>
        <Divider />
        {ready.length === 0 ? (
          <Text appearance="subdued">No reorder-ready templates are available yet.</Text>
        ) : ready.slice(0, 3).map((template) => (
          <BlockStack key={template.id} spacing="tight">
            <InlineLayout columns={['fill', 'auto']} spacing="base">
              <Text emphasis="bold">{template.name}</Text>
              <Badge status="success">{template.items.filter((item) => item.canReorder).length} items</Badge>
            </InlineLayout>
          </BlockStack>
        ))}
        {accountsUrl ? <Button kind="secondary" to={buildPortalLink(accountsUrl, '/reorder', portalParams)}>Start reorder</Button> : null}
      </BlockStack>
    </Card>
  );
}

function CartState({
  cart,
  accountsUrl,
  portalParams,
}: {
  cart: AccountContext['activeCart'];
  accountsUrl: string;
  portalParams: Record<string, string>;
}) {
  const action = cart?.checkoutUrl
    ? { label: 'Continue checkout', href: cart.checkoutUrl }
    : accountsUrl
      ? { label: 'Open cart review', href: buildPortalLink(accountsUrl, '/cart', portalParams) }
      : null;
  return (
    <Card padding>
      <InlineLayout columns={['fill', 'auto']} spacing="base">
        <BlockStack spacing="tight">
          <Heading level={2}>Cart and review state</Heading>
          {cart ? (
            <Text appearance="subdued">
              {cart.itemCount} items · {customerCartStatus(cart.status)}
            </Text>
          ) : (
            <Text appearance="subdued">No active reorder cart is waiting for review.</Text>
          )}
        </BlockStack>
        {action ? <Button to={action.href}>{action.label}</Button> : null}
      </InlineLayout>
    </Card>
  );
}

function AccountSetupState({ linkStatus, accountsUrl }: { linkStatus: AccountLinkStatus | null; accountsUrl: string }) {
  const hasPendingRequest = linkStatus?.b2bAccessRequest?.status === 'pending';
  const portalParams = portalParamsFromStatus(linkStatus);
  const title = linkStatus?.status === 'customer_sync_required'
    ? 'Portal account is not linked yet'
    : hasPendingRequest
      ? 'B2B access request is under review'
      : 'Set up your buying portal';
  const body = hasPendingRequest
    ? 'Your B2B access request has been received. The buying portal opens after the account is approved and activated.'
    : 'This Shopify customer account can be connected to Factory Engine for order detail, invoices, item-level reorder, and B2B team access.';
  return (
    <Card padding>
      <BlockStack spacing="base">
        <Heading level={2}>{title}</Heading>
        <Text appearance="subdued">{body}</Text>
        {linkStatus?.b2bAccessRequest ? (
          <Banner status={hasPendingRequest ? 'info' : 'warning'} title="B2B access status">
            <TextBlock>
              Request {linkStatus.b2bAccessRequest.status} - submitted {formatDate(linkStatus.b2bAccessRequest.submittedAt)}
            </TextBlock>
          </Banner>
        ) : null}
        <InlineStack spacing="base">
          {accountsUrl ? <Button to={buildPortalLink(accountsUrl, '/request-invitation', portalParams)}>Request B2B access</Button> : null}
          {accountsUrl ? <Button kind="secondary" to={buildPortalLink(accountsUrl, '/register', portalParams)}>Create portal login</Button> : null}
          {accountsUrl ? <Button kind="secondary" to={buildPortalLink(accountsUrl, '/login', portalParams)}>Sign in</Button> : null}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function normalizePortalUrl(url?: string) {
  if (!url?.trim() || !url.startsWith('https://')) return '';
  return url.replace(/\/+$/, '');
}

function customerCartStatus(status: string) {
  if (status === 'checkout_ready') return 'checkout link ready';
  if (status === 'review_required') return 'account review required';
  if (status === 'unavailable') return 'some items are unavailable';
  return status.replace(/_/g, ' ');
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
