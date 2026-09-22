import { describe, expect, it } from 'vitest';
import {
  canArchive,
  canRestore,
  normalizeCode,
  requiresParent,
  validateCode,
  validateOrgName,
} from './org-rules.js';

describe('org rules: normalizeCode', () => {
  it('normaliza a mayúsculas y guiones', () => {
    expect(normalizeCode('  acme corp  ')).toBe('ACME-CORP');
    expect(normalizeCode('cc-01')).toBe('CC-01');
  });

  it('es idempotente', () => {
    const once = normalizeCode('Cost Center 1');
    expect(normalizeCode(once)).toBe(once);
  });
});

describe('org rules: validateCode', () => {
  it('acepta códigos válidos', () => {
    expect(validateCode('ACME').valid).toBe(true);
    expect(validateCode('CC-01').valid).toBe(true);
  });

  it('rechaza longitud fuera de rango y caracteres inválidos', () => {
    expect(validateCode('A').valid).toBe(false);
    expect(validateCode('A'.repeat(25)).valid).toBe(false);
    expect(validateCode('acme').valid).toBe(false);
    expect(validateCode('ACME CORP').valid).toBe(false);
    expect(validateCode('-ACME-').valid).toBe(false);
    expect(validateCode('ACME--CORP').valid).toBe(false);
  });
});

describe('org rules: validateOrgName', () => {
  it('recorta y valida', () => {
    const ok = validateOrgName('  Matriz  ');
    expect(ok.valid).toBe(true);
    expect(ok.value).toBe('Matriz');
    expect(validateOrgName('   ').valid).toBe(false);
    expect(validateOrgName('x'.repeat(121)).valid).toBe(false);
  });
});

describe('org rules: jerarquía y estado', () => {
  it('la raíz no lleva padre; el resto sí', () => {
    expect(requiresParent('organization')).toBe(false);
    expect(requiresParent('company')).toBe(true);
    expect(requiresParent('branch')).toBe(true);
    expect(requiresParent('department')).toBe(true);
    expect(requiresParent('warehouse')).toBe(true);
    expect(requiresParent('costCenter')).toBe(true);
  });

  it('archivo/restauración según estado', () => {
    expect(canArchive('active')).toBe(true);
    expect(canArchive('archived')).toBe(false);
    expect(canRestore('archived')).toBe(true);
    expect(canRestore('active')).toBe(false);
  });
});
