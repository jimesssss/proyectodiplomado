import { pino, type Logger } from 'pino';

export type { Logger };

const REDACT_PATHS = [
  'req.headers.authorization',
  'headers.authorization',
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
];

/**
 * Logger estructurado. Prohibido `console.log` en el código de la app (lint).
 * Nunca loguear: passwords, tokens, headers de autorización ni PII sensible.
 */
export function createLogger(level: string = 'info'): Logger {
  return pino({
    level,
    base: { service: 'erp-api' },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
