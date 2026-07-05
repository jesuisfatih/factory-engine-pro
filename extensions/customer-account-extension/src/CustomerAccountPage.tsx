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

function CustomerAccountPage() {
  const { sessionToken } = useApi();
  const settings = useSettings<{ api_base_url?: string; accounts_url?: string }>();
  const apiBaseUrl = settings.api_base_url?.trim();
  const accountsUrl = normalizePortalUrl(settings.accounts_url);
  const configError = apiBaseError(apiBaseUrl);
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<AccountContext | null>(null);
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
              {accountsUrl ? <Button to={accountsUrl}>Open full portal</Button> : null}
            </InlineStack>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  if (!context) {
    return (
      <Page title="Account desk">
        <EmptyState accountsUrl={accountsUrl} />
      </Page>
    );
  }

  const companyName = context.profile.companyName || context.profile.company || 'Your account';
  const primaryAction = context.activeCart?.checkoutUrl
    ? { label: 'Continue checkout', href: context.activeCart.checkoutUrl }
    : accountsUrl
      ? { label: 'Open full portal', href: accountsUrl }
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
          <RecentOrders orders={context.orders} accountsUrl={accountsUrl} />
          <OpenInvoices invoices={context.invoices} accountsUrl={accountsUrl} />
          <ReorderReady templates={context.reorderTemplates} accountsUrl={accountsUrl} />
        </Grid>

        <CartState cart={context.activeCart} accountsUrl={accountsUrl} />
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

function RecentOrders({ orders, accountsUrl }: { orders: AccountContext['orders']; accountsUrl: string }) {
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
        {accountsUrl ? <Button kind="secondary" to={`${accountsUrl}/orders`}>View orders</Button> : null}
      </BlockStack>
    </Card>
  );
}

function OpenInvoices({ invoices, accountsUrl }: { invoices: AccountContext['invoices']; accountsUrl: string }) {
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
        {accountsUrl ? <Button kind="secondary" to={`${accountsUrl}/invoices`}>Review invoices</Button> : null}
      </BlockStack>
    </Card>
  );
}

function ReorderReady({ templates, accountsUrl }: { templates: AccountContext['reorderTemplates']; accountsUrl: string }) {
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
        {accountsUrl ? <Button kind="secondary" to={`${accountsUrl}/reorder`}>Start reorder</Button> : null}
      </BlockStack>
    </Card>
  );
}

function CartState({ cart, accountsUrl }: { cart: AccountContext['activeCart']; accountsUrl: string }) {
  const action = cart?.checkoutUrl
    ? { label: 'Continue checkout', href: cart.checkoutUrl }
    : accountsUrl
      ? { label: 'Open cart review', href: `${accountsUrl}/cart` }
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

function EmptyState({ accountsUrl }: { accountsUrl: string }) {
  return (
    <Card padding>
      <BlockStack spacing="base">
        <Heading level={2}>No account activity yet</Heading>
        <Text appearance="subdued">
          Orders, invoices, reorder templates, and cart state will appear here once they are linked to this customer.
        </Text>
        {accountsUrl ? <Button to={accountsUrl}>Open full portal</Button> : null}
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
