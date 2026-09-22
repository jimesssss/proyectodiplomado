import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConfigError,
  ConflictError,
  DomainError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  ServiceUnavailableError,
  UnauthenticatedError,
  ValidationError,
  isAppError,
} from './app-error.js';

describe('app-error hierarchy', () => {
  it('mapea código y status HTTP por tipo de error', () => {
    const cases: ReadonlyArray<[AppError, string, number]> = [
      [new ValidationError(), 'VALIDATION_ERROR', 400],
      [new UnauthenticatedError(), 'UNAUTHENTICATED', 401],
      [new ForbiddenError(), 'FORBIDDEN', 403],
      [new NotFoundError(), 'NOT_FOUND', 404],
      [new ConflictError(), 'CONFLICT', 409],
      [new DomainError('x'), 'DOMAIN_ERROR', 422],
      [new RateLimitedError(), 'RATE_LIMITED', 429],
      [new InternalError(), 'INTERNAL_ERROR', 500],
      [new ConfigError('x'), 'CONFIG_ERROR', 500],
      [new ServiceUnavailableError(), 'SERVICE_UNAVAILABLE', 503],
    ];
    for (const [error, code, status] of cases) {
      expect(error.code).toBe(code);
      expect(error.statusCode).toBe(status);
      expect(isAppError(error)).toBe(true);
    }
  });

  it('no expone mensajes de errores internos', () => {
    expect(new InternalError('db password xyz').expose).toBe(false);
    expect(new ConfigError('uri with secret').expose).toBe(false);
    expect(new ValidationError('bad field').expose).toBe(true);
  });

  it('conserva details cuando se proporcionan', () => {
    const error = new ValidationError('bad', { issues: [{ path: 'name' }] });
    expect(error.details).toEqual({ issues: [{ path: 'name' }] });
  });

  it('isAppError devuelve false para errores ajenos', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('string')).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  it('el nombre de clase permite identificar el tipo', () => {
    expect(new NotFoundError().name).toBe('NotFoundError');
    expect(new InternalError().name).toBe('InternalError');
  });
});
