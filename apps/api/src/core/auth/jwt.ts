import jwt from 'jsonwebtoken';
import { UnauthenticatedError } from '../errors/app-error.js';

/**
 * Claims del access token (contrato ADR-004).
 * `tenantId` dentro del token es la ÚNICA fuente de tenant para el backend.
 */
export interface AuthClaims {
  readonly sub: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly sid: string;
  readonly iss: string;
  readonly aud: string;
  readonly iat?: number;
  readonly exp?: number;
}

export interface JwtService {
  signAccessToken(input: {
    userId: string;
    tenantId: string;
    roles: readonly string[];
    permissions: readonly string[];
    sessionId: string;
  }): string;
  verifyAccessToken(token: string): AuthClaims;
}

export interface CreateJwtServiceOptions {
  readonly privateKey: string;
  readonly publicKey: string;
  readonly issuer: string;
  readonly audience: string;
  readonly accessTtlSeconds: number;
}

export function createJwtService(options: CreateJwtServiceOptions): JwtService {
  return {
    signAccessToken({ userId, tenantId, roles, permissions, sessionId }) {
      return jwt.sign({ tenantId, roles, permissions, sid: sessionId }, options.privateKey, {
        algorithm: 'RS256',
        subject: userId,
        issuer: options.issuer,
        audience: options.audience,
        expiresIn: options.accessTtlSeconds,
      });
    },
    verifyAccessToken(token) {
      try {
        const payload = jwt.verify(token, options.publicKey, {
          algorithms: ['RS256'],
          issuer: options.issuer,
          audience: options.audience,
        });
        if (typeof payload === 'string') {
          throw new UnauthenticatedError('Invalid token');
        }
        const { sub, tenantId, roles, permissions, sid, iss, aud, iat, exp } = payload;
        if (
          typeof sub !== 'string' ||
          typeof tenantId !== 'string' ||
          typeof sid !== 'string' ||
          !Array.isArray(roles) ||
          !Array.isArray(permissions)
        ) {
          throw new UnauthenticatedError('Invalid token claims');
        }
        return {
          sub,
          tenantId,
          roles: roles as string[],
          permissions: permissions as string[],
          sid,
          iss: typeof iss === 'string' ? iss : options.issuer,
          aud: typeof aud === 'string' ? aud : options.audience,
          ...(typeof iat === 'number' ? { iat } : {}),
          ...(typeof exp === 'number' ? { exp } : {}),
        };
      } catch (error) {
        if (error instanceof UnauthenticatedError) {
          throw error;
        }
        // Token inválido, expirado o firmado con otra clave → 401.
        throw new UnauthenticatedError('Invalid or expired token');
      }
    },
  };
}
