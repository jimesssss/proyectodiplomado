import { describe, expect, it } from 'vitest';
import { buildVerificationUrl, hashVerificationToken } from '../../../core/email/resend.js';

describe('email verification helpers', () => {
  it('hashes a token deterministically', () => {
    const token = 'token-123';
    expect(hashVerificationToken(token)).toBe(hashVerificationToken(token));
    expect(hashVerificationToken(token)).not.toBe(token);
  });

  it('builds a verification URL with the token in the query string', () => {
    const url = buildVerificationUrl('abc123', 'https://example.com');
    expect(url).toBe('https://example.com/verify-email?token=abc123');
  });
});
