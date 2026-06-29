UPDATE "segment_customer_memberships"
SET "source" = 'shopify_native'
WHERE "shopify_segment_ref" IS NOT NULL
  AND "source" <> 'shopify_native';

UPDATE "auth_tokens"
SET "metadata" = '{}'::jsonb
WHERE "metadata" @> '{"source":"roadmap-1-live-ui-proof"}'::jsonb;
