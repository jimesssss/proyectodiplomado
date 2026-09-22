import {
  ALL_PERMISSIONS,
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_CATALOG_VERSION,
  isBuiltinRole,
  type Permission,
} from '@erp/permissions';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import { hashPassword } from '../../../core/auth/password.js';
import { toPublicRole, type PublicRole } from '../domain/entities/role.js';
import { toPublicUser, type PublicUser, type User } from '../domain/entities/user.js';
import { validatePermissionList, validateRoleKey } from '../domain/rules/rbac-rules.js';
import { validatePasswordPolicy } from '../domain/rules/auth-rules.js';
import * as repo from '../infrastructure/repositories/identity-repository.js';

/**
 * Casos de uso RBAC (ADR-005). `tenantId` SIEMPRE del JWT: roles y usuarios
 * jamás cruzan de tenant. Los roles embutidos (`owner`, `super_admin`) no son
 * documentos: resuelven permisos desde el catálogo compartido.
 */

// --- Resolución de permisos (login/refresh) ---

export async function resolvePermissions(
  tenantId: string,
  roles: readonly string[],
): Promise<readonly Permission[]> {
  const builtin = roles.find((role) => isBuiltinRole(role));
  if (builtin !== undefined) {
    return BUILTIN_ROLE_PERMISSIONS[builtin];
  }
  const docs = await repo.findRolePermissions(tenantId, roles);
  const unique = new Set<Permission>();
  for (const role of docs) {
    for (const permission of role.permissions) {
      unique.add(permission);
    }
  }
  return [...unique].sort();
}

export function permissionCatalog(): {
  readonly version: number;
  readonly permissions: readonly Permission[];
} {
  return { version: PERMISSION_CATALOG_VERSION, permissions: ALL_PERMISSIONS };
}

export function permissionGroups(): Readonly<Record<string, readonly Permission[]>> {
  return PERMISSIONS as unknown as Readonly<Record<string, readonly Permission[]>>;
}

// --- Roles ---

export interface CreateRoleInput {
  readonly key: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly permissions?: readonly string[] | undefined;
}

function assertPermissionList(keys: readonly string[] | undefined): readonly Permission[] {
  const result = validatePermissionList(keys ?? []);
  if (!result.valid) {
    throw new ValidationError('Invalid permissions', { issues: result.issues });
  }
  return result.value;
}

export async function createRole(tenantId: string, input: CreateRoleInput): Promise<PublicRole> {
  const keyCheck = validateRoleKey(input.key);
  if (!keyCheck.valid) {
    throw new ValidationError('Invalid role key', { issues: keyCheck.issues });
  }
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ValidationError('Invalid role name', { issues: ['Name must not be empty'] });
  }
  const permissions = assertPermissionList(input.permissions);
  const description = input.description?.trim();

  const existing = await repo.findRoleByKey(tenantId, input.key);
  if (existing !== null) {
    throw new ConflictError('Role key already in use in this tenant');
  }

  const role = await repo.insertRole(tenantId, {
    key: input.key,
    name,
    ...(description !== undefined && description !== '' ? { description } : {}),
    permissions,
  });
  return toPublicRole(role);
}

