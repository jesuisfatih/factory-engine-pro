import { z } from 'zod';
export declare const permissionRecordSchema: z.ZodRecord<z.ZodString, z.ZodBoolean>;
export type PermissionRecord = z.infer<typeof permissionRecordSchema>;
export declare const createMemberRoleSchema: z.ZodObject<{
    slug: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodRecord<z.ZodString, z.ZodBoolean>;
}, z.core.$strip>;
export type CreateMemberRoleInput = z.infer<typeof createMemberRoleSchema>;
export declare const updateMemberRoleSchema: z.ZodObject<{
    permissions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodBoolean>>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, z.core.$strip>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export declare const createMemberSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    roleIds: z.ZodArray<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    sendInvite: z.ZodDefault<z.ZodBoolean>;
    aircallUserId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export declare const updateMemberSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<{
        invited: "invited";
        active: "active";
        disabled: "disabled";
        archived: "archived";
    }>>;
    aircallUserId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export declare const createCustomerUserSchema: z.ZodObject<{
    customerId: z.ZodOptional<z.ZodString>;
    companyName: z.ZodString;
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    password: z.ZodOptional<z.ZodString>;
    sendInvite: z.ZodDefault<z.ZodBoolean>;
    spendingLimitCents: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type CreateCustomerUserInput = z.infer<typeof createCustomerUserSchema>;
export declare const createSubUserSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    roleIds: z.ZodArray<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    sendInvite: z.ZodDefault<z.ZodBoolean>;
    spendingLimitCents: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type CreateSubUserInput = z.infer<typeof createSubUserSchema>;
export declare const tenantConfigSchema: z.ZodObject<{
    shopifyDomain: z.ZodOptional<z.ZodString>;
    shopifyAdminToken: z.ZodOptional<z.ZodString>;
    shopifyApiKey: z.ZodOptional<z.ZodString>;
    shopifyApiSecret: z.ZodOptional<z.ZodString>;
    webhookHmacKey: z.ZodOptional<z.ZodString>;
    aircallApiId: z.ZodOptional<z.ZodString>;
    aircallApiToken: z.ZodOptional<z.ZodString>;
    aircallWebhookSecret: z.ZodOptional<z.ZodString>;
    anthropicApiKey: z.ZodOptional<z.ZodString>;
    resendApiKey: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TenantConfigInput = z.infer<typeof tenantConfigSchema>;
export declare const identityListQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type IdentityListQuery = z.infer<typeof identityListQuerySchema>;
