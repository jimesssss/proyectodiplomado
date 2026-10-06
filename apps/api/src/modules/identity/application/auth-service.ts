import { randomBytes } from 'node:crypto';
import { PERMISSION_CATALOG_VERSION } from '@erp/permissions';
import { recordAudit } from '../../../core/audit/audit.js';
import type { JwtService } from '../../../core/auth/jwt.js';
import { hashPassword, verifyPassword } from '../../../core/auth/password.js';
import type { SessionChecker } from '../../../core/auth/middleware.js';
import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
  buildVerificationUrl,
  buildWelcomeEmailHtml,
  buildWelcomeEmailText,
  hashVerificationToken,
  sendResendEmail,
} from '../../../core/email/resend.js';
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
import { resolvePermissions } from './rbac-service.js';
export { forgotPassword, resetPassword } from './password-reset-service.js';

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
  /** Contexto de auditoría (siempre presente desde la ruta). */
  readonly requestId: string;
}

export interface RefreshContext {
  readonly requestId: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface RegisterInput {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

export interface RegisterResult {
  readonly user: PublicUser;
  readonly emailVerificationRequired: boolean;
}

async function sendVerificationEmailForUser(user: User, token: string): Promise<void> {
  const verifyUrl = buildVerificationUrl(token);
  try {
    await sendResendEmail({
      to: user.email,
      subject: 'Verifica tu cuenta de ERP-SC',
      html: buildVerificationEmailHtml(user.displayName, verifyUrl),
      text: buildVerificationEmailText(user.displayName, verifyUrl),
    });
  } catch {
    // La verificación sigue siendo válida; el envío de correo puede fallar sin
    // romper la creación del usuario ni el login existente.
  }
}

async function sendWelcomeEmailForUser(user: User): Promise<void> {
  try {
    await sendResendEmail({
      to: user.email,
      subject: 'Bienvenido a ERP-SC',
      html: buildWelcomeEmailHtml(user.displayName),
      text: buildWelcomeEmailText(user.displayName),
    });
  } catch {
    // No romper el flujo de verificación por un problema de correo.
  }
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const displayName = input.displayName.trim();
  const email = input.email.toLowerCase().trim();

  if (displayName.length < 2 || displayName.length > 80) {
    throw new ValidationError('Display name must be between 2 and 80 characters');
  }

  const policy = validatePasswordPolicy(input.password);
  if (!policy.valid) {
    throw new ValidationError('Password does not meet policy', { issues: policy.issues });
  }

  const existing = await repo.findUserByEmail(email);
  if (existing !== null) {
    throw new ConflictError('Email already in use');
  }

  const verificationToken = randomBytes(32).toString('base64url');
  const tenantId = randomBytes(12).toString('hex');
  const verificationHash = hashVerificationToken(verificationToken);

  const created = await repo.createUser({
    email,
    tenantId,
    passwordHash: await hashPassword(input.password),
    displayName,
    roles: ['owner'],
    status: 'disabled',
    emailVerifiedAt: null,
    emailVerificationTokenHash: verificationHash,
    emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await sendVerificationEmailForUser(created, verificationToken);

  return {
    user: toPublicUser(created),
    emailVerificationRequired: true,
  };
}

export async function resendVerification(email: string): Promise<{ resent: boolean; alreadyVerified: boolean }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await repo.findUserByEmail(normalizedEmail);
  if (user === null) {
    return { resent: false, alreadyVerified: false };
  }

  if (user.emailVerifiedAt != null) {
    return { resent: false, alreadyVerified: true };
  }

  const verificationToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await repo.updateVerificationToken(user.id, {
    tokenHash: hashVerificationToken(verificationToken),
    expiresAt,
  });
  await sendVerificationEmailForUser(user, verificationToken);
  return { resent: true, alreadyVerified: false };
}

export async function verifyEmail(token: string): Promise<PublicUser> {
  const cleanToken = token.trim();
  if (cleanToken.length === 0) {
    throw new ValidationError('Verification token is required');
  }

  const exactUser = await repo.findUserByVerificationToken(cleanToken);
  if (exactUser === null) {
    throw new NotFoundError('Verification token is invalid or expired');
  }

  if (exactUser.emailVerifiedAt != null) {
    if (exactUser.status !== 'active') throw new ForbiddenError('Account disabled');
    return toPublicUser(exactUser);
  }

  if (exactUser.emailVerificationExpiresAt == null || exactUser.emailVerificationExpiresAt.getTime() < Date.now()) {
    await repo.clearEmailVerificationToken(exactUser.id, hashVerificationToken(cleanToken));
    throw new ValidationError('Verification link has expired');
  }

  const updated = await repo.activateUserAfterVerification(exactUser.id, hashVerificationToken(cleanToken));
  if (updated === null) {
    // Another request may have consumed this token. A replaced/expired token
    // must never activate the account or undo an administrative suspension.
    const current = await repo.findUserByVerificationToken(cleanToken);
    if (current?.emailVerifiedAt != null) {
      if (current.status !== 'active') throw new ForbiddenError('Account disabled');
      return toPublicUser(current);
    }
    throw new NotFoundError('Verification token is invalid or expired');
  }

  await sendWelcomeEmailForUser(updated);
  return toPublicUser(updated);
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
  const auditCtx = {
    requestId: input.requestId,
    entityType: 'user',
    ip: input.ip,
    userAgent: input.userAgent,
  } as const;

  // El bloqueo necesita tenant; si no viene, no podemos evaluar la clave.
  // Se evalúa por clave resuelta tras encontrar el usuario, y de forma
  // preventiva si tenantId viene explícito.
  if (input.tenantId !== undefined) {
    const state = await repo.getLoginAttemptState(input.tenantId, email);
    if (isLocked(state, now)) {
      await recordAudit({
        ...auditCtx,
        tenantId: input.tenantId,
        action: 'auth.login.failed',
        entityId: email,
        reason: 'rate_limited',
      });
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
    // tenantId queda '' (no resoluble): el intento queda en la colección
    // pero fuera del listado por tenant (documentado en docs/database/audit.md).
    await recordAudit({
      ...auditCtx,
      tenantId: input.tenantId ?? '',
      action: 'auth.login.failed',
      entityId: email,
      reason: 'invalid_credentials',
    });
    throw new UnauthenticatedError('Invalid credentials');
  }

  const state = await repo.getLoginAttemptState(user.tenantId, email);
  if (isLocked(state, now)) {
    await recordAudit({
      ...auditCtx,
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login.failed',
      entityId: email,
      reason: 'rate_limited',
    });
    throw new RateLimitedError('Too many login attempts. Try again later.');
  }

  const storedHash = await repo.getUserPasswordHash(user.id);
  const validPassword = storedHash !== null && (await verifyPassword(storedHash, input.password));

  if (!validPassword) {
    const next = recordFailedAttempt(state, now);
    await repo.saveLoginAttemptState(user.tenantId, email, next.state);
    await recordAudit({
      ...auditCtx,
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login.failed',
      entityId: email,
      reason: 'invalid_credentials',
    });
    throw new UnauthenticatedError('Invalid credentials');
  }

  if (user.status !== 'active') {
    await recordAudit({
      ...auditCtx,
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login.failed',
      entityId: email,
      reason: 'account_disabled',
    });
    throw new ForbiddenError('Account disabled');
  }

  // Credenciales verificadas → ahora sí se revela si el tenant está suspendido
  // (antes revelaría estado sin autenticarse).
  if (!(await deps.isTenantActive(user.tenantId))) {
    await recordAudit({
      ...auditCtx,
      tenantId: user.tenantId,
      userId: user.id,
      action: 'auth.login.failed',
      entityId: email,
      reason: 'tenant_suspended',
    });
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

  // Permisos resueltos del catálogo RBAC + roles del tenant (ADR-005).
  const permissions = await resolvePermissions(user.tenantId, user.roles);
  const accessToken = deps.jwt.signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    roles: user.roles,
    permissions,
    permVersion: PERMISSION_CATALOG_VERSION,
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

  await recordAudit({
    requestId: input.requestId,
    tenantId: user.tenantId,
    userId: user.id,
    sessionId,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    newValue: { email: user.email, roles: user.roles },
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { accessToken, refreshToken, expiresIn: deps.accessTokenTtl, user: { ...toPublicUser(user), permissions } };
}

/**
 * Refresh con rotación obligatoria:
 * - Token usado (reutilización) → revoca toda la sesión (posible robo).
 * - Token inválido/expirado/revocado o sesión caída → 401.
 */
export async function refresh(
  deps: AuthDeps,
  refreshToken: string,
  ctx: RefreshContext,
): Promise<AuthTokens> {
  const record = await repo.findRefreshToken(repo.hashRefreshToken(refreshToken));
  const invalid = new UnauthenticatedError('Invalid refresh token');

  if (record === null || record.revokedAt !== null || record.expiresAt.getTime() < Date.now()) {
    throw invalid;
  }

  if (record.usedAt !== null) {
    // Reutilización de refresh token → revocar la sesión completa + traza.
    await repo.revokeSession(record.sessionId);
    await repo.revokeSessionRefreshTokens(record.sessionId);
    await recordAudit({
      requestId: ctx.requestId,
      tenantId: record.tenantId,
      userId: record.userId,
      sessionId: record.sessionId,
      action: 'auth.refresh.reuse',
      entityType: 'session',
      entityId: record.sessionId,
      reason: 'token_reuse',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
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

  const permissions = await resolvePermissions(user.tenantId, user.roles);
  const accessToken = deps.jwt.signAccessToken({
    userId: user.id,
    tenantId: user.tenantId,
    roles: user.roles,
    permissions,
    permVersion: PERMISSION_CATALOG_VERSION,
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

  await recordAudit({
    requestId: ctx.requestId,
    tenantId: user.tenantId,
    userId: user.id,
    sessionId: record.sessionId,
    action: 'auth.refresh',
    entityType: 'session',
    entityId: record.sessionId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return {
    accessToken,
    refreshToken: newRefresh,
    expiresIn: deps.accessTokenTtl,
    user: { ...toPublicUser(user), permissions },
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
