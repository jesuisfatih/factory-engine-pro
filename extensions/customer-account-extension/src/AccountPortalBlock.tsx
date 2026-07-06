import {
  reactExtension,
  useApi,
  useSettings,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Heading,
  InlineStack,
  Text,
  TextBlock,
} from '@shopify/ui-extensions-react/customer-account';
import { useCallback, useEffect, useState } from 'react';
import { apiBaseError, apiFetch } from './api';
import { buildPortalLink, portalParamsFromStatus, type PortalLinkStatusContext } from './portal-links';

export default reactExtension(
  'customer-account.profile.block.render',
  () => <AccountPortalBlock />,
);

function AccountPortalBlock() {
  const { sessionToken } = useApi();
  const settings = useSettings<{ accounts_url?: string; api_base_url?: string }>();
  const accountsUrl = normalizePortalUrl(settings.accounts_url);
  const apiBaseUrl = settings.api_base_url?.trim();
  const [linkStatus, setLinkStatus] = useState<PortalLinkStatusContext | null>(null);

  const loadStatus = useCallback(async () => {
    if (apiBaseError(apiBaseUrl)) return;
    try {
      const token = await sessionToken.get();
      setLinkStatus(await apiFetch<PortalLinkStatusContext>(apiBaseUrl, '/link-status', token));
    } catch {
      setLinkStatus(null);
    }
  }, [apiBaseUrl, sessionToken]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!accountsUrl) {
    return (
      <Card padding>
        <BlockStack spacing="base">
          <Heading level={2}>Factory Engine portal</Heading>
          <Banner status="warning" title="Portal URL is not configured">
            <TextBlock>Set the Accounts Portal URL in this extension settings to enable account login, registration, and B2B access links.</TextBlock>
          </Banner>
        </BlockStack>
      </Card>
    );
  }
  const portalParams = portalParamsFromStatus(linkStatus);

  return (
    <Card padding>
      <BlockStack spacing="base">
        <InlineStack spacing="base">
          <Badge status="info">B2B portal</Badge>
          <Badge>Orders</Badge>
          <Badge>Invoices</Badge>
          <Badge>Reorder</Badge>
        </InlineStack>
        <BlockStack spacing="tight">
          <Heading level={2}>Factory Engine account portal</Heading>
          <Text appearance="subdued">
            Open your DTF Bank buying portal for order details, item-level reorder, invoices, documents, and company team access.
          </Text>
        </BlockStack>
        <InlineStack spacing="base">
          <Button to={buildPortalLink(accountsUrl, '/', portalParams)}>Open portal</Button>
          <Button kind="secondary" to={buildPortalLink(accountsUrl, '/request-invitation', portalParams)}>Request B2B access</Button>
          <Button kind="secondary" to={buildPortalLink(accountsUrl, '/login', portalParams)}>Sign in</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function normalizePortalUrl(url?: string) {
  if (!url?.trim() || !url.startsWith('https://')) return '';
  return url.replace(/\/+$/, '');
}
