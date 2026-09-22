import { PERMISSION_CATALOG_VERSION, type Permission } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import type { JwtService } from '../../../../core/auth/jwt.js';
import {
  requireAuth,
  type AuthUser,
  type SessionChecker,
} from '../../../../core/auth/middleware.js';
import { ForbiddenError, ValidationError } from '../../../../core/errors/app-error.js';
import { successResponse } from '../../../../core/http/envelope.js';
import { validate } from '../../../../core/validation/validate.js';
import { escapeRegExp, sanitizeSearchTerm } from '../../domain/rules/crm-rules.js';
import {
  activityRepo,
  contactRepo,
  customerRepo,
  leadRepo,
  opportunityRepo,
} from '../../infrastructure/repositories/crm-repository.js';
import { searchQuerySchema } from '../validators/crm-validators.js';

export interface SearchRouterDeps {
  readonly jwt: JwtService;
  readonly isSessionActive: SessionChecker;
}

export const CRM_SEARCH_TYPES = ['customer', 'contact', 'lead', 'opportunity', 'activity'] as const;
export type CrmSearchType = (typeof CRM_SEARCH_TYPES)[number];

export interface SearchResultItem {
  readonly type: CrmSearchType;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
}

/** Permiso de lectura EXIGIDO por tipo: sin él, el tipo no aparece (no 403 global). */
const SEARCH_PERMISSIONS: Record<CrmSearchType, Permission> = {
  customer: 'customer:read',
  contact: 'contact:read',
  lead: 'lead:read',
  opportunity: 'opportunity:read',
  activity: 'activity:read',
};

const SEARCHERS: Record<
  CrmSearchType,
  (tenantId: string, pattern: RegExp, limit: number) => Promise<readonly SearchResultItem[]>
> = {
  customer: async (tenantId, pattern, limit) =>
    (await customerRepo.search(tenantId, pattern, limit)).map((customer) => ({
      type: 'customer',
      id: customer.id,
      title: customer.name,
      subtitle: customer.code,
    })),
  contact: async (tenantId, pattern, limit) =>
    (await contactRepo.search(tenantId, pattern, limit)).map((contact) => ({
      type: 'contact',
      id: contact.id,
      title: `${contact.firstName} ${contact.lastName}`.trim(),
      subtitle: contact.jobTitle,
    })),
  lead: async (tenantId, pattern, limit) =>
    (await leadRepo.search(tenantId, pattern, limit)).map((lead) => ({
      type: 'lead',
      id: lead.id,
      title: lead.name,
      subtitle: lead.status,
    })),
  opportunity: async (tenantId, pattern, limit) =>
    (await opportunityRepo.search(tenantId, pattern, limit)).map((opportunity) => ({
      type: 'opportunity',
      id: opportunity.id,
      title: opportunity.name,
      subtitle: opportunity.stage,
    })),
  activity: async (tenantId, pattern, limit) =>
    (await activityRepo.search(tenantId, pattern, limit)).map((activity) => ({
      type: 'activity',
      id: activity.id,
      title: activity.subject,
      subtitle: activity.type,
    })),
};

function currentUser(req: { user?: AuthUser }): AuthUser {
  const user = req.user;
  if (user === undefined) {
    throw new Error('requireAuth should populate request.user');
  }
  return user;
}

function resolveTypes(raw: string | undefined): readonly CrmSearchType[] {
  if (raw === undefined || raw.trim() === '') {
    return CRM_SEARCH_TYPES;
  }
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  for (const part of parts) {
    if (!(CRM_SEARCH_TYPES as readonly string[]).includes(part)) {
      throw new ValidationError('Unknown search type', { type: part });
    }
  }
  return parts.length === 0 ? CRM_SEARCH_TYPES : (parts as readonly CrmSearchType[]);
}

/**
 * Búsqueda global de CRM (`GET /search`, desde FASE 8 — convenciones §4):
 * búsqueda LITERAL (regex escapada: sin ReDoS ni metacaracteres del usuario),
 * SIEMPRE por tenant, con `<recurso>:read` POR TIPO (denegación por defecto:
 * sin permiso → el tipo simplemente no aparece). Mismo `pv` del catálogo que
 * `requirePermission` (token desactualizado → 403 con re-login).
 */
export function createSearchRouter(deps: SearchRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  router.get('/', auth, validate({ query: searchQuerySchema }), async (req, res) => {
    const user = currentUser(req);
    if (user.permVersion !== PERMISSION_CATALOG_VERSION) {
      throw new ForbiddenError('Permissions catalog outdated. Sign in again.', {
        expectedVersion: PERMISSION_CATALOG_VERSION,
        tokenVersion: user.permVersion,
      });
    }
    const query = req.query as unknown as {
      q: string;
      types?: string | undefined;
      limit: number;
    };
    const check = sanitizeSearchTerm(query.q);
    if (!check.valid) {
      throw new ValidationError('Invalid search term', { issues: check.issues });
    }
    const types = resolveTypes(query.types);
    const pattern = new RegExp(escapeRegExp(check.value), 'i');
    const results: SearchResultItem[] = [];
    for (const type of types) {
      if (!user.permissions.includes(SEARCH_PERMISSIONS[type])) {
        continue;
      }
      results.push(...(await SEARCHERS[type](user.tenantId, pattern, query.limit)));
    }
    res.status(200).json(successResponse(req.requestId, { query: check.value, results }));
  });

  return router;
}
