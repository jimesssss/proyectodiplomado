import type { ErrorRequestHandler, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../logging/logger.js';
import { InternalError, NotFoundError, ValidationError } from '../errors/app-error.js';
import { createErrorHandler, normalizeError } from './error-handler.js';

function createLoggerStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;
}

interface FakeResponse {
  headersSent: boolean;
  statusCode: number;
  body: unknown;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
}

function fakeRes(): FakeResponse {
  const res: FakeResponse = {
    headersSent: false,
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function fakeReq(requestId = 'req-1') {
  return { requestId, path: '/api/v1/test', method: 'GET' } as unknown as Request;
}

function runHandler(error: unknown, requestId = 'req-1') {
  const logger = createLoggerStub();
  const handler = createErrorHandler(logger) as Parameters<ErrorRequestHandler>[0] extends (
    ...args: infer A
  ) => unknown
    ? (...args: A) => void
    : never;
  const res = fakeRes();
  handler(error, fakeReq(requestId), res as unknown as Response, (() => undefined) as never);
  return { res, logger };
}

describe('normalizeError', () => {
  it('pasa AppError tal cual', () => {
    const original = new NotFoundError('missing');
    expect(normalizeError(original)).toBe(original);
  });

  it('convierte SyntaxError de body-parser en VALIDATION_ERROR 400', () => {
    const syntax = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
      body: undefined,
      status: 400,
    });
    const normalized = normalizeError(syntax);
    expect(normalized).toBeInstanceOf(ValidationError);
    expect(normalized.statusCode).toBe(400);
  });

  it('convierte status 413 en PAYLOAD_TOO_LARGE', () => {
    const error = Object.assign(new Error('too large'), { status: 413 });
    const normalized = normalizeError(error);
    expect(normalized.code).toBe('PAYLOAD_TOO_LARGE');
    expect(normalized.statusCode).toBe(413);
  });

  it('cualquier otro error se vuelve INTERNAL_ERROR 500 sin exponer mensaje', () => {
    const normalized = normalizeError(new Error('connection string with password'));
    expect(normalized).toBeInstanceOf(InternalError);
    expect(normalized.expose).toBe(false);
    expect(normalized.message).not.toContain('password');
  });
});

describe('createErrorHandler', () => {
  it('responde envelope de error con status correcto', () => {
    const { res } = runHandler(new NotFoundError('Resource not found', { path: '/x' }));
    expect(res.statusCode).toBe(404);
    const body = res.body as { success: boolean; data: unknown; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('los errores 500 no filtran mensaje ni stack al cliente', () => {
    const secret = new Error('MongoServerError: bad auth with password=SECRET');
    const { res, logger } = runHandler(secret, 'req-500');
    expect(res.statusCode).toBe(500);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('SECRET');
    expect(raw).not.toContain('stack');
    expect(raw).toContain('Internal server error');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('usa requestId del request en el envelope', () => {
    const { res } = runHandler(new NotFoundError(), 'req-echo');
    const body = res.body as { meta: { requestId: string } };
    expect(body.meta.requestId).toBe('req-echo');
  });

  it('no escribe respuesta si headers ya fueron enviados', () => {
    const logger = createLoggerStub();
    const handler = createErrorHandler(logger);
    const res = fakeRes();
    res.headersSent = true;
    handler(new Error('late'), fakeReq(), res as unknown as Response, (() => undefined) as never);
    expect(res.body).toBeUndefined();
  });

  it('registra warns para 4xx y errors para 5xx', () => {
    const warnCase = runHandler(new ValidationError('bad'));
    expect(warnCase.logger.warn).toHaveBeenCalledOnce();
    expect(warnCase.logger.error).not.toHaveBeenCalled();

    const errorCase = runHandler(new Error('boom'));
    expect(errorCase.logger.error).toHaveBeenCalledOnce();
  });
});
