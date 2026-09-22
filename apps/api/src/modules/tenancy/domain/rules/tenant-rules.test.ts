import { describe, expect, it } from 'vitest';
import {
  canReactivate,
  canSuspend,
  normalizeSlug,
  validateSlug,
  validateTenantName,
} from './tenant-rules.js';

describe('tenant rules: normalizeSlug', () => {
  it('convierte nombre a slug canónico (minúsculas y guiones)', () => {
    expect(normalizeSlug('Mi Empresa S.A.')).toBe('mi-empresa-s-a');
    expect(normalizeSlug('  ACME  Corp  ')).toBe('acme-corp');
  });

  it('quita acentos', () => {
    expect(normalizeSlug('Café Buenos Aires')).toBe('cafe-buenos-aires');
  });

  it('es idempotente', () => {
    const once = normalizeSlug('Acme Corp #2');
    expect(normalizeSlug(once)).toBe(once);
  });
});

describe('tenant rules: validateSlug', () => {
  it('acepta slugs válidos', () => {
    expect(validateSlug('acme').valid).toBe(true);
    expect(validateSlug('acme-corp-2').valid).toBe(true);
  });

  it('rechaza longitud fuera de rango', () => {
    expect(validateSlug('ab').valid).toBe(false);
    expect(validateSlug('a'.repeat(33)).valid).toBe(false);
    expect(validateSlug('ab').issues[0]).toContain('3 characters');
  });

  it('rechaza mayúsculas, espacios y guiones extremos', () => {
    expect(validateSlug('Acme').valid).toBe(false);
    expect(validateSlug('acme corp').valid).toBe(false);
    expect(validateSlug('-acme-').valid).toBe(false);
    expect(validateSlug('acme--corp').valid).toBe(false);
  });
});

describe('tenant rules: validateTenantName', () => {
  it('recorta y valida longitud', () => {
    const ok = validateTenantName('  Acme Corp  ');
    expect(ok.valid).toBe(true);
    expect(ok.value).toBe('Acme Corp');

    expect(validateTenantName('a').valid).toBe(false);
    expect(validateTenantName('x'.repeat(121)).valid).toBe(false);
    expect(validateTenantName('   ').valid).toBe(false);
  });
});

describe('tenant rules: transiciones de estado', () => {
  it('solo activo puede suspenderse y solo suspendido reactivarse', () => {
    expect(canSuspend('active')).toBe(true);
    expect(canSuspend('suspended')).toBe(false);
    expect(canReactivate('suspended')).toBe(true);
    expect(canReactivate('active')).toBe(false);
  });
});
