import type { Request } from 'express';
import { AuditLogModel } from './audit-log.js';

/**
 * Servicio único de auditoría (ADR-006, `core/audit`).
 *
 * - **Append-only**: la superficie exportada es SOLO escritura (`recordAudit`)
 *   y lectura (`listAuditLogs`). No existe update/delete en la aplicación.
 * - **Críticas síncronas y bloqueantes**: si el INSERT falla, la petición
 *   falla (mejor 500 que una acción sin traza). Sin transacciones reales en
 *   standalone puede quedar acción-hecha-sin-auditar si el insert posterior
 *   falla → migrar a `session.withTransaction` en Atlas (PARTIAL, documentado).
 * - `tenantId` SIEMPRE del contexto del JWT (`auditFromRequest`) o del dato
 *   resuelto en el servicio; nunca del cliente.
 */

export interface AuditRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly requestId: string;
  readonly timestamp: Date;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly metadata: {
    readonly ip?: string;
    readonly userAgent?: string;
    readonly reason?: string;
  };
}

export interface AuditRecordInput {
  readonly tenantId?: string | undefined;
  readonly userId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly requestId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null | undefined;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly reason?: string | undefined;
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

function toRecord(doc: {
  _id: { toString(): string };
  tenantId: string;
  userId?: string;
  sessionId?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId: string;
  timestamp: Date;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: { ip?: string; userAgent?: string; reason?: string };
}): AuditRecord {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    userId: doc.userId === undefined || doc.userId === '' ? null : doc.userId,
    sessionId: doc.sessionId === undefined || doc.sessionId === '' ? null : doc.sessionId,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId ?? null,
    requestId: doc.requestId,
    timestamp: doc.timestamp,
    previousValue: doc.previousValue ?? null,
    newValue: doc.newValue ?? null,
    metadata: doc.metadata ?? {},
  };
}

/** Inserta una entrada. SÍNCRONO y BLOQUEANTE: su fallo propaga (500). */
export async function recordAudit(input: AuditRecordInput): Promise<void> {
  await AuditLogModel.create({
    tenantId: input.tenantId ?? '',
    userId: input.userId ?? '',
    sessionId: input.sessionId ?? '',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    requestId: input.requestId,
    timestamp: new Date(),
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    metadata: {
      ...(input.ip !== undefined ? { ip: input.ip } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  });
}

export interface AuditEvent {
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null | undefined;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly reason?: string | undefined;
}

/**
 * Atajo para rutas: el contexto (tenant, usuario, sesión, requestId, ip,
 * user-agent) sale SIEMPRE del request ya autenticado.
 */
export async function auditFromRequest(req: Request, event: AuditEvent): Promise<void> {
  const user = req.user;
  await recordAudit({
    tenantId: user?.tenantId ?? '',
    userId: user?.userId ?? '',
    sessionId: user?.sessionId ?? '',
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.header('user-agent'),
    ...event,
  });
}

export interface AuditQuery {
  readonly page: number;
  readonly limit: number;
  readonly action?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
}

/** Lectura paginada SIEMPRE filtrada por tenant (nunca global). */
export async function listAuditLogs(
  tenantId: string,
  query: AuditQuery,
): Promise<{ readonly items: readonly AuditRecord[]; readonly total: number }> {
  const filter = {
    tenantId,
    ...(query.action !== undefined ? { action: query.action } : {}),
    ...(query.entityType !== undefined ? { entityType: query.entityType } : {}),
    ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
  };
  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    AuditLogModel.find(filter)
      .sort({ timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return {
    items: docs.map((doc) => toRecord(doc as Parameters<typeof toRecord>[0])),
    total,
  };
}
