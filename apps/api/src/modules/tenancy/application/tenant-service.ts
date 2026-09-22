import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  createUser,
  hashPassword,
  revokeTenantSessions,
  toPublicUser,
  validatePasswordPolicy,
  type PublicUser,
} from '../../identity/index.js';
import type { PublicTenant, Tenant } from '../domain/entities/tenant.js';
import { toPublicTenant } from '../domain/entities/tenant.js';
import {
  canReactivate,
  canSuspend,
  normalizeSlug,
  validateSlug,
  validateTenantName,
} from '../domain/rules/tenant-rules.js';
import * as repo from '../infrastructure/repositories/tenant-repository.js';

/**
 * Casos de uso de tenancy.
 * `tenancy → identity` es la única dependencia entre módulos de esta fase;
 * identity NO importa tenancy (su chequeo de estado entra por inyección en la
 * composition root), evitando ciclos.
 */

export interface ProvisionOwnerInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
}

export interface ProvisionTenantInput {
  readonly slug?: string;
  readonly name: string;
  readonly owner: ProvisionOwnerInput;
}

export interface ProvisionedTenant {
  readonly tenant: PublicTenant;
  readonly owner: PublicUser;
}

/**
 * Provisiona un tenant + su usuario owner en un solo caso de uso.
 * Sin transacción real (Mongo standalone en dev/test): si falla la creación
 * del owner se compensa borrando el tenant recién creado.
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionedTenant> {
  const name = validateTenantName(input.name);
  if (!name.valid) {
    throw new ValidationError('Invalid tenant name', { issues: name.issues });
  }

  const slug = normalizeSlug(input.slug ?? name.value);
  const slugCheck = validateSlug(slug);
  if (!slugCheck.valid) {
    throw new ValidationError('Invalid slug', { issues: slugCheck.issues });
  }

  const policy = validatePasswordPolicy(input.owner.password);
  if (!policy.valid) {
    throw new ValidationError('Password does not meet policy', { issues: policy.issues });
  }

  const existing = await repo.findTenantBySlug(slug);
  if (existing !== null) {
    throw new ConflictError('Slug already in use');
  }

  const tenant = await repo.insertTenant({ slug, name: name.value });

  let owner: PublicUser;
  try {
    const created = await createUser({
      email: input.owner.email,
      tenantId: tenant.id,
      passwordHash: await hashPassword(input.owner.password),
      displayName: input.owner.displayName,
      roles: ['owner'],
    });
    owner = toPublicUser(created);
  } catch (error) {
    // Compensación: no dejar un tenant huérfano sin owner.
    await repo.deleteTenantById(tenant.id);
    throw error;
  }

  return { tenant: toPublicTenant(tenant), owner };
}

export async function getTenantById(id: string): Promise<Tenant> {
  const tenant = await repo.findTenantById(id);
  if (tenant === null) {
    throw new NotFoundError('Tenant not found');
  }
  return tenant;
}

export async function renameTenant(id: string, rawName: string): Promise<Tenant> {
  const name = validateTenantName(rawName);
  if (!name.valid) {
    throw new ValidationError('Invalid tenant name', { issues: name.issues });
  }
  const tenant = await repo.updateTenantName(id, name.value);
  if (tenant === null) {
    throw new NotFoundError('Tenant not found');
  }
  return tenant;
}

export interface TenantListPage {
  readonly items: readonly PublicTenant[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export async function listTenants(page: number, limit: number): Promise<TenantListPage> {
  const result = await repo.listTenants(page, limit);
  return {
    items: result.items.map(toPublicTenant),
    page,
    limit,
    total: result.total,
  };
}

/**
 * Suspende un tenant: cambia el estado y revoca TODAS sus sesiones y refresh
 * tokens (el corte debe ser inmediato, no al expirar el JWT).
 */
export async function suspendTenant(id: string): Promise<Tenant> {
  const tenant = await getTenantById(id);
  if (!canSuspend(tenant.status)) {
    throw new ConflictError('Tenant already suspended');
  }
  const updated = await repo.setTenantStatus(id, 'suspended');
  if (updated === null) {
    throw new NotFoundError('Tenant not found');
  }
  await revokeTenantSessions(id);
  return updated;
}

export async function reactivateTenant(id: string): Promise<Tenant> {
  const tenant = await getTenantById(id);
  if (!canReactivate(tenant.status)) {
    throw new ConflictError('Tenant is not suspended');
  }
  const updated = await repo.setTenantStatus(id, 'active');
  if (updated === null) {
    throw new NotFoundError('Tenant not found');
  }
  return updated;
}

/**
 * Estado para el login de identity.
 * Política (documentada): solo un tenant EXISTENTE en `suspended` bloquea.
 * Un tenantId sin documento (datos de prueba/legacy) no bloquea — endurecer
 * cuando FASE 5-6 haga del tenant un requisito de creación de usuarios.
 */
export async function isTenantActive(tenantId: string): Promise<boolean> {
  const tenant = await repo.findTenantById(tenantId);
  return tenant === null || tenant.status === 'active';
}
