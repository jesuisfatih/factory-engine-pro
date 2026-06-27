import { z } from 'zod';
export declare const emailSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const passwordSchema: z.ZodString;
export declare const principalTypeSchema: z.ZodEnum<{
    member: "member";
    customer_user: "customer_user";
    sub_user: "sub_user";
}>;
export type PrincipalType = z.infer<typeof principalTypeSchema>;
export declare const apiErrorSchema: z.ZodObject<{
    message: z.ZodString;
    code: z.ZodString;
    request_id: z.ZodString;
    details: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export declare const pageQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PageQuery = z.infer<typeof pageQuerySchema>;
