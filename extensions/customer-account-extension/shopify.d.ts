import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/CustomerAccountPage.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.page.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/AccountPortalBlock.tsx' {
  const shopify: import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/api.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.page.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/portal-links.ts' {
  const shopify:
    | import('@shopify/ui-extensions/customer-account.page.render').Api
    | import('@shopify/ui-extensions/customer-account.profile.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
