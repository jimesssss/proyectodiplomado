import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../errors/app-error.js';

/**
 * Autorización por rol (PROVISIONAL — FASE 4).
 * RBAC real con permisos `recurso:acción` llega en FASE 6 (ADR-005) y
 * sustituye estos roles por `requirePermission`.
 */
export function requireRole(...allowed: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (user === undefined) {
      next(new UnauthenticatedError());
      return;
    }
    if (!allowed.some((role) => user.roles.includes(role))) {
      next(new ForbiddenError('Insufficient role'));
      return;
    }
    next();
  };
}
