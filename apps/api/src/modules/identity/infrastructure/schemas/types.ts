import type { Types } from 'mongoose';

/**
 * Tipos de documento (lean/create) de identity.
 * Se usa `Types.ObjectId` (no el `ObjectId` de nivel superior, que es
 * `mongodb.ObjectId` y NO es el mismo tipo: rompe los filtros de mongoose).
 */
export interface UserDoc {
  _id: Types.ObjectId;
  email: string;
  tenantId: string;
  passwordHash: string;
  displayName: string;
  roles: string[];
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleDoc {
  _id: Types.ObjectId;
  tenantId: string;
  key: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  tokenHash: string;
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
}

export interface LoginAttemptDoc {
  _id: Types.ObjectId;
  key: string;
  count: number;
  windowStart: Date;
  lockedUntil?: Date;
  updatedAt: Date;
}
