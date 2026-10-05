import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../core/errors/app-error.js';
import * as repo from '../infrastructure/repositories/identity-repository.js';
import { forgotPassword, resetPassword } from './password-reset-service.js';
import { sendPasswordResetEmail } from './password-reset-email.js';

vi.mock('../infrastructure/repositories/identity-repository.js', () => ({
  consumePasswordResetToken: vi.fn(),
  findUserByEmail: vi.fn(),
  revokeUserSessionsExcept: vi.fn(),
  updatePasswordResetToken: vi.fn(),
}));

vi.mock('./password-reset-email.js', () => ({
  PASSWORD_RESET_TTL_MS: 60 * 60 * 1000,
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../../../core/auth/password.js', () => ({
  hashPassword: vi.fn(async (password: string) => `hashed:${password}`),
  verifyPassword: vi.fn(),
}));

const activeUser = {
  id: 'user-id',
  email: 'person@example.com',
  tenantId: 'tenant-id',
  displayName: 'Example User',
  roles: ['owner'],
  status: 'active' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the forgot-password service result generic for existing and unknown emails', async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(null);
    const missingResult = await forgotPassword('missing@example.com');

    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce(activeUser);
    const existingResult = await forgotPassword(' PERSON@example.com ');

    expect(missingResult).toBeUndefined();
    expect(existingResult).toBeUndefined();
    expect(repo.findUserByEmail).toHaveBeenNthCalledWith(1, 'missing@example.com');
    expect(repo.findUserByEmail).toHaveBeenNthCalledWith(2, 'person@example.com');
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(repo.updatePasswordResetToken).toHaveBeenCalledOnce();
  });

  it('does not issue reset tokens for disabled or unknown accounts', async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValueOnce({
      ...activeUser,
      status: 'disabled',
    });
    await forgotPassword(activeUser.email);

    expect(repo.updatePasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('consumes a valid token, updates the password, and revokes old sessions', async () => {
    vi.mocked(repo.consumePasswordResetToken).mockResolvedValueOnce(activeUser);

    await expect(resetPassword('valid-token', 'ValidPassword123')).resolves.toBeUndefined();

    expect(repo.consumePasswordResetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash: 'hashed:ValidPassword123',
        tokenHash: expect.any(String),
        now: expect.any(Date),
      }),
    );
    expect(repo.revokeUserSessionsExcept).toHaveBeenCalledWith(activeUser.id, '');
  });

  it.each(['invalid', 'expired', 'already-used'])(
    'rejects a %s token without changing sessions',
    async () => {
      vi.mocked(repo.consumePasswordResetToken).mockResolvedValueOnce(null);

      await expect(resetPassword('not-consumable', 'ValidPassword123')).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(repo.revokeUserSessionsExcept).not.toHaveBeenCalled();
    },
  );

  it('rejects a password that does not meet the existing policy', async () => {
    await expect(resetPassword('valid-token', 'weak')).rejects.toBeInstanceOf(ValidationError);
    expect(repo.consumePasswordResetToken).not.toHaveBeenCalled();
  });
});
