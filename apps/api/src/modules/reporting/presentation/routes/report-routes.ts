import { PERMISSION_CATALOG_VERSION } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import { auditFromRequest, type AuditEvent } from '../../../../core/audit/audit.js';
import type { JwtService } from '../../../../core/auth/jwt.js';
import { requireAuth, type SessionChecker } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { ForbiddenError, UnauthenticatedError } from '../../../../core/errors/app-error.js';
import { currentUser } from '../../../../core/http/crud-router.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import { exportReport } from '../../application/export-service.js';
import {
  getCashFlowReport,
  getCrmReport,
  getInventoryReport,
  getPurchasesReport,
  getSalesReport,
  listLowStock,
  listReportCatalog,
} from '../../application/report-service.js';
import {
  REPORT_CATALOG,
  REPORT_UNDERLYING_PERMISSIONS,
  type ReportExportPayload,
  type ReportKey,
} from '../../domain/entities/report.js';
import {
  cashFlowReportQuerySchema,
  crmReportQuerySchema,
  exportInvoiceQuerySchema,
  exportInventoryQuerySchema,
  exportLookupKeyParamsSchema,
  exportRangeQuerySchema,
  inventoryReportQuerySchema,
  invoiceReportQuerySchema,
  lowStockQuerySchema,
  type CashFlowReportQuery,
  type CrmReportQuery,
  type ExportInventoryQuery,
  type ExportInvoiceQuery,
  type ExportRangeQuery,
  type InvoiceReportQuery,
  type LookupExportKey,
  type LowStockQuery,
} from '../validators/report-validators.js';

export const REPORT_ROUTE_PATHS = { reports: '/api/v1/reports' } as const;

export interface ReportingRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

/**
 * Permisos ENCADENADOS (ADR-008 §1): cada reporte exige `report:read` (o
 * `report:export`) MÁS sus permisos subyacentes — un reporte jamás expone
 * menos datos que su API base con los mismos permisos. El catálogo de
 * permisos NO cambia (sin bump de `pv`).
 */
function exportAuditEvent(key: ReportKey, payload: ReportExportPayload): AuditEvent {
  return {
    action: 'report.export',
    entityType: 'report',
    entityId: key,
    newValue: { format: payload.format, rowCount: payload.rowCount, truncated: payload.truncated },
    reason: 'format=csv',
  };
}

/**
 * `/:key/export`: la clave del path define la cadena de permisos
 * subyacentes (misma semántica de `requirePermission`, incluido el chequeo de
 * `pv`). Los params YA están validados por `validate` (enum de claves).
 */
function requireUnderlyingPermissions(): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (user === undefined) {
      next(new UnauthenticatedError());
      return;
    }
    if (user.permVersion !== PERMISSION_CATALOG_VERSION) {
      next(
        new ForbiddenError('Permissions catalog outdated. Sign in again.', {
          expectedVersion: PERMISSION_CATALOG_VERSION,
          tokenVersion: user.permVersion,
        }),
      );
      return;
    }
    const { key } = req.params as { key: LookupExportKey };
    for (const permission of REPORT_UNDERLYING_PERMISSIONS[key]) {
      if (!user.permissions.includes(permission)) {
        next(new ForbiddenError('Missing permission', { permission }));
        return;
      }
    }
    next();
  };
}

