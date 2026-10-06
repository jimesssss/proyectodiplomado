/**
 * Dominio Identity — entidades puras (sin Express, sin Mongoose).
 */

export type UserStatus = 'active' | 'disabled';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly status: UserStatus;
  readonly emailVerifiedAt?: Date | null;
  readonly emailVerificationTokenHash?: string | null;
  readonly emailVerificationExpiresAt?: Date | null;
  readonly passwordResetTokenHash?: string | null;
  readonly passwordResetExpiresAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Representación segura del usuario (jamás el hash de contraseña). */
export interface PublicUser {
  readonly permissions?: readonly string[];
  readonly id: string;
  readonly email: string;
  readonly tenantId: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly status: UserStatus;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    tenantId: user.tenantId,
    displayName: user.displayName,
    roles: user.roles,
    status: user.status,
  };
}
