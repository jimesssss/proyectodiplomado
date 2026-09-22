/**
 * Jerarquía de errores de la aplicación.
 * Cada error conoce su código de dominio, su status HTTP y si su mensaje
 * puede exponerse al cliente (`expose`).
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
    expose = true,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.expose = expose;
    if (details !== undefined) {
      this.details = details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super('FORBIDDEN', 403, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', 404, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super('CONFLICT', 409, message, details);
  }
}

export class DomainError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('DOMAIN_ERROR', 422, message, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super('RATE_LIMITED', 429, message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super('SERVICE_UNAVAILABLE', 503, message);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIG_ERROR', 500, message, details, false);
  }
}

/** Error interno: el mensaje NUNCA se expone al cliente. */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL_ERROR', 500, message, undefined, false);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
