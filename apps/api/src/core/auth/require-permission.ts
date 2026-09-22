import type { RequestHandler } from 'express';
import { PERMISSION_CATALOG_VERSION, type Permission } from '@erp/permissions';
import { ForbiddenError, UnauthenticatedError } from '../errors/app-error.js';

/**
 * Autorización RBAC (ADR-005): opera SOLO sobre los permisos del JWT.
 * Denegación por defecto: sin permiso explícito → 403.
 * Si el token se firmó con otra versión del catálogo (`pv`), también → 403:
 * el cliente debe re-autenticarse para refrescar permisos.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (user === undefined) {
      next(new UnauthenticatedError());
      return;
    }
    if (user.permVersion !== PERMISSION_CATALOG_VERSION) {
      next(
        new ForbiddenError('Permissions catalog outdated. Sign in again.', {
          expectedVersion: PERMISSION_CATALOG_VERSION,
          tokenVersion: user.permVersion,
        }),
      );
      return;
    }
    if (!user.permissions.includes(permission)) {
      next(new ForbiddenError('Missing permission', { permission }));
      return;
    }
    next();
  };
}
