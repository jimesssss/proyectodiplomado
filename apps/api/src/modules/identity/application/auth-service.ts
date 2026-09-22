import { randomBytes } from 'node:crypto';
import type { JwtService } from '../../../core/auth/jwt.js';
import { hashPassword, verifyPassword } from '../../../core/auth/password.js';
import type { SessionChecker } from '../../../core/auth/middleware.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '../../../core/errors/app-error.js';
import type { PublicUser, User } from '../domain/entities/user.js';
import { toPublicUser } from '../domain/entities/user.js';
import {
  isLocked,
  recordFailedAttempt,
  validatePasswordPolicy,
} from '../domain/rules/auth-rules.js';
import * as repo from '../infrastructure/repositories/identity-repository.js';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly user: PublicUser;
}

export interface AuthDeps {
  readonly jwt: JwtService;
  readonly accessTokenTtl: number;
  readonly refreshTokenTtl: number;
  /**
   * Estado del tenant (inyectado desde tenancy en la composition root;
   * identity no importa ese módulo → sin ciclos). `false` = suspendido.
   */
  readonly isTenantActive: (tenantId: string) => Promise<boolean>;
}

interface LoginInput {
  readonly email: string;
  readonly password: string;
  readonly tenantId?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

/**
 * Login:
 * 1. Anti-fuerza bruta por (tenant, email).
 * 2. Resolución de usuario: si el cliente indica tenant, busca ahí; si no,
 *    debe existir exactamente un usuario con ese email (multi-tenant amigable).
 * 3. Verifica Argon2id, crea sesión + refresh rotativo, firma access JWT.
 * Los errores de credenciales son genéricos (no revelan si existe la cuenta).
 */
export async function login(deps: AuthDeps, input: LoginInput): Promise<AuthTokens> {
  const email = input.email.toLowerCase().trim();
  const now = Date.now();

  // El bloqueo necesita tenant; si no viene, no podemos evaluar la clave.
  // Se evalúa por clave resuelta tras encontrar el usuario, y de forma
  // preventiva si tenantId viene explícito.
  if (input.tenantId !== undefined) {
    const state = await repo.getLoginAttemptState(input.tenantId, email);
    if (isLocked(state, now)) {
      throw new RateLimitedError('Too many login attempts. Try again later.');
    }
  }

  let user: User | null;
  if (input.tenantId !== undefined) {
    user = await repo.findUserByTenantAndEmail(input.tenantId, email);
  } else {
    user = await repo.findUserByEmail(email);
  }

  if (user === null) {
    // Contestar con credenciales inválidas sin revelar existencia.
    throw new UnauthenticatedError('Invalid credentials');
  }

  const state = await repo.getLoginAttemptState(user.tenantId, email);
  if (isLocked(state, now)) {
    throw new RateLimitedError('Too many login attempts. Try again later.');
  }

  const storedHash = await repo.getUserPasswordHash(user.id);
  const validPassword = storedHash !== null && (await verifyPassword(storedHash, input.password));

  if (!validPassword) {
    const next = recordFailedAttempt(state, now);
    await repo.saveLoginAttemptState(user.tenantId, email, next.state);
    throw new UnauthenticatedError('Invalid credentials');
  }

  if (user.status !== 'active') {
    throw new ForbiddenError('Account disabled');
  }

  // Credenciales verificadas → ahora sí se revela si el tenant está suspendido
  // (antes revelaría estado sin autenticarse).
  if (!(await deps.isTenantActive(user.tenantId))) {
    throw new ForbiddenError('Tenant suspended');
  }

  await repo.clearLoginAttempts(user.tenantId, email);

  const { sessionId } = await repo.createSession({
    userId: user.id,
    tenantId: user.tenantId,
    ttlSeconds: deps.refreshTokenTtl,
    ...(input.ip !== undefined ? { ip: input.ip } : {}),
    ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
  });

  // permissions vacío hasta FASE 6 (catálogo RBAC).
  const accessToken = deps.jwt.signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    roles: user.roles,
    permissions: [],
    sessionId,
  });

  const refreshToken = randomBytes(48).toString('base64url');
  await repo.storeRefreshToken({
    tokenHash: repo.hashRefreshToken(refreshToken),
    sessionId,
    userId: user.id,
    tenantId: user.tenantId,
    ttlSeconds: deps.refreshTokenTtl,
  });

  return { accessToken, refreshToken, expiresIn: deps.accessTokenTtl, user: toPublicUser(user) };
}

