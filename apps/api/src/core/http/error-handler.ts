import type { ErrorRequestHandler } from 'express';
import type { ApiError, ApiFailure } from '@erp/shared-types';
import { AppError, InternalError, ValidationError, isAppError } from '../errors/app-error.js';
import type { Logger } from '../logging/logger.js';
import { errorResponse } from './envelope.js';

/**
 * Normaliza cualquier error hacia un AppError:
 * - AppError → tal cual.
 * - SyntaxError de body-parser (JSON malformado) → 400 VALIDATION_ERROR.
 * - Errores 4xx de middleware (payload too large, etc.) → su status.
 * - Cualquier otro → 500 INTERNAL_ERROR (mensaje oculto al cliente).
 */
export function normalizeError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return new ValidationError('Invalid JSON body');
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return new AppError(
        status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        status,
        'Bad request',
      );
    }
  }
  return new InternalError();
}

function toApiError(error: AppError): ApiError {
  const base: ApiError = {
    code: error.code,
    message: error.expose ? error.message : 'Internal server error',
  };
  if (error.expose && error.details !== undefined) {
    return { ...base, details: error.details };
  }
  return base;
}

/**
 * Error handler único: siempre responde con el envelope estándar.
 * Nunca filtra stack traces ni mensajes internos al cliente.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = req.requestId ?? 'unknown';
    const appError = normalizeError(error);

    if (appError.statusCode >= 500) {
      logger.error(
        { requestId, err: error, code: appError.code },
        'request failed with server error',
      );
    } else {
      logger.warn({ requestId, code: appError.code, path: req.path }, 'request rejected');
    }

    if (res.headersSent) {
      return;
    }

    const body: ApiFailure = errorResponse(requestId, toApiError(appError));
    res.status(appError.statusCode).json(body);
  };
}
