import { describe, expect, it } from 'vitest';
import { validatePermissionList, validateRoleKey } from './rbac-rules.js';

describe('rbac rules: validateRoleKey', () => {
  it('acepta claves válidas', () => {
    expect(validateRoleKey('vendedor').valid).toBe(true);
    expect(validateRoleKey('almacen-1').valid).toBe(true);
  });

  it('rechaza mayúsculas, espacios, longitud y empiezo no letra', () => {
    expect(validateRoleKey('Vendedor').valid).toBe(false);
    expect(validateRoleKey('a').valid).toBe(false);
    expect(validateRoleKey('x'.repeat(33)).valid).toBe(false);
    expect(validateRoleKey('1vendedor').valid).toBe(false);
    expect(validateRoleKey('ven dedor').valid).toBe(false);
  });

  it('reserva las claves embutidas (owner, super_admin)', () => {
    expect(validateRoleKey('owner').valid).toBe(false);
    expect(validateRoleKey('super_admin').valid).toBe(false);
  });
});

describe('rbac rules: validatePermissionList', () => {
  it('acepta permisos del catálogo y elimina duplicados', () => {
    const result = validatePermissionList(['customer:read', 'sales.order:create', 'customer:read']);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual(['customer:read', 'sales.order:create']);
  });

  it('rechaza claves desconocidas con detalle', () => {
    const result = validatePermissionList(['customer:read', 'no.existe:read']);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain('Unknown permission');
  });

  it('lista vacía es válida (rol sin permisos)', () => {
    expect(validatePermissionList([]).valid).toBe(true);
  });
});
