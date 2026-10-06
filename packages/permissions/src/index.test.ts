import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLES,
  PERMISSIONS,
  PERMISSION_CATALOG_VERSION,
  PLATFORM_PERMISSIONS,
  isBuiltinRole,
  isPermission,
} from './index.js';

describe('catálogo de permisos', () => {
  it('todas las claves siguen la forma recurso[:sub]:acción', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*:[a-z][a-z0-9]*$/);
    }
  });

  it('no hay claves duplicadas', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('incluye los ejemplos obligatorios de ADR-005', () => {
    expect(isPermission('customer:read')).toBe(true);
    expect(isPermission('sales.order:create')).toBe(true);
    expect(isPermission('accounting.journal:post')).toBe(true);
    expect(isPermission('hr.salary:read')).toBe(true);
    expect(isPermission('tenant:suspend')).toBe(true);
  });

  it('isPermission rechaza claves fuera del catálogo', () => {
    expect(isPermission('no.existe:read')).toBe(false);
    expect(isPermission('customer:destroy')).toBe(false);
    expect(isPermission('')).toBe(false);
  });

  it('la versión del catálogo es un entero positivo', () => {
    expect(Number.isInteger(PERMISSION_CATALOG_VERSION)).toBe(true);
    expect(PERMISSION_CATALOG_VERSION).toBeGreaterThan(0);
  });

  it('el catálogo tiene claves para matriz VENDEDOR y ALMACÉN (ADR-005)', () => {
    // VENDEDOR
    for (const key of [
      'customer:read',
      'customer:create',
      'sales.quote:create',
      'sales.order:create',
      'report:read',
    ]) {
      expect(isPermission(key)).toBe(true);
    }
    // ALMACÉN
    for (const key of [
      'product:read',
      'stock.movement:create',
      'stock.transfer:create',
      'goods.receipt:create',
    ]) {
      expect(isPermission(key)).toBe(true);
    }
  });
});

describe('roles embutidos', () => {
  it('owner NO recibe permisos de plataforma salvo auditoría del tenant; super_admin sí', () => {
    expect(isBuiltinRole('owner')).toBe(true);
    expect(isBuiltinRole('super_admin')).toBe(true);
    expect(isBuiltinRole('vendedor')).toBe(false);

    for (const platformPermission of PLATFORM_PERMISSIONS) {
      if (platformPermission === 'audit:read') {
        expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain(platformPermission);
        continue;
      }
      expect(BUILTIN_ROLE_PERMISSIONS.owner).not.toContain(platformPermission);
      expect(BUILTIN_ROLE_PERMISSIONS.super_admin).toContain(platformPermission);
    }
    expect(BUILTIN_ROLES).toHaveLength(2);
  });

  it('owner tiene todos los permisos de negocio y acceso a auditoría del tenant', () => {
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain('org:write');
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain('user:create');
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain('tenant:update');
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain('audit:read');
    expect(BUILTIN_ROLE_PERMISSIONS.owner.length).toBeGreaterThan(
      ALL_PERMISSIONS.length - PLATFORM_PERMISSIONS.length - 1,
    );
  });

  it('los permisos embutidos son subconjunto del catálogo', () => {
    for (const role of BUILTIN_ROLES) {
      for (const permission of BUILTIN_ROLE_PERMISSIONS[role]) {
        expect(isPermission(permission)).toBe(true);
      }
    }
    expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(0);
  });
});
