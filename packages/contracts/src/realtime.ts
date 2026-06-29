import { z } from 'zod';

export const realtimeInvalidateSchema = z.object({
  module: z.enum(['call_center']),
  reason: z.string().min(1),
  at: z.string().datetime(),
});
export type RealtimeInvalidate = z.infer<typeof realtimeInvalidateSchema>;

