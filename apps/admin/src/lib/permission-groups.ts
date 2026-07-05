import { MEMBER_PERMISSIONS } from '@factory-engine-pro/contracts';

export const SYSTEM_MAIL_PERMISSIONS = [
  MEMBER_PERMISSIONS.settingsRead,
  MEMBER_PERMISSIONS.mailDeliveryRead,
  MEMBER_PERMISSIONS.mailDeliveryRetry,
  MEMBER_PERMISSIONS.mailSuppressionRead,
  MEMBER_PERMISSIONS.mailSuppressionWrite,
  MEMBER_PERMISSIONS.mailSettingsRead,
  MEMBER_PERMISSIONS.mailSettingsWrite,
] as const;

export const MAIL_TEMPLATE_PERMISSIONS = [
  MEMBER_PERMISSIONS.settingsRead,
  MEMBER_PERMISSIONS.mailTemplateRead,
  MEMBER_PERMISSIONS.mailTemplateWrite,
  MEMBER_PERMISSIONS.mailTemplateApprove,
  MEMBER_PERMISSIONS.mailTemplatePublish,
] as const;

export const MAIL_MARKETING_PERMISSIONS = [
  MEMBER_PERMISSIONS.settingsRead,
  MEMBER_PERMISSIONS.mailMarketingContactRead,
  MEMBER_PERMISSIONS.mailMarketingContactWrite,
  MEMBER_PERMISSIONS.mailMarketingAudienceRead,
  MEMBER_PERMISSIONS.mailMarketingAudienceWrite,
  MEMBER_PERMISSIONS.mailMarketingCampaignRead,
  MEMBER_PERMISSIONS.mailMarketingCampaignWrite,
  MEMBER_PERMISSIONS.mailMarketingCampaignApprove,
  MEMBER_PERMISSIONS.mailMarketingCampaignPublish,
  MEMBER_PERMISSIONS.mailMarketingFlowRead,
  MEMBER_PERMISSIONS.mailMarketingFlowWrite,
  MEMBER_PERMISSIONS.mailMarketingFlowPublish,
  MEMBER_PERMISSIONS.mailSettingsRead,
  MEMBER_PERMISSIONS.mailSettingsWrite,
] as const;

export const MAIL_MARKETING_PAGE_PERMISSIONS = [
  ...MAIL_TEMPLATE_PERMISSIONS,
  ...MAIL_MARKETING_PERMISSIONS,
] as const;

export type PermissionRequirement = string | readonly string[] | undefined;

export function hasAnyPermission(permissions: readonly string[] | ReadonlySet<string>, required: PermissionRequirement) {
  if (!required) return true;
  const permissionList = Array.from(permissions);
  const has = (permission: string) => permissionList.includes(permission);
  return typeof required === 'string' ? has(required) : required.some((permission) => has(permission));
}
