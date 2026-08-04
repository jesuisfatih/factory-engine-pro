import {
  reactExtension,
  useApi,
  AdminBlock,
  Badge,
  Banner,
  BlockStack,
  Button,
  InlineStack,
  Text,
} from '@shopify/ui-extensions-react/admin';
import { useCallback, useEffect, useState } from 'react';
import type { ShopifyAbandonedCheckoutContext } from '@factory-engine-pro/contracts';

const TARGET = 'admin.abandoned-checkout-details.block.render';
const DEFAULT_API_BASE_URL = 'https://api.dtfbank.com/api/v1';

type CheckoutData = {
  node?: {
    id: string;
    customer?: { id: string; email?: string | null; phone?: string | null } | null;
    billingAddress?: { phone?: string | null } | null;
    shippingAddress?: { phone?: string | null } | null;
  } | null;
};

export default reactExtension(TARGET, () => <AbandonedCheckoutContextBlock />);

function AbandonedCheckoutContextBlock() {
  const { auth, data, query } = useApi(TARGET);
  const checkoutId = data.selected?.[0]?.id;
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<ShopifyAbandonedCheckoutContext | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!checkoutId) {
      setError('Shopify did not provide an abandoned checkout id.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError('');
    try {
      const checkout = await query<CheckoutData, { id: string }>(`
        query FactoryEngineAbandonedCheckout($id: ID!) {
          node(id: $id) {
            ... on AbandonedCheckout {
              id
              customer { id email phone }
              billingAddress { phone }
              shippingAddress { phone }
            }
          }
        }
      `, { variables: { id: checkoutId }, version: '2025-07' });
      if (checkout.errors?.length) throw new Error(checkout.errors[0]?.message || 'Checkout could not be read.');
      const token = await auth.idToken();
      if (!token) throw new Error('Shopify admin authentication is unavailable.');
      const row = checkout.data?.node;
      const phones = unique([row?.customer?.phone, row?.billingAddress?.phone, row?.shippingAddress?.phone]);
      const response = await fetch(`${DEFAULT_API_BASE_URL}/shopify-admin/abandoned-checkout/context`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          checkoutId,
          shopifyCustomerId: row?.customer?.id,
          email: row?.customer?.email || undefined,
          phone: phones[0],
          alternatePhones: phones.slice(1),
        }),
      });
      const payload = await response.json() as ShopifyAbandonedCheckoutContext | { message?: string };
      if (!response.ok) throw new Error('message' in payload && payload.message ? payload.message : 'Contact context could not be loaded.');
      setContext(payload as ShopifyAbandonedCheckoutContext);
    } catch (loadError) {
      setContext(null);
      setError(loadError instanceof Error ? loadError.message : 'Contact context could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [auth, checkoutId, query]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(true); }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <AdminBlock title="Customer contact context" collapsedSummary={context?.contactState?.active ? 'Call in progress' : 'Team context'}>
      <BlockStack gap="base">
        {loading ? <Text>Checking calls and internal notes...</Text> : null}
        {error ? (
          <Banner tone="critical" title="Contact context could not load">
            <BlockStack gap="small">
              <Text>{error}</Text>
              <Button variant="secondary" onPress={() => { void load(); }}>Try again</Button>
            </BlockStack>
          </Banner>
        ) : null}
        {!loading && !error && !context?.matched ? (
          <Banner tone="info" title="No linked customer yet">
            <Text>{context?.staffMessage || 'No Factory Engine customer matched this checkout.'}</Text>
          </Banner>
        ) : null}
        {context?.matched ? <MatchedContext context={context} /> : null}
        {!loading && !error ? <Button variant="secondary" onPress={() => { void load(); }}>Refresh context</Button> : null}
      </BlockStack>
    </AdminBlock>
  );
}

function MatchedContext({ context }: { context: ShopifyAbandonedCheckoutContext }) {
  const active = Boolean(context.contactState?.active);
  return (
    <BlockStack gap="base">
      {active ? (
        <Banner tone="warning" title="A team member is calling this customer now">
          <Text>{context.contactState?.label}</Text>
        </Banner>
      ) : null}
      <InlineStack gap="base" blockAlignment="center">
        <Text fontWeight="bold">{context.customer?.name || 'Customer'}</Text>
        <Badge tone={active ? 'warning' : 'info'}>{active ? 'Call in progress' : 'Contact context'}</Badge>
      </InlineStack>
      <BlockStack gap="small">
        {context.customer?.email ? <Text>Email: {context.customer.email}</Text> : null}
        {context.customer?.phone ? <Text>Phone: {context.customer.phone}</Text> : null}
        <Text>{context.staffMessage}</Text>
      </BlockStack>
      {context.latestNote ? (
        <Banner tone="info" title="Latest internal note">
          <BlockStack gap="small">
            <Text>{context.latestNote.body}</Text>
            <Text>{context.latestNote.authorName} - {formatDate(context.latestNote.createdAt)}</Text>
          </BlockStack>
        </Banner>
      ) : null}
      {context.contactState && !active ? (
        <InlineStack gap="small">
          <Badge tone="success">Last contact</Badge>
          <Text>{context.contactState.label}</Text>
        </InlineStack>
      ) : null}
    </BlockStack>
  );
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
