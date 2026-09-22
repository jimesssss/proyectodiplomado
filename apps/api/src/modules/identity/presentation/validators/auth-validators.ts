import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().min(3).max(254).email(),
  password: z.string().min(1).max(128),
  // Solo como pista de resolución; el tenant autoritativo viene del registro
  // del usuario en BD, nunca se confía en este valor para datos autenticados.
  tenantId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
});
