import { NotFoundError, ValidationError, ConflictError } from '../../../core/errors/app-error.js';
import {
  PARENT_KIND,
  toPublicOrgUnit,
  type OrgKind,
  type OrgStatus,
  type PublicOrgUnit,
} from '../domain/entities/org-unit.js';
import {
  canArchive,
  canRestore,
  normalizeCode,
  requiresParent,
  validateCode,
  validateOrgName,
} from '../domain/rules/org-rules.js';
import { repoFor } from '../infrastructure/repositories/org-repository.js';

/**
 * Casos de uso Organization. `tenantId` SIEMPRE viene del JWT (ADR-002) y se
 * transmite a cada operación del repositorio; el padre también debe pertenecer
 * al mismo tenant (404 uniforme: inexistente y ajeno se responden igual).
 */

export interface CreateOrgInput {
  readonly code: string;
  readonly name: string;
  readonly parentId?: string | undefined;
}

export interface PatchOrgInput {
  readonly name?: string | undefined;
  readonly status?: OrgStatus | undefined;
}

function assertCode(code: string): string {
  const normalized = normalizeCode(code);
  const check = validateCode(normalized);
  if (!check.valid) {
    throw new ValidationError('Invalid code', { issues: check.issues });
  }
  return normalized;
}

function assertName(name: string): string {
  const check = validateOrgName(name);
  if (!check.valid) {
    throw new ValidationError('Invalid name', { issues: check.issues });
  }
  return check.value;
}

export async function createOrgUnit(
  tenantId: string,
  kind: OrgKind,
  input: CreateOrgInput,
): Promise<PublicOrgUnit> {
  const code = assertCode(input.code);
  const name = assertName(input.name);

  let parentId: string | null = null;
  if (requiresParent(kind)) {
    if (input.parentId === undefined || input.parentId === '') {
      throw new ValidationError('parentId is required for this type');
    }
    const parentKind = PARENT_KIND[kind];
    if (parentKind === null) {
      throw new ValidationError('parentId is required for this type');
    }
    // El padre debe existir DENTRO del mismo tenant; ajeno → 404 uniforme.
    const parent = await repoFor(parentKind).findById(tenantId, input.parentId);
    if (parent === null) {
      throw new NotFoundError('Parent not found');
    }
    parentId = parent.id;
  } else if (input.parentId !== undefined && input.parentId !== '') {
    throw new ValidationError('parentId is not allowed for this type');
  }

  const existing = await repoFor(kind).findByCode(tenantId, code);
  if (existing !== null) {
    throw new ConflictError('Code already in use');
  }

  const created = await repoFor(kind).create({ tenantId, code, name, parentId });
  return toPublicOrgUnit(created);
}

export async function getOrgUnit(
  tenantId: string,
  kind: OrgKind,
  id: string,
): Promise<PublicOrgUnit> {
  const unit = await repoFor(kind).findById(tenantId, id);
  if (unit === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicOrgUnit(unit);
}

export interface OrgListPage {
  readonly items: readonly PublicOrgUnit[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export async function listOrgUnits(
  tenantId: string,
  kind: OrgKind,
  page: number,
  limit: number,
): Promise<OrgListPage> {
  const result = await repoFor(kind).list(tenantId, page, limit);
  return {
    items: result.items.map(toPublicOrgUnit),
    page,
    limit,
    total: result.total,
  };
}

export async function updateOrgUnit(
  tenantId: string,
  kind: OrgKind,
  id: string,
  patch: PatchOrgInput,
): Promise<PublicOrgUnit> {
  const current = await repoFor(kind).findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError('Resource not found');
  }

  const set: { name?: string; status?: OrgStatus } = {};
  if (patch.name !== undefined) {
    set.name = assertName(patch.name);
  }
  if (patch.status !== undefined) {
    if (patch.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (patch.status === 'archived' && !canArchive(current.status)) {
      throw new ConflictError('Unit is already archived');
    }
    if (patch.status === 'active' && !canRestore(current.status)) {
      throw new ConflictError('Unit is not archived');
    }
    set.status = patch.status;
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  const updated = await repoFor(kind).update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicOrgUnit(updated);
}

/** DELETE = soft-delete (archivado). El dato se conserva para integridad. */
export async function archiveOrgUnit(
  tenantId: string,
  kind: OrgKind,
  id: string,
): Promise<PublicOrgUnit> {
  const current = await repoFor(kind).findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError('Resource not found');
  }
  if (!canArchive(current.status)) {
    throw new ConflictError('Unit is already archived');
  }
  const updated = await repoFor(kind).update(tenantId, id, { status: 'archived' });
  if (updated === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicOrgUnit(updated);
}