export async function listRoles(
  tenantId: string,
  page: number,
  limit: number,
): Promise<{
  readonly items: readonly PublicRole[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}> {
  const result = await repo.listRoles(tenantId, page, limit);
  return { items: result.items.map(toPublicRole), page, limit, total: result.total };
}

export async function getRole(tenantId: string, id: string): Promise<PublicRole> {
  const role = await repo.findRoleById(tenantId, id);
  if (role === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicRole(role);
}

export interface PatchRoleInput {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly permissions?: readonly string[] | undefined;
}

export async function updateRole(
  tenantId: string,
  id: string,
  patch: PatchRoleInput,
): Promise<PublicRole> {
  const current = await repo.findRoleById(tenantId, id);
  if (current === null) {
    throw new NotFoundError('Resource not found');
  }

  const set: { name?: string; description?: string; permissions?: readonly Permission[] } = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) {
      throw new ValidationError('Invalid role name', { issues: ['Name must not be empty'] });
    }
    set.name = name;
  }
  if (patch.description !== undefined) {
    set.description = patch.description.trim();
  }
  if (patch.permissions !== undefined) {
    set.permissions = assertPermissionList(patch.permissions);
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  const updated = await repo.updateRoleInTenant(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicRole(updated);
}

/** Borrado físico del rol; en uso por usuarios → 409 (los afecta). */
export async function deleteRole(tenantId: string, id: string): Promise<{ deleted: true }> {
  const role = await repo.findRoleById(tenantId, id);
  if (role === null) {
    throw new NotFoundError('Resource not found');
  }
  if (isBuiltinRole(role.key)) {
    throw new ConflictError('Built-in role cannot be deleted');
  }
  const inUse = await repo.countUsersWithRole(tenantId, role.key);
  if (inUse > 0) {
    throw new ConflictError('Role is assigned to users');
  }
  const deleted = await repo.deleteRoleInTenant(tenantId, id);
  if (!deleted) {
    throw new NotFoundError('Resource not found');
  }
  return { deleted: true };
}

// --- Usuarios (CRUD de administración) ---

/** Validación de roles asignables: existen en el tenant o son embutidos. */
async function assertAssignableRoles(
  tenantId: string,
  keys: readonly string[],
): Promise<readonly string[]> {
  for (const key of keys) {
    if (isBuiltinRole(key)) {
      continue;
    }
    const role = await repo.findRoleByKey(tenantId, key);
    if (role === null) {
      throw new ValidationError('Unknown role', { role: key });
    }
  }
  return [...keys];
}

export interface CreateUserInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly roles?: readonly string[] | undefined;
}

export async function createAppUser(tenantId: string, input: CreateUserInput): Promise<PublicUser> {
  const policy = validatePasswordPolicy(input.password);
  if (!policy.valid) {
    throw new ValidationError('Password does not meet policy', { issues: policy.issues });
  }
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new ValidationError('Invalid display name', {
      issues: ['Display name must not be empty'],
    });
  }
  const roles = await assertAssignableRoles(tenantId, input.roles ?? []);

  const user = await repo.createUser({
    email: input.email,
    tenantId,
    passwordHash: await hashPassword(input.password),
    displayName,
    roles,
  });
  return toPublicUser(user);
}

export async function listAppUsers(
  tenantId: string,
  page: number,
  limit: number,
): Promise<{
  readonly items: readonly PublicUser[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}> {
  const result = await repo.listUsers(tenantId, page, limit);
  return { items: result.items.map(toPublicUser), page, limit, total: result.total };
}

export async function getAppUser(tenantId: string, id: string): Promise<PublicUser> {
  const user = await repo.findUserInTenant(tenantId, id);
  if (user === null) {
    throw new NotFoundError('Resource not found');
  }
  return toPublicUser(user);
}

export interface PatchUserInput {
  readonly displayName?: string | undefined;
  readonly status?: 'active' | 'disabled' | undefined;
  readonly roles?: readonly string[] | undefined;
}

/**
 * Actualiza un usuario del tenant. Si cambian los roles o el estado, se
 * revocan TODAS sus sesiones: los JWT vigentes quedan con permisos viejos
 * y obligan a re-autenticarse (coherencia con `pv` de ADR-005).
 */
export async function updateAppUser(
  tenantId: string,
  id: string,
  patch: PatchUserInput,
): Promise<PublicUser> {
  const current: User | null = await repo.findUserInTenant(tenantId, id);
  if (current === null) {
    throw new NotFoundError('Resource not found');
  }

  const set: {
    displayName?: string;
    status?: 'active' | 'disabled';
    roles?: readonly string[];
  } = {};
  if (patch.displayName !== undefined) {
    const displayName = patch.displayName.trim();
    if (displayName.length === 0) {
      throw new ValidationError('Invalid display name', {
        issues: ['Display name must not be empty'],
      });
    }
    set.displayName = displayName;
  }
  if (patch.status !== undefined) {
    set.status = patch.status;
  }
  if (patch.roles !== undefined) {
    set.roles = await assertAssignableRoles(tenantId, patch.roles);
  }
  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  const updated = await repo.updateUserInTenant(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError('Resource not found');
  }

  const rolesChanged =
    set.roles !== undefined && JSON.stringify(set.roles) !== JSON.stringify(current.roles);
  if (rolesChanged || set.status !== undefined) {
    await repo.revokeUserSessionsExcept(id, '');
  }
  return toPublicUser(updated);
}
