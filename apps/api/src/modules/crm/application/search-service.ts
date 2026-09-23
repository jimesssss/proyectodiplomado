import type { Permission } from '@erp/permissions';
import { ValidationError } from '../../../core/errors/app-error.js';
import { escapeRegExp, sanitizeSearchTerm } from '../domain/rules/crm-rules.js';
import {
  activityRepo,
  contactRepo,
  customerRepo,
  leadRepo,
  opportunityRepo,
} from '../infrastructure/repositories/crm-repository.js';

/**
 * Búsqueda global de CRM extraída del router (FASE 8 → FASE 20): UNA sola
 * implementación reutilizable por la ruta `GET /search` Y por la tool
 * `crm.search` de la capa de IA (ADR-008: la IA invoca la MISMA lógica que
 * la API, con el tenant del JWT y los permisos del usuario). Búsqueda
 * LITERAL (regex escapada: sin ReDoS ni metacaracteres del usuario);
 * `<recurso>:read` POR TIPO (denegación por defecto: sin permiso → el tipo
 * no aparece, nunca un 403 global).
 */

export const CRM_SEARCH_TYPES = ['customer', 'contact', 'lead', 'opportunity', 'activity'] as const;
export type CrmSearchType = (typeof CRM_SEARCH_TYPES)[number];

export interface SearchResultItem {
  readonly type: CrmSearchType;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
}

export interface SearchCrmOptions {
  readonly q: string;
  /** Subconjunto de tipos separados por coma (p. ej. `customer,lead`). */
  readonly types?: string | undefined;
  readonly limit: number;
}

export interface SearchCrmResult {
  readonly query: string;
  readonly results: readonly SearchResultItem[];
}

/** Permiso de lectura EXIGIDO por tipo: sin él, el tipo no aparece. */
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

export function resolveSearchTypes(raw: string | undefined): readonly CrmSearchType[] {
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
 * Ejecuta la búsqueda: sanitiza el término (2-100), arma el patrón literal
 * y recorre SOLO los tipos cuyo `<recurso>:read` posee `permissions`.
 * `tenantId` SIEMPRE lo aporta el caller desde el JWT (nunca el cliente).
 */
export async function searchCrm(
  tenantId: string,
  options: SearchCrmOptions,
  permissions: readonly string[],
): Promise<SearchCrmResult> {
  const check = sanitizeSearchTerm(options.q);
  if (!check.valid) {
    throw new ValidationError('Invalid search term', { issues: check.issues });
  }
  const types = resolveSearchTypes(options.types);
  const pattern = new RegExp(escapeRegExp(check.value), 'i');
  const results: SearchResultItem[] = [];
  for (const type of types) {
    if (!permissions.includes(SEARCH_PERMISSIONS[type])) {
      continue;
    }
    results.push(...(await SEARCHERS[type](tenantId, pattern, options.limit)));
  }
  return { query: check.value, results };
}
