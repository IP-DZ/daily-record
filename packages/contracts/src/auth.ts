import { z } from 'zod';

export type UserId = string & { readonly __brand: 'UserId' };

export interface AuthUser {
  userId: UserId;
}

export const userIdSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)
  .transform((value) => value as UserId);

export const authUserSchema: z.ZodType<AuthUser> = z
  .object({
    userId: userIdSchema,
  })
  .strict();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
export const emailCodeSchema = z.string().regex(/^\d{6}$/);
