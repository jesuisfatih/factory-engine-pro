UPDATE "member_roles"
SET
  "permissions" = "permissions" || '{
    "mail.template.read": true,
    "mail.template.write": true,
    "mail.template.approve": true,
    "mail.template.publish": true,
    "mail.delivery.read": true,
    "mail.delivery.retry": true,
    "mail.suppression.read": true,
    "mail.suppression.write": true,
    "mail.settings.read": true,
    "mail.settings.write": true,
    "mail.marketing.contact.read": true,
    "mail.marketing.contact.write": true,
    "mail.marketing.audience.read": true,
    "mail.marketing.audience.write": true,
    "mail.marketing.campaign.read": true,
    "mail.marketing.campaign.write": true,
    "mail.marketing.campaign.approve": true,
    "mail.marketing.campaign.publish": true,
    "mail.marketing.flow.read": true,
    "mail.marketing.flow.write": true,
    "mail.marketing.flow.publish": true
  }'::jsonb,
  "updated_at" = NOW()
WHERE "slug" IN ('owner', 'admin');
