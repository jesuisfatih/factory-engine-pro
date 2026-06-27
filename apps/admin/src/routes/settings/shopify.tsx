import { createFileRoute } from '@tanstack/react-router';
import { SettingsForm } from '@/components/SettingsForm';

function ShopifySettingsView() {
  return (
    <SettingsForm
      formId="form-shopify"
      titleKey="settings.shopify.title"
      subtitleKey="settings.shopify.subtitle"
      fields={[
        { id: 'field-shopify-shop-domain', labelKey: 'settings.shopify.field_shop_domain', placeholder: 'your-store.myshopify.com' },
        { id: 'field-shopify-admin-token', labelKey: 'settings.shopify.field_admin_token', type: 'password', placeholder: 'shpat_••••' },
        { id: 'field-shopify-storefront-token', labelKey: 'settings.shopify.field_storefront_token', type: 'password', placeholder: 'shpsa_••••' },
        { id: 'field-shopify-webhook-secret', labelKey: 'settings.shopify.field_webhook_secret', type: 'password', placeholder: 'webhook signing secret' },
      ]}
    />
  );
}

export const Route = createFileRoute('/settings/shopify')({ component: ShopifySettingsView });
