import { z } from 'zod';
import { emailSchema, passwordSchema, principalTypeSchema } from './common.js';
export const memberLoginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
});
export const customerLoginSchema = memberLoginSchema;
export const forgotPasswordSchema = z.object({
    email: emailSchema,
    surface: z.enum(['admin', 'person', 'accounts']),
});
export const resetPasswordSchema = z.object({
    token: z.string().min(16, 'Reset token is required'),
    password: passwordSchema,
});
export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(16),
});
export const acceptInvitationSchema = z.object({
    token: z.string().min(16),
    password: passwordSchema,
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
});
export const customerRegisterSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    phone: z.string().trim().min(3),
    companyName: z.string().trim().min(1),
    taxId: z.string().trim().optional(),
    billingAddress: z.record(z.string(), z.unknown()).optional(),
    shippingAddress: z.record(z.string(), z.unknown()).optional(),
});
export const bootstrapTenantSchema = z.object({
    tenantId: z.string().trim().regex(/^ten_[a-zA-Z0-9_-]+$/).optional(),
    tenantName: z.string().trim().min(2),
    tenantSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    ownerEmail: emailSchema,
    ownerPassword: passwordSchema,
    ownerFirstName: z.string().trim().min(1),
    ownerLastName: z.string().trim().min(1),
});
export const authSessionSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tenantId: z.string(),
    principal: z.object({
        id: z.string(),
        type: principalTypeSchema,
        email: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        permissions: z.array(z.string()),
    }),
});
