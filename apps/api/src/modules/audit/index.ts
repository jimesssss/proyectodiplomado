/**
 * Superficie pública del módulo Audit.
 * Solo lectura: la escritura vive en `core/audit` (append-only, ADR-006).
 */
export { createAuditRouter, type AuditRouterDeps } from './presentation/routes/audit-routes.js';
export { listAudit, type AuditListPage } from './application/audit-service.js';
export { toPublicAuditEntry, type PublicAuditEntry } from './domain/entities/audit-entry.js';
