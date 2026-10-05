import { z } from 'zod';

export const registerBodySchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(1).max(512),
});

export const resendVerificationBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export const forgotPasswordBodySchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: z.string().min(1).max(128),
});

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
