import { z } from 'zod';

export const emailSchema = z.string().email().transform((value) => value.trim().toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must be at most 100 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const principalTypeSchema = z.enum(['member', 'customer_user', 'sub_user']);
export type PrincipalType = z.infer<typeof principalTypeSchema>;

export const apiErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
  request_id: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const pageQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
