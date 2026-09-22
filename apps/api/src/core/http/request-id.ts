import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** IDs aceptados del cliente: seguros para logs (sin CRLF ni caracteres raros). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Asigna un `requestId` a cada petición y lo devuelve en la cabecera
 * `X-Request-Id`. El cliente puede sugerirlo solo si es seguro; en caso
 * contrario se genera uno nuevo (evita inyección en logs).
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};