/** Montaje único bajo `/api/v1/reports` (convenciones §4, fila 15). */
export function createReportingRouter(deps: ReportingRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  // --- Catálogo (solo `report:read`) ---
  router.get('/', auth, requirePermission('report:read'), (req, res) => {
    res.status(200).json(successResponse(req.requestId, { reports: listReportCatalog() }));
  });

  // --- Ventas / compras / flujo (rangos multi-moneda; sin FX) ---
  router.get(
    '/sales',
    auth,
    requirePermission('report:read'),
    requirePermission('sales.invoice:read'),
    requirePermission('customer:read'),
    validate({ query: invoiceReportQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as InvoiceReportQuery;
      const report = await getSalesReport(currentUser(req).tenantId, query);
      res.status(200).json(successResponse(req.requestId, report));
    },
  );

  router.get(
    '/purchases',
    auth,
    requirePermission('report:read'),
    requirePermission('supplier.invoice:read'),
    requirePermission('supplier:read'),
    validate({ query: invoiceReportQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as InvoiceReportQuery;
      const report = await getPurchasesReport(currentUser(req).tenantId, query);
      res.status(200).json(successResponse(req.requestId, report));
    },
  );

  router.get(
    '/cashflow',
    auth,
    requirePermission('report:read'),
    requirePermission('bank.account:read'),
    validate({ query: cashFlowReportQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as CashFlowReportQuery;
      const report = await getCashFlowReport(currentUser(req).tenantId, query);
      res.status(200).json(successResponse(req.requestId, report));
    },
  );

  // --- Inventario: snapshot actual (sin rango) + lista paginada de faltantes ---
  router.get(
    '/inventory',
    auth,
    requirePermission('report:read'),
    requirePermission('product:read'),
    requirePermission('stock.movement:read'),
    validate({ query: inventoryReportQuerySchema }),
    async (req, res) => {
      const report = await getInventoryReport(currentUser(req).tenantId);
      res.status(200).json(successResponse(req.requestId, report));
    },
  );

  router.get(
    '/inventory/low-stock',
    auth,
    requirePermission('report:read'),
    requirePermission('product:read'),
    requirePermission('stock.movement:read'),
    validate({ query: lowStockQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as LowStockQuery;
      const result = await listLowStock(currentUser(req).tenantId, query.page, query.limit);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  router.get(
    '/crm',
    auth,
    requirePermission('report:read'),
    requirePermission('lead:read'),
    requirePermission('opportunity:read'),
    validate({ query: crmReportQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as CrmReportQuery;
      const report = await getCrmReport(currentUser(req).tenantId, query);
      res.status(200).json(successResponse(req.requestId, report));
    },
  );

  // --- Exportaciones CSV (síncronas dentro del envelope + auditoría) ---
  router.get(
    '/inventory/export',
    auth,
    requirePermission('report:export'),
    requirePermission('product:read'),
    requirePermission('stock.movement:read'),
    validate({ query: exportInventoryQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as ExportInventoryQuery;
      const payload = await exportReport(currentUser(req).tenantId, {
        key: 'inventory',
        limit: query.limit,
      });
      await auditFromRequest(req, exportAuditEvent('inventory', payload));
      res.status(200).json(successResponse(req.requestId, payload));
    },
  );

  router.get(
    '/sales/export',
    auth,
    requirePermission('report:export'),
    requirePermission('sales.invoice:read'),
    requirePermission('customer:read'),
    validate({ query: exportInvoiceQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as ExportInvoiceQuery;
      const payload = await exportReport(currentUser(req).tenantId, {
        key: 'sales',
        from: query.from,
        to: query.to,
        status: query.status,
        limit: query.limit,
      });
      await auditFromRequest(req, exportAuditEvent('sales', payload));
      res.status(200).json(successResponse(req.requestId, payload));
    },
  );

  router.get(
    '/purchases/export',
    auth,
    requirePermission('report:export'),
    requirePermission('supplier.invoice:read'),
    requirePermission('supplier:read'),
    validate({ query: exportInvoiceQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as ExportInvoiceQuery;
      const payload = await exportReport(currentUser(req).tenantId, {
        key: 'purchases',
        from: query.from,
        to: query.to,
        status: query.status,
        limit: query.limit,
      });
      await auditFromRequest(req, exportAuditEvent('purchases', payload));
      res.status(200).json(successResponse(req.requestId, payload));
    },
  );

  // Clave dinámica: cashflow/crm (las demás tienen ruta explícita arriba).
  router.get(
    '/:key/export',
    auth,
    requirePermission('report:export'),
    validate({ params: exportLookupKeyParamsSchema, query: exportRangeQuerySchema }),
    requireUnderlyingPermissions(),
    async (req, res) => {
      const { key } = req.params as { key: LookupExportKey };
      const query = req.query as unknown as ExportRangeQuery;
      const payload = await exportReport(currentUser(req).tenantId, {
        key,
        from: query.from,
        to: query.to,
        limit: query.limit,
      });
      await auditFromRequest(req, exportAuditEvent(key, payload));
      res.status(200).json(successResponse(req.requestId, payload));
    },
  );

  return router;
}

export function createReportingRouters(
  deps: ReportingRouterDeps,
): readonly { path: string; router: Router }[] {
  return [{ path: REPORT_ROUTE_PATHS.reports, router: createReportingRouter(deps) }];
}

export { REPORT_CATALOG };
