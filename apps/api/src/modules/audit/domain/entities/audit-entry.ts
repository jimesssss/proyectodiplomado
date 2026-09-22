/**
 * Dominio Audit — entidad de solo lectura para la API.
 * La colección es append-only en core/audit; este módulo solo consulta.
 */
import type { AuditRecord } from '../../../../core/audit/audit.js';

export interface PublicAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly userId: string | null;
  readonly sessionId: string | null;
  readonly requestId: string;
  readonly timestamp: Date;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly metadata: AuditRecord['metadata'];
}

export function toPublicAuditEntry(record: AuditRecord): PublicAuditEntry {
  return {
    id: record.id,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    userId: record.userId,
    sessionId: record.sessionId,
    requestId: record.requestId,
    timestamp: record.timestamp,
    previousValue: record.previousValue,
    newValue: record.newValue,
    metadata: record.metadata,
  };
}
