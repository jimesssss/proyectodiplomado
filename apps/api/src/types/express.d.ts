/**
 * Augmentación global de Express.
 * `requestId` lo inyecta el middleware `requestIdMiddleware` antes de cualquier ruta.
 * `user` lo inyecta `requireAuth` (solo con JWT válido y sesión activa).
 */
import type { AuthUser } from '../core/auth/middleware.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
    }
  }
}

export {};
