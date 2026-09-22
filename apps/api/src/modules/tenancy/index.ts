/**
 * Superficie pública del módulo Tenancy.
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export { createTenantRouter, type TenantRouterDeps } from './presentation/routes/tenant-routes.js';
export {
  getTenantById,
  isTenantActive,
  listTenants,
  provisionTenant,
  reactivateTenant,
  renameTenant,
  suspendTenant,
  type ProvisionTenantInput,
  type ProvisionedTenant,
} from './application/tenant-service.js';
export { normalizeSlug, validateSlug, validateTenantName } from './domain/rules/tenant-rules.js';
export {
  toPublicTenant,
  type PublicTenant,
  type Tenant,
  type TenantStatus,
} from './domain/entities/tenant.js';
export {
  findTenantById,
  findTenantBySlug,
} from './infrastructure/repositories/tenant-repository.js';
