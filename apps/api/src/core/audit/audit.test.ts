import { describe, expect, it } from 'vitest';
import * as auditApi from './audit.js';

/**
 * Garantía append-only (ADR-006): la superficie pública de `core/audit`
 * solo puede contener escritura e lectura. Si alguien añade un mutador
 * (update/delete/replace), este test falla.
 */
describe('core/audit: superficie append-only', () => {
  it('exporta únicamente operaciones de escritura/lectura', () => {
    const functions: string[] = [];
    for (const [name, value] of Object.entries(auditApi)) {
      if (typeof value === 'function') {
        functions.push(name);
      }
    }
    expect(functions.sort()).toEqual(['auditFromRequest', 'listAuditLogs', 'recordAudit']);
  });

  it('ninguna exportación es un mutador (update/delete/patch/remove)', () => {
    for (const name of Object.keys(auditApi)) {
      expect(name).not.toMatch(/update|delete|patch|remove|truncate|drop/i);
    }
  });
});
