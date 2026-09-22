/**
 * Superficie pública del módulo Organization.
 * Otros módulos (y la composition root) solo pueden importar desde aquí.
 */
export {
  createOrgRouter,
  ORG_KINDS_BY_PATH,
  ORG_ROUTE_PATHS,
  type OrgRouterDeps,
} from './presentation/routes/org-routes.js';
export {
  archiveOrgUnit,
  createOrgUnit,
  getOrgUnit,
  listOrgUnits,
  updateOrgUnit,
  type CreateOrgInput,
  type PatchOrgInput,
} from './application/org-service.js';
export {
  normalizeCode,
  requiresParent,
  validateCode,
  validateOrgName,
} from './domain/rules/org-rules.js';
export {
  ORG_KINDS,
  PARENT_FIELD,
  PARENT_KIND,
  toPublicOrgUnit,
  type OrgKind,
  type OrgStatus,
  type OrgUnit,
  type PublicOrgUnit,
} from './domain/entities/org-unit.js';
