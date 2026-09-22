import { describe, expect, it } from 'vitest';
import type { ApiResponse } from './index.js';

describe('ApiResponse envelope', () => {
  it('mantiene el contrato de éxito', () => {
    const res: ApiResponse<number> = {
      success: true,
      data: 1,
      meta: { requestId: 'r-1', timestamp: '2026-09-21T00:00:00.000Z' },
      error: null,
    };
    expect(res.success).toBe(true);
    expect(res.error).toBeNull();
  });

  it('mantiene el contrato de error (meta solo requestId)', () => {
    const res: ApiResponse<null> = {
      success: false,
      data: null,
      meta: { requestId: 'r-2' },
      error: { code: 'VALIDATION_ERROR', message: 'Invalid body' },
    };
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.meta)).toEqual(['requestId']);
  });
});
