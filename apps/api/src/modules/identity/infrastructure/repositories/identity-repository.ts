import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { asTenantId } from '../../../../core/tenant/tenant-id.js';
import type { User } from '../../domain/entities/user.js';
import type { AttemptState } from '../../domain/rules/auth-rules.js';
import {
  LoginAttemptModel,
  RefreshTokenModel,
  SessionModel,
  UserModel,
} from '../schemas/collections.js';
import type { UserDoc } from '../schemas/types.js';

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
}): Promise<User> {
  const doc = await UserModel.create({
    email: input.email.toLowerCase().trim(),
    tenantId: input.tenantId,
    passwordHash: input.passwordHash,
    displayName: input.displayName,
    roles: [...(input.roles ?? [])],
  });
  return toUser(doc.toObject() as unknown as UserDoc);
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { passwordHash } });
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
