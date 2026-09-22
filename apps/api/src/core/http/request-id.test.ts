import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from './request-id.js';

function run(headerValue?: string) {
  const req = {
    header: vi.fn(() => headerValue),
  } as unknown as Request;
  const res = {
    setHeader: vi.fn(),
  } as unknown as Response;
  const next = vi.fn();
  (requestIdMiddleware as RequestHandler)(req, res, next);
  return { req, res, next };
}

describe('requestIdMiddleware', () => {
  it('genera un requestId cuando el cliente no envía cabecera', () => {
    const { req, res, next } = run(undefined);
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('respeta una cabecera segura del cliente (correlación)', () => {
    const { req } = run('trace-abc-123');
    expect(req.requestId).toBe('trace-abc-123');
  });

  it('regenera el id si el cliente envía basura (inyección en logs)', () => {
    const { req } = run('bad id with spaces \n and CRLF');
    expect(req.requestId).not.toContain('\n');
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('regenera ids demasiado cortos o largos', () => {
    expect(run('short').req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(run('x'.repeat(65)).req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
