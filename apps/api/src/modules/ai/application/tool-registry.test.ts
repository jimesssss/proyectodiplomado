/**
 * Registro de tools — FASE 20 (contrato de descubrimiento y capa de
 * permisos ADR-008). Puros: sin Mongo/Express — solo el catálogo y los
 * contratos Zod de args (los ejecutores se prueban en integración).
 */
import { describe, expect, it } from 'vitest';
import { REPORT_INVOICE_STATUSES, REPORT_UNDERLYING_PERMISSIONS } from '../../reporting/index.js';
import { getAiTool, listAiTools, type AiTool } from './tool-registry.js';

function mustGet(name: string): AiTool {
  const tool = getAiTool(name);
  if (tool === null) {
    throw new Error(`tool ${name} not registered`);
  }
  return tool;
}

const SALES_ARGS = { from: '2026-01-01', to: '2026-01-31', groupBy: 'month' } as const;

describe('tool registry: catálogo', () => {
  it('publica EXACTAMENTE las 3 tools de lectura del ADR-008 (orden fijo)', () => {
    expect(listAiTools().map((tool) => tool.name)).toEqual([
      'crm.search',
      'reports.sales_kpis',
      'hr.salaries',
    ]);
    for (const item of listAiTools()) {
      expect(item.description.length).toBeGreaterThan(10);
      expect(Array.isArray(item.requiredPermissions)).toBe(true);
    }
  });

  it('nombres desconocidos (y claves de prototipo) → null (Map, no objeto plano)', () => {
    expect(getAiTool('nope')).toBeNull();
    expect(getAiTool('constructor')).toBeNull();
    expect(getAiTool('toString')).toBeNull();
    expect(getAiTool('__proto__')).toBeNull();
    expect(getAiTool('crm.search')?.name).toBe('crm.search');
  });
});

describe('tool registry: capa de permisos (ADR-008)', () => {
  it('crm.search no exige permiso global (filtra por TIPO con los permisos del usuario)', () => {
    expect(mustGet('crm.search').requiredPermissions).toEqual([]);
  });

  it('reports.sales_kpis encadena report:read + subyacentes (sincronizado con reporting)', () => {
    expect(mustGet('reports.sales_kpis').requiredPermissions).toEqual([
      'report:read',
      ...REPORT_UNDERLYING_PERMISSIONS.sales,
    ]);
    // ...y la cadena literal que exige GET /reports/sales:
    expect(mustGet('reports.sales_kpis').requiredPermissions).toEqual([
      'report:read',
      'sales.invoice:read',
      'customer:read',
    ]);
  });

  it('hr.salaries es lectura sensible: exige hr.salary:read (igual que GET /salaries)', () => {
    expect(mustGet('hr.salaries').requiredPermissions).toEqual(['hr.salary:read']);
  });
});

describe('tool registry: contratos de args (Zod estricto)', () => {
  it('sales_kpis: fechas de calendario, groupBy del catálogo y rango coherente', () => {
    const schema = mustGet('reports.sales_kpis').argsSchema;
    expect(schema.safeParse(SALES_ARGS).success).toBe(true);
    expect(schema.safeParse({ ...SALES_ARGS, groupBy: 'week' }).success).toBe(false);
    expect(schema.safeParse({ ...SALES_ARGS, from: '2026-02-31' }).success).toBe(false); // calendario
    expect(schema.safeParse({ ...SALES_ARGS, from: '01/01/2026' }).success).toBe(false); // formato
    expect(schema.safeParse({ ...SALES_ARGS, from: '2026-02-01', to: '2026-01-01' }).success).toBe(
      false,
    ); // from > to
    expect(schema.safeParse({ ...SALES_ARGS, tenantId: 'x' }).success).toBe(false); // estricto
    expect(schema.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success).toBe(false); // groupBy requerido
  });

  it('sales_kpis: status sale del MISMO catálogo que reporting (sin literales duplicados)', () => {
    const schema = mustGet('reports.sales_kpis').argsSchema;
    expect([...REPORT_INVOICE_STATUSES]).toEqual(['issued', 'paid']);
    for (const status of REPORT_INVOICE_STATUSES) {
      expect(schema.safeParse({ ...SALES_ARGS, status }).success).toBe(true);
    }
    expect(schema.safeParse({ ...SALES_ARGS, status: 'draft' }).success).toBe(false);
    expect(schema.safeParse({ ...SALES_ARGS, status: 'cancelled' }).success).toBe(false);
  });

  it('hr.salaries: periodo YYYY-MM válido, límites acotados y resto opcional', () => {
    const schema = mustGet('hr.salaries').argsSchema;
    expect(schema.safeParse({ period: '2026-09' }).success).toBe(true);
    expect(schema.safeParse({ limit: 100, page: 1 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true); // todo opcional
    expect(schema.safeParse({ period: '2026-13' }).success).toBe(false);
    expect(schema.safeParse({ period: '202609' }).success).toBe(false);
    expect(schema.safeParse({ limit: 101 }).success).toBe(false);
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
    expect(schema.safeParse({ foo: 1 }).success).toBe(false); // estricto
  });

  it('crm.search: q 2-100 (paridad con GET /search), limit acotado, estricto', () => {
    const schema = mustGet('crm.search').argsSchema;
    expect(schema.safeParse({ q: 'ana' }).success).toBe(true);
    expect(schema.safeParse({ q: 'a' }).success).toBe(false); // mínimo 2
    expect(schema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(schema.safeParse({ q: 'ana', limit: 0 }).success).toBe(false);
    expect(schema.safeParse({ q: 'ana', limit: 51 }).success).toBe(false);
    expect(schema.safeParse({ q: 'ana', types: 'customer,lead' }).success).toBe(true);
    expect(schema.safeParse({ q: 'ana', tenantId: 'x' }).success).toBe(false); // estricto
    // 3 espacios PASAN el contrato (len 3 ≥ 2); sanitizeSearchTerm la
    // rechaza DENTRO de la ejecución → es la ruta determinista a `failed`.
    expect(schema.safeParse({ q: '   ' }).success).toBe(true);
  });
});
