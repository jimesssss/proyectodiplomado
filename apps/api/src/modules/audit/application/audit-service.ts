import { listAuditLogs, type AuditQuery } from '../../../core/audit/audit.js';
import type { PublicAuditEntry } from '../domain/entities/audit-entry.js';
import { toPublicAuditEntry } from '../domain/entities/audit-entry.js';

/**
 * Caso de uso: consulta paginada del log del PROPIO tenant (del JWT).
 * Sin permiso `audit:read` la ruta ni siquiera llega aquí (denegación por defecto).
 */

export interface AuditListPage {
  readonly items: readonly PublicAuditEntry[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export async function listAudit(tenantId: string, query: AuditQuery): Promise<AuditListPage> {
  const result = await listAuditLogs(tenantId, query);
  return {
    items: result.items.map(toPublicAuditEntry),
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    total: result.total,
  };
}
