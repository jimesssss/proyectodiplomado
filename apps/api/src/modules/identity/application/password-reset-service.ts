import { randomBytes } from 'node:crypto';
import { hashPassword } from '../../../core/auth/password.js';
import { hashVerificationToken } from '../../../core/email/resend.js';
import { ValidationError } from '../../../core/errors/app-error.js';
import { createLogger } from '../../../core/logging/logger.js';
import { validatePasswordPolicy } from '../domain/rules/auth-rules.js';
import * as repo from '../infrastructure/repositories/identity-repository.js';
import {
  PASSWORD_RESET_TTL_MS,
  sendPasswordResetEmail,
} from './password-reset-email.js';

const resetLogger = createLogger('error');

export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await repo.findUserByEmail(normalizedEmail);
  if (user === null || user.status !== 'active') {
    return;
  }

  const token = randomBytes(32).toString('base64url');
  await repo.updatePasswordResetToken(user.id, {
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  try {
    await sendPasswordResetEmail(user.email, token);
  } catch (error) {
    resetLogger.error({ err: error }, 'password reset email delivery failed');
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new ValidationError('Password does not meet policy', { issues: policy.issues });
  }

  const passwordHash = await hashPassword(newPassword);
  const user = await repo.consumePasswordResetToken({
    tokenHash: hashVerificationToken(token.trim()),
    passwordHash,
    now: new Date(),
  });
  if (user === null) {
    throw new ValidationError('Password reset token is invalid or expired');
  }

  await repo.revokeUserSessionsExcept(user.id, '');
}
