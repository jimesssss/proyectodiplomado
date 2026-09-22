import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ValidationError } from '../errors/app-error.js';

interface ValidationSchemas {
  readonly body?: ZodType;
  readonly params?: ZodType;
  readonly query?: ZodType;
}

function toIssues(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Valida body/params/query con Zod y reemplaza los valores por los parseados.
 * Cualquier entrada del cliente se valida aquí; el cliente nunca es confiable.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body !== undefined) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          next(new ValidationError('Invalid request body', { issues: toIssues(result.error) }));
          return;
        }
        req.body = result.data;
      }
      if (schemas.params !== undefined) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          next(new ValidationError('Invalid request params', { issues: toIssues(result.error) }));
          return;
        }
        req.params = result.data as typeof req.params;
      }
      if (schemas.query !== undefined) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          next(new ValidationError('Invalid request query', { issues: toIssues(result.error) }));
          return;
        }
        // Express 5 expone `req.query` como getter sin setter: asignar
        // directamente lanzaría TypeError en módulos ESM (strict mode).
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
