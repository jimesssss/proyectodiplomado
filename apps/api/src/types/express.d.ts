/**
 * Augmentación global de Express.
 * `requestId` lo inyecta el middleware `requestIdMiddleware` antes de cualquier ruta.
 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export {};
