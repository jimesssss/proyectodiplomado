import type { RequestHandler } from 'express';
import { UnauthenticatedError } from '../errors/app-error.js';
import type { JwtService } from './jwt.js';

/** Usuario autenticado que viaja en `request.user` (siempre desde el JWT). */
export interface AuthUser {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly sessionId: string;
}

/**
 * Comprueba que la sesión del token siga activa (logout la revoca).
 * Inyectado desde el módulo identity para que core no dependa de módulos.
 */
export type SessionChecker = (sessionId: string, userId: string) => Promise<boolean>;

function extractBearerToken(header: string | undefined): string {
  if (header === undefined || !header.startsWith('Bearer ')) {
    throw new UnauthenticatedError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  if (token.length === 0) {
    throw new UnauthenticatedError('Missing bearer token');
  }
  return token;
}

/**
 * Middleware de autenticación: 401 si no hay token válido o la sesión está
 * revocada. La autorización (permisos) es un middleware separado (FASE 6).
 */
export function requireAuth(jwt: JwtService, isSessionActive: SessionChecker): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = extractBearerToken(req.header('authorization'));
      const claims = jwt.verifyAccessToken(token);
      const active = await isSessionActive(claims.sid, claims.sub);
      if (!active) {
        throw new UnauthenticatedError('Session revoked or expired');
      }
      req.user = {
        userId: claims.sub,
        tenantId: claims.tenantId,
        roles: claims.roles,
        permissions: claims.permissions,
        sessionId: claims.sid,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
