import type { Permission } from '@erp/permissions';
import { z, type ZodType } from 'zod';

import { searchCrm } from '../../crm/index.js';
import { listSalaries } from '../../hr/index.js';
import {
  REPORT_DATE_PATTERN,
  REPORT_GROUP_BY,
  REPORT_INVOICE_STATUSES,
  REPORT_UNDERLYING_PERMISSIONS,
  checkDateRange,
  getSalesReport,
  isValidReportDate,
  type ReportInvoiceStatus,
} from '../../reporting/index.js';

/**
 * Registro de tools autorizadas (ADR-008 §Decisión): la IA nunca ve
 * MongoDB — invoca SOLO estas funciones, ya acotadas por `tenantId` (del
 * JWT) y por `requiredPermissions` declarados (capa de permisos). FASE 20
 * entrega 3 tools de LECTURA (búsqueda, KPIs de ventas, nómina); las de
 * escritura (IA propone → usuario confirma → audit) quedan para fases
 * futuras. Solo se importa desde `index.ts` de otros módulos (nunca sus
 * schemas/repositories).
 */
export interface AiTool {
  readonly name: string;
  readonly description: string;
  /** TODOS exigidos (AND): sin uno → 403 `Missing permission` con ese permiso. */
  readonly requiredPermissions: readonly Permission[];
  /** Contrato estricto del `args`: se valida ANTES de ejecutar (400, sin registro). */
  readonly argsSchema: ZodType;
  /**
   * Ejecuta la tool con `tenantId` SIEMPRE del JWT. `permissions` = los del
   * usuario (la búsqueda CRM filtra por tipo con denegación por defecto).
   */
  readonly execute: (
    tenantId: string,
    args: unknown,
    permissions: readonly string[],
  ) => Promise<unknown>;
}

// --- Contratos de args (Zod estricto: clave desconocida → 400) ---

/** `q` 2-100 (paridad con `GET /search`); el recorte real lo hace la tool. */
const searchArgsSchema = z.strictObject({
  q: z.string().min(2).max(100),
  /** Subconjunto de tipos separados por coma (p. ej. `customer,lead`). */
  types: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/** Misma fecha y rango que `GET /reports/sales` (mensajes y reglas idénticos). */
const reportDateField = z
  .string()
  .regex(REPORT_DATE_PATTERN, 'Invalid date (use YYYY-MM-DD)')
  .refine(isValidReportDate, { message: 'Invalid calendar date' });

const salesKpisArgsSchema = z
  .strictObject({
    from: reportDateField,
    to: reportDateField,
    groupBy: z.enum(REPORT_GROUP_BY),
    status: z
      .enum(REPORT_INVOICE_STATUSES as unknown as [ReportInvoiceStatus, ...ReportInvoiceStatus[]])
      .optional(),
  })
  .superRefine((value, ctx) => {
    // Mismo chequeo que la ruta: from ≤ to y límites (366 días / 120 meses).
    const check = checkDateRange(value.from, value.to, value.groupBy);
    if (!check.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: check.message });
    }
  });

const hrSalariesArgsSchema = z.strictObject({
  period: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid period')
    .optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// --- Tools (FASE 20: SOLO lectura) ---

const searchTool: AiTool = {
  name: 'crm.search',
  description:
    'Búsqueda literal multi-tipo en CRM (customer, contact, lead, opportunity, activity): cada tipo aparece SOLO con su <recurso>:read del usuario (denegación por defecto, sin 403 global — igual que GET /search). Sin permiso global: el filtrado por tipo ocurre DENTRO de la tool.',
  requiredPermissions: [],
  argsSchema: searchArgsSchema,
  execute: async (tenantId, args, permissions) => {
    const parsed = searchArgsSchema.parse(args); // ya validado por la capa (solo narrowing)
    return searchCrm(
      tenantId,
      { q: parsed.q, types: parsed.types, limit: parsed.limit ?? 10 },
      permissions,
    );
  },
};

const salesKpisTool: AiTool = {
  name: 'reports.sales_kpis',
  description:
    'KPIs de ventas por rango (totales por moneda, serie y top de clientes): LOS MISMOS datos y permisos encadenados que GET /reports/sales.',
  requiredPermissions: ['report:read', ...REPORT_UNDERLYING_PERMISSIONS.sales],
  argsSchema: salesKpisArgsSchema,
  execute: async (tenantId, args) => {
    const parsed = salesKpisArgsSchema.parse(args);
    return getSalesReport(tenantId, {
      from: parsed.from,
      to: parsed.to,
      groupBy: parsed.groupBy,
      status: parsed.status,
    });
  },
};

const hrSalariesTool: AiTool = {
  name: 'hr.salaries',
  description:
    'Nómina por periodo YYYY-MM (página ≤100): LECTURA SENSIBLE — exige hr.salary:read, el MISMO permiso que GET /salaries (ADR-008).',
  requiredPermissions: ['hr.salary:read'],
  argsSchema: hrSalariesArgsSchema,
  execute: async (tenantId, args) => {
    const parsed = hrSalariesArgsSchema.parse(args);
    return listSalaries(tenantId, {
      page: parsed.page ?? 1,
      limit: parsed.limit ?? 20,
      period: parsed.period,
      employeeId: undefined,
      archived: undefined,
    });
  },
};

// Map (no objeto plano): nombres como `constructor`/`__proto__` → null,
// nunca una "tool fantasma" heredada del prototipo.
const TOOLS = new Map<string, AiTool>([
  [searchTool.name, searchTool],
  [salesKpisTool.name, salesKpisTool],
  [hrSalariesTool.name, hrSalariesTool],
]);

export function getAiTool(name: string): AiTool | null {
  return TOOLS.get(name) ?? null;
}

/** Ficha de descubrimiento (`GET /ai/tools`): catálogo sin ejecutar nada. */
export interface AiToolCatalogItem {
  readonly name: string;
  readonly description: string;
  readonly requiredPermissions: readonly Permission[];
}

export function listAiTools(): readonly AiToolCatalogItem[] {
  return [...TOOLS.values()].map((tool) => ({
    name: tool.name,
    description: tool.description,
    requiredPermissions: tool.requiredPermissions,
  }));
}
