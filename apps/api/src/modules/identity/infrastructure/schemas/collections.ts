import mongoose from 'mongoose';
import { Schema, model, type Model } from 'mongoose';
import type { LoginAttemptDoc, RefreshTokenDoc, RoleDoc, SessionDoc, UserDoc } from './types.js';

/**
 * Colecciones del módulo identity (privadas del módulo).
 * Índices documentados en docs/database/identity.md.
 *
 * `models.X` es `any` en mongoose; se castea a `Model<T>` para conservar
 * el tipado de filtros/queries (y evitar elión de tipos con `??`).
 */

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = mongoose.models[name] as Model<T> | undefined;
  return existing ?? model<T>(name, schema);
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    tenantId: { type: String, required: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    roles: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    emailVerifiedAt: { type: Date, default: null },
    emailVerificationTokenHash: { type: String, default: null },
    emailVerificationExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);
// Unicidad de login: mismo email puede existir en dos tenants distintos.
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, status: 1 });

const roleSchema = new Schema<RoleDoc>(
  {
    tenantId: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'roles' },
);
roleSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const sessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    tenantId: { type: String, required: true },
    ip: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'sessions' },
);
sessionSchema.index({ userId: 1, revokedAt: 1 });
// TTL: Mongo purga sesiones expiradas.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    tokenHash: { type: String, required: true },
    sessionId: { type: Schema.Types.ObjectId, required: true, ref: 'Session' },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    tenantId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'refreshTokens' },
);
refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ sessionId: 1, revokedAt: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const loginAttemptSchema = new Schema<LoginAttemptDoc>(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    windowStart: { type: Date, required: true },
    lockedUntil: { type: Date },
  },
  { timestamps: { updatedAt: true }, collection: 'loginAttempts' },
);
loginAttemptSchema.index({ key: 1 }, { unique: true });
loginAttemptSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export const UserModel = getModel<UserDoc>('User', userSchema);
export const RoleModel = getModel<RoleDoc>('Role', roleSchema);
export const SessionModel = getModel<SessionDoc>('Session', sessionSchema);
export const RefreshTokenModel = getModel<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
export const LoginAttemptModel = getModel<LoginAttemptDoc>('LoginAttempt', loginAttemptSchema);
