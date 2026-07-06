import {
  reactExtension,
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

export default reactExtension(
  'customer-account.profile.block.render',
  () => <AccountPortalBlock />,
);

function AccountPortalBlock() {
  const settings = useSettings<{ accounts_url?: string }>();
  const accountsUrl = normalizePortalUrl(settings.accounts_url);
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
          <Button to={accountsUrl}>Open portal</Button>
          <Button kind="secondary" to={`${accountsUrl}/request-invitation`}>Request B2B access</Button>
          <Button kind="secondary" to={`${accountsUrl}/login`}>Sign in</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function normalizePortalUrl(url?: string) {
  if (!url?.trim() || !url.startsWith('https://')) return '';
  return url.replace(/\/+$/, '');
}