/**
 * Refresh con rotación obligatoria:
 * - Token usado (reutilización) → revoca toda la sesión (posible robo).
 * - Token inválido/expirado/revocado o sesión caída → 401.
 */
export async function refresh(deps: AuthDeps, refreshToken: string): Promise<AuthTokens> {
  const record = await repo.findRefreshToken(repo.hashRefreshToken(refreshToken));
  const invalid = new UnauthenticatedError('Invalid refresh token');

  if (record === null || record.revokedAt !== null || record.expiresAt.getTime() < Date.now()) {
    throw invalid;
  }

  if (record.usedAt !== null) {
    // Reutilización de refresh token → revocar la sesión completa.
    await repo.revokeSession(record.sessionId);
    await repo.revokeSessionRefreshTokens(record.sessionId);
    throw invalid;
  }

  const active = await repo.isSessionActive(record.sessionId, record.userId);
  if (!active) {
    throw invalid;
  }

  const user = await repo.findUserById(record.userId);
  if (user === null || user.status !== 'active') {
    throw invalid;
  }

  await repo.markRefreshTokenUsed(record.id);

  const accessToken = deps.jwt.signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    roles: user.roles,
    permissions: [],
    sessionId: record.sessionId,
  });

  const newRefresh = randomBytes(48).toString('base64url');
  await repo.storeRefreshToken({
    tokenHash: repo.hashRefreshToken(newRefresh),
    sessionId: record.sessionId,
    userId: user.id,
    tenantId: user.tenantId,
    ttlSeconds: deps.refreshTokenTtl,
  });

  return {
    accessToken,
    refreshToken: newRefresh,
    expiresIn: deps.accessTokenTtl,
    user: toPublicUser(user),
  };
}

/** Logout: revoca la sesión actual y todos sus refresh tokens. */
export async function logout(sessionId: string): Promise<void> {
  await repo.revokeSession(sessionId);
  await repo.revokeSessionRefreshTokens(sessionId);
}

/**
 * Cambio de contraseña: verifica la actual, aplica política, persiste hash
 * Argon2id nuevo y revoca el resto de sesiones (la actual sobrevive).
 */
export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const storedHash = await repo.getUserPasswordHash(userId);
  if (storedHash === null || !(await verifyPassword(storedHash, currentPassword))) {
    throw new UnauthenticatedError('Invalid credentials');
  }

  const policy = validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new ValidationError('Password does not meet policy', { issues: policy.issues });
  }

  if (await verifyPassword(storedHash, newPassword)) {
    throw new ConflictError('New password must differ from current password');
  }

  const newHash = await hashPassword(newPassword);
  await repo.updatePasswordHash(userId, newHash);
  await repo.revokeUserSessionsExcept(userId, sessionId);
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (user === null) {
    throw new NotFoundError('User not found');
  }
  return toPublicUser(user);
}

/**
 * Revoca TODAS las sesiones y refresh tokens de un tenant.
 * Lo usa tenancy al suspender un tenant: el corte de acceso es inmediato.
 */
export async function revokeTenantSessions(tenantId: string): Promise<void> {
  await repo.revokeTenantSessions(tenantId);
}

export const createSessionChecker = (): SessionChecker => {
  return (sessionId, userId) => repo.isSessionActive(sessionId, userId);
};
