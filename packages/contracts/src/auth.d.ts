import { z } from 'zod';
export declare const memberLoginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    password: z.ZodString;
}, z.core.$strip>;
export type MemberLoginInput = z.infer<typeof memberLoginSchema>;
export declare const customerLoginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    password: z.ZodString;
}, z.core.$strip>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    surface: z.ZodEnum<{
        admin: "admin";
        person: "person";
        accounts: "accounts";
    }>;
}, z.core.$strip>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export declare const acceptInvitationSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export declare const customerRegisterSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    password: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phone: z.ZodString;
    companyName: z.ZodString;
    taxId: z.ZodOptional<z.ZodString>;
    billingAddress: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    shippingAddress: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type CustomerRegisterInput = z.infer<typeof customerRegisterSchema>;
export declare const bootstrapTenantSchema: z.ZodObject<{
    tenantId: z.ZodOptional<z.ZodString>;
    tenantName: z.ZodString;
    tenantSlug: z.ZodString;
    ownerEmail: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    ownerPassword: z.ZodString;
    ownerFirstName: z.ZodString;
    ownerLastName: z.ZodString;
}, z.core.$strip>;
export type BootstrapTenantInput = z.infer<typeof bootstrapTenantSchema>;
export declare const authSessionSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    tenantId: z.ZodString;
    principal: z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            member: "member";
            customer_user: "customer_user";
            sub_user: "sub_user";
        }>;
        email: z.ZodString;
        firstName: z.ZodString;
        lastName: z.ZodString;
        permissions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AuthSession = z.infer<typeof authSessionSchema>;
