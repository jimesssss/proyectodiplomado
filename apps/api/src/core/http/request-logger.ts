import type { RequestHandler } from 'express';
import type { Logger } from '../logging/logger.js';

/**
 * Log estructurado por petición al finalizar la respuesta.
 * Registra solo `path` (sin query) para no exponer PII o tokens en logs.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100;
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
        },
        'request completed',
      );
    });
    next();
  };
}
