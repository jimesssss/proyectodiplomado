import { describe, expect, it } from 'vitest';
import { UnauthenticatedError } from '../errors/app-error.js';
import { resolveJwtKeys } from './keys.js';
import { createJwtService } from './jwt.js';
import { hashPassword, verifyPassword } from './password.js';

const keys = resolveJwtKeys({});
const jwt = createJwtService({
  privateKey: keys.privateKey,
  publicKey: keys.publicKey,
  issuer: 'erp-test',
  audience: 'api-test',
  accessTtlSeconds: 900,
});

describe('password hashing (Argon2id)', () => {
  it('hashea y verifica correctamente', async () => {
    const hash = await hashPassword('Erp-Secret-2026');
    expect(hash).not.toContain('Erp-Secret-2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Erp-Secret-2026')).toBe(true);
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('no es estable (salt único)', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });

  it('verifyPassword no revienta con hash corrupto', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('JWT RS256', () => {
  const input = {
    userId: 'u1',
    tenantId: '64b0f1a2c3d4e5f607182930',
    roles: ['vendedor'],
    permissions: ['customer:read'],
    permVersion: 1,
    sessionId: 's1',
  };

  it('firma y verifica con claims correctos', () => {
    const token = jwt.signAccessToken(input);
    const claims = jwt.verifyAccessToken(token);
    expect(claims.sub).toBe('u1');
    expect(claims.tenantId).toBe(input.tenantId);
    expect(claims.roles).toEqual(['vendedor']);
    expect(claims.permissions).toEqual(['customer:read']);
    expect(claims.pv).toBe(1);
    expect(claims.sid).toBe('s1');
    expect(claims.iss).toBe('erp-test');
    expect(claims.aud).toBe('api-test');
  });

  it('rechaza token manipulado', () => {
    const token = jwt.signAccessToken(input);
    const tampered = `${token.slice(0, -3)}abc`;
    expect(() => jwt.verifyAccessToken(tampered)).toThrow(UnauthenticatedError);
  });

  it('rechaza token firmado con otra clave', () => {
    const otherKeys = resolveJwtKeys({});
    const otherJwt = createJwtService({
      privateKey: otherKeys.privateKey,
      publicKey: otherKeys.publicKey,
      issuer: 'erp-test',
      audience: 'api-test',
      accessTtlSeconds: 900,
    });
    expect(() => jwt.verifyAccessToken(otherJwt.signAccessToken(input))).toThrow(
      UnauthenticatedError,
    );
  });

  it('rechaza token de otro issuer/audience', () => {
    const foreign = createJwtService({
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      issuer: 'otro',
      audience: 'api-test',
      accessTtlSeconds: 900,
    });
    expect(() => jwt.verifyAccessToken(foreign.signAccessToken(input))).toThrow(
      UnauthenticatedError,
    );
  });

  it('rechaza token expirado', () => {
    const expired = createJwtService({
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      issuer: 'erp-test',
      audience: 'api-test',
      accessTtlSeconds: -60,
    });
    expect(() => jwt.verifyAccessToken(expired.signAccessToken(input))).toThrow(
      UnauthenticatedError,
    );
  });
});
