import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import { asTenantId } from '../../../../core/tenant/tenant-id.js';
import type { Permission } from '@erp/permissions';
import type { Role } from '../../domain/entities/role.js';
import type { User } from '../../domain/entities/user.js';
import type { AttemptState } from '../../domain/rules/auth-rules.js';
import {
  LoginAttemptModel,
  RefreshTokenModel,
  RoleModel,
  SessionModel,
  UserModel,
} from '../schemas/collections.js';
import type { RoleDoc, UserDoc } from '../schemas/types.js';

/**
 * Repositorios de identity — único camino a MongoDB del módulo.
 * Toda consulta filtra por tenantId (excepto login, que resuelve el tenant
 * a partir de las credenciales: la identidad es el punto de entrada).
 */

function toUser(doc: UserDoc): User {
  return {
    id: doc._id.toString(),
    email: doc.email,
    tenantId: doc.tenantId,
    displayName: doc.displayName,
    roles: doc.roles,
    status: doc.status,
    emailVerifiedAt: doc.emailVerifiedAt ?? null,
    emailVerificationTokenHash: doc.emailVerificationTokenHash ?? null,
    emailVerificationExpiresAt: doc.emailVerificationExpiresAt ?? null,
    passwordResetTokenHash: doc.passwordResetTokenHash ?? null,
    passwordResetExpiresAt: doc.passwordResetExpiresAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const doc = await UserModel.findOne({ email: email.toLowerCase().trim() }).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function findUserByTenantAndEmail(
  tenantId: string,
  email: string,
): Promise<User | null> {
  const doc = await UserModel.findOne({
    tenantId,
    email: email.toLowerCase().trim(),
  }).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function findUserById(id: string): Promise<User | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await UserModel.findById(id).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function createUser(input: {
  email: string;
  tenantId: string;
  passwordHash: string;
  displayName: string;
  roles?: readonly string[];
  status?: 'active' | 'disabled';
  emailVerifiedAt?: Date | null;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpiresAt?: Date | null;
}): Promise<User> {
  try {
    const doc = await UserModel.create({
      email: input.email.toLowerCase().trim(),
      tenantId: input.tenantId,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      roles: [...(input.roles ?? [])],
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.emailVerifiedAt !== undefined ? { emailVerifiedAt: input.emailVerifiedAt } : {}),
      ...(input.emailVerificationTokenHash !== undefined
        ? { emailVerificationTokenHash: input.emailVerificationTokenHash }
        : {}),
      ...(input.emailVerificationExpiresAt !== undefined
        ? { emailVerificationExpiresAt: input.emailVerificationExpiresAt }
        : {}),
    });
    return toUser(doc.toObject() as unknown as UserDoc);
  } catch (error) {
    // (tenantId, email) unique → el duplicado del MISMO tenant es un 409.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      throw new ConflictError('Email already in use in this tenant');
    }
    throw error;
  }
}

export async function updateVerificationToken(
  userId: string,
  input: { tokenHash: string; expiresAt: Date },
): Promise<void> {
  await UserModel.updateOne(
    { _id: new Types.ObjectId(userId) },
    {
      $set: {
        emailVerificationTokenHash: input.tokenHash,
        emailVerificationExpiresAt: input.expiresAt,
      },
    },
  );
}

export async function findUserByVerificationToken(token: string): Promise<User | null> {
  const hash = createHash('sha256').update(token).digest('hex');
  const doc = await UserModel.findOne({ emailVerificationTokenHash: hash }).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function clearEmailVerificationToken(userId: string): Promise<void> {
  await UserModel.updateOne(
    { _id: new Types.ObjectId(userId) },
    { $set: { emailVerificationTokenHash: null, emailVerificationExpiresAt: null } },
  );
}

export async function activateUserAfterVerification(userId: string): Promise<User | null> {
  const doc = await UserModel.findOneAndUpdate(
    { _id: new Types.ObjectId(userId) },
    {
      $set: {
        status: 'active',
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { passwordHash } });
}

export async function updatePasswordResetToken(
  userId: string,
  input: { tokenHash: string; expiresAt: Date },
): Promise<void> {
  await UserModel.updateOne(
    { _id: new Types.ObjectId(userId) },
    {
      $set: {
        passwordResetTokenHash: input.tokenHash,
        passwordResetExpiresAt: input.expiresAt,
      },
    },
  );
}

export async function consumePasswordResetToken(input: {
  tokenHash: string;
  passwordHash: string;
  now: Date;
}): Promise<User | null> {
  const doc = await UserModel.findOneAndUpdate(
    {
      passwordResetTokenHash: input.tokenHash,
      passwordResetExpiresAt: { $gt: input.now },
      status: 'active',
    },
    {
      $set: {
        passwordHash: input.passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function getUserPasswordHash(userId: string): Promise<string | null> {
  const doc = await UserModel.findById(userId, { passwordHash: 1 }).lean();
  return doc === null ? null : ((doc as { passwordHash?: string }).passwordHash ?? null);
}

// --- Sessions ---

export async function createSession(input: {
  userId: string;
  tenantId: string;
  ttlSeconds: number;
  ip?: string;
  userAgent?: string;
}): Promise<{ sessionId: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
  const doc = await SessionModel.create({
    userId: new Types.ObjectId(input.userId),
    tenantId: input.tenantId,
    expiresAt,
    ...(input.ip !== undefined ? { ip: input.ip } : {}),
    ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
  });
  return { sessionId: doc._id.toString(), expiresAt };
}

export async function isSessionActive(sessionId: string, userId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(sessionId) || !Types.ObjectId.isValid(userId)) {
    return false;
  }
  const doc = await SessionModel.findOne({
    _id: new Types.ObjectId(sessionId),
    userId: new Types.ObjectId(userId),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select({ _id: 1 })
    .lean();
  return doc !== null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!Types.ObjectId.isValid(sessionId)) {
    return;
  }
  await SessionModel.updateOne(
    { _id: new Types.ObjectId(sessionId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeUserSessionsExcept(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(userId)) {
    return;
  }
  await SessionModel.updateMany(
    {
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      ...(Types.ObjectId.isValid(keepSessionId)
        ? { _id: { $ne: new Types.ObjectId(keepSessionId) } }
        : {}),
    },
    { $set: { revokedAt: new Date() } },
  );
  await RefreshTokenModel.updateMany(
    {
      userId: new Types.ObjectId(userId),
      revokedAt: null,
      ...(Types.ObjectId.isValid(keepSessionId)
        ? { sessionId: { $ne: new Types.ObjectId(keepSessionId) } }
        : {}),
    },
    { $set: { revokedAt: new Date() } },
  );
}

// --- Refresh tokens ---

export function hashRefreshToken(token: string): string {
  // SHA-256 del token opaco: si la colección se filtra, los tokens no sirven.
  return createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(input: {
  tokenHash: string;
  sessionId: string;
  userId: string;
  tenantId: string;
  ttlSeconds: number;
}): Promise<void> {
  await RefreshTokenModel.create({
    tokenHash: input.tokenHash,
    sessionId: new Types.ObjectId(input.sessionId),
    userId: new Types.ObjectId(input.userId),
    tenantId: input.tenantId,
    expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
  });
}

export interface RefreshTokenRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
}

function toRefreshRecord(doc: {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
}): RefreshTokenRecord {
  return {
    id: doc._id.toString(),
    sessionId: doc.sessionId.toString(),
    userId: doc.userId.toString(),
    tenantId: doc.tenantId,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt ?? null,
    revokedAt: doc.revokedAt ?? null,
  };
}

export async function findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
  const doc = await RefreshTokenModel.findOne({ tokenHash }).lean();
  return doc === null ? null : toRefreshRecord(doc);
}

export async function markRefreshTokenUsed(tokenId: string): Promise<void> {
  await RefreshTokenModel.updateOne(
    { _id: new Types.ObjectId(tokenId) },
    { $set: { usedAt: new Date() } },
  );
}

export async function revokeSessionRefreshTokens(sessionId: string): Promise<void> {
  if (!Types.ObjectId.isValid(sessionId)) {
    return;
  }
  await RefreshTokenModel.updateMany(
    { sessionId: new Types.ObjectId(sessionId), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/**
 * Revoca todas las sesiones y refresh tokens de un tenant (uso: suspensión
 * del tenant por tenancy → corte inmediato de acceso).
 */
export async function revokeTenantSessions(tenantId: string): Promise<void> {
  const now = new Date();
  await SessionModel.updateMany({ tenantId, revokedAt: null }, { $set: { revokedAt: now } });
  await RefreshTokenModel.updateMany({ tenantId, revokedAt: null }, { $set: { revokedAt: now } });
}

// --- Login attempts ---

function attemptKey(tenantId: string, email: string): string {
  return `${tenantId}:${email.toLowerCase().trim()}`;
}

export async function getLoginAttemptState(
  tenantId: string,
  email: string,
): Promise<AttemptState | null> {
  const doc = await LoginAttemptModel.findOne({ key: attemptKey(tenantId, email) }).lean();
  if (doc === null) {
    return null;
  }
  return {
    count: doc.count,
    windowStart: doc.windowStart.getTime(),
    ...(doc.lockedUntil !== undefined ? { lockedUntil: doc.lockedUntil.getTime() } : {}),
  };
}

export async function saveLoginAttemptState(
  tenantId: string,
  email: string,
  state: AttemptState,
): Promise<void> {
  await LoginAttemptModel.updateOne(
    { key: attemptKey(tenantId, email) },
    {
      $set: {
        count: state.count,
        windowStart: new Date(state.windowStart),
        ...(state.lockedUntil !== undefined ? { lockedUntil: new Date(state.lockedUntil) } : {}),
      },
    },
    { upsert: true },
  );
}

export async function clearLoginAttempts(tenantId: string, email: string): Promise<void> {
  await LoginAttemptModel.deleteOne({ key: attemptKey(tenantId, email) });
}

export function tenantIdOf(user: User): string {
  return asTenantId(user.tenantId);
}

// --- Users (RBAC: listado/consulta/actualización por tenant) ---

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export async function listUsers(
  tenantId: string,
  page: number,
  limit: number,
): Promise<Page<User>> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    UserModel.find({ tenantId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    UserModel.countDocuments({ tenantId }),
  ]);
  return { items: docs.map((doc) => toUser(doc as unknown as UserDoc)), total };
}

/** Usuario DENTRO del tenant (id ajeno → null → 404 uniforme). */
export async function findUserInTenant(tenantId: string, id: string): Promise<User | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await UserModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

export async function updateUserInTenant(
  tenantId: string,
  id: string,
  patch: { displayName?: string; status?: 'active' | 'disabled'; roles?: readonly string[] },
): Promise<User | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const $set: { displayName?: string; status?: 'active' | 'disabled'; roles?: string[] } = {};
  if (patch.displayName !== undefined) {
    $set.displayName = patch.displayName;
  }
  if (patch.status !== undefined) {
    $set.status = patch.status;
  }
  if (patch.roles !== undefined) {
    $set.roles = [...patch.roles];
  }
  const doc = await UserModel.findOneAndUpdate(
    { _id: new Types.ObjectId(id), tenantId },
    { $set },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toUser(doc as unknown as UserDoc);
}

// --- Roles (tenant-scoped, ADR-005) ---

function toRole(doc: RoleDoc): Role {
  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    key: doc.key,
    name: doc.name,
    description: doc.description ?? null,
    permissions: [...(doc.permissions ?? [])] as readonly Permission[],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function listRoles(
  tenantId: string,
  page: number,
  limit: number,
): Promise<Page<Role>> {
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    RoleModel.find({ tenantId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    RoleModel.countDocuments({ tenantId }),
  ]);
  return { items: docs.map((doc) => toRole(doc as unknown as RoleDoc)), total };
}

export async function findRoleById(tenantId: string, id: string): Promise<Role | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const doc = await RoleModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
  return doc === null ? null : toRole(doc as unknown as RoleDoc);
}

export async function findRoleByKey(tenantId: string, key: string): Promise<Role | null> {
  const doc = await RoleModel.findOne({ tenantId, key }).lean();
  return doc === null ? null : toRole(doc as unknown as RoleDoc);
}

/** Permisos efectivos de un conjunto de roles (para el JWT en login/refresh). */
export async function findRolePermissions(
  tenantId: string,
  keys: readonly string[],
): Promise<readonly Role[]> {
  if (keys.length === 0) {
    return [];
  }
  const docs = await RoleModel.find({ tenantId, key: { $in: [...keys] } }).lean();
  return docs.map((doc) => toRole(doc as unknown as RoleDoc));
}

export async function insertRole(
  tenantId: string,
  input: {
    key: string;
    name: string;
    description?: string;
    permissions: readonly Permission[];
  },
): Promise<Role> {
  try {
    const doc = await RoleModel.create({
      tenantId,
      key: input.key,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      permissions: [...input.permissions],
    });
    return toRole(doc.toObject() as unknown as RoleDoc);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      throw new ConflictError('Role key already in use in this tenant');
    }
    throw error;
  }
}

export async function updateRoleInTenant(
  tenantId: string,
  id: string,
  patch: { name?: string; description?: string; permissions?: readonly Permission[] },
): Promise<Role | null> {
  if (!Types.ObjectId.isValid(id)) {
    return null;
  }
  const $set: { name?: string; description?: string; permissions?: string[] } = {};
  if (patch.name !== undefined) {
    $set.name = patch.name;
  }
  if (patch.description !== undefined) {
    $set.description = patch.description;
  }
  if (patch.permissions !== undefined) {
    $set.permissions = [...patch.permissions];
  }
  const doc = await RoleModel.findOneAndUpdate(
    { _id: new Types.ObjectId(id), tenantId },
    { $set },
    { returnDocument: 'after' },
  ).lean();
  return doc === null ? null : toRole(doc as unknown as RoleDoc);
}

export async function deleteRoleInTenant(tenantId: string, id: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(id)) {
    return false;
  }
  const result = await RoleModel.deleteOne({ _id: new Types.ObjectId(id), tenantId });
  return result.deletedCount === 1;
}

export async function countUsersWithRole(tenantId: string, key: string): Promise<number> {
  return UserModel.countDocuments({ tenantId, roles: key });
}
