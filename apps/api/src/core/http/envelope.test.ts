import { describe, expect, it } from 'vitest';
import { buildMeta, errorResponse, successResponse } from './envelope.js';

describe('API envelope', () => {
  it('successResponse cumple el contrato de éxito', () => {
    const res = successResponse('req-1', { id: 'x' });
    expect(res).toEqual({
      success: true,
      data: { id: 'x' },
      meta: { requestId: 'req-1', timestamp: expect.any(String) },
      error: null,
    });
    expect(Number.isNaN(Date.parse(res.meta.timestamp))).toBe(false);
  });

  it('errorResponse cumple el contrato de error (meta solo requestId)', () => {
    const res = errorResponse('req-2', { code: 'NOT_FOUND', message: 'nope' });
    expect(res.success).toBe(false);
    expect(res.data).toBeNull();
    expect(Object.keys(res.meta)).toEqual(['requestId']);
    expect(res.error.code).toBe('NOT_FOUND');
  });

  it('buildMeta genera timestamp ISO', () => {
    const meta = buildMeta('r');
    expect(meta.requestId).toBe('r');
    expect(meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
