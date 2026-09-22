import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/app-error.js';
import { asTenantId } from './tenant-id.js';

describe('TenantId branded type', () => {
  it('acepta un ObjectId de 24 hex', () => {
    const id = asTenantId('64b0f1a2c3d4e5f607182930');
    expect(id).toBe('64b0f1a2c3d4e5f607182930');
  });

  it('rechaza formatos inválidos con VALIDATION_ERROR', () => {
    for (const bad of ['', 'not-an-id', '64b0f1a2c3d4e5f60718293', 'zzzzf1a2c3d4e5f607182930']) {
      expect(() => asTenantId(bad)).toThrow(ValidationError);
    }
  });
});
