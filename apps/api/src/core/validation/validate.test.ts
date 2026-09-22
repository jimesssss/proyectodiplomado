import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';
import { validate } from './validate.js';

function run(body: unknown, query: unknown = {}) {
  const next = vi.fn();
  const req = { body, query, params: {} } as never;
  const res = {} as never;
  validate({
    body: z.object({ name: z.string().min(2), qty: z.coerce.number().int().positive() }),
  })(req, res, next);
  return { next, req };
}

describe('validate middleware', () => {
  it('acepta datos válidos y reemplaza el body parseado', () => {
    const { next, req } = run({ name: 'ACME', qty: '5' });
    expect(next).toHaveBeenCalledWith();
    const parsed = (req as unknown as { body: { name: string; qty: number } }).body;
    expect(parsed).toEqual({ name: 'ACME', qty: 5 });
  });

  it('rechaza body inválido con ValidationError y details.issues', () => {
    const { next } = run({ name: 'A', qty: -1 });
    expect(next).toHaveBeenCalledOnce();
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ValidationError);
    const validation = error as ValidationError;
    expect(validation.statusCode).toBe(400);
    expect(validation.code).toBe('VALIDATION_ERROR');
    const issues = validation.details?.issues as Array<{ path: string; message: string }>;
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.map((i) => i.path)).toContain('name');
    expect(issues.map((i) => i.path)).toContain('qty');
  });

  it('valida query cuando se proporciona schema', () => {
    const next = vi.fn();
    const req = { body: {}, query: { limit: 'abc' }, params: {} } as never;
    validate({ query: z.object({ limit: z.coerce.number() }) })(req, {} as never, next);
    const error = next.mock.calls[0]?.[0] as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect(JSON.stringify(error.details)).toContain('limit');
  });

  it('sin schemas no hace nada y llama next sin error', () => {
    const next = vi.fn();
    validate({})({} as never, {} as never, next);
    expect(next).toHaveBeenCalledWith();
  });
});
