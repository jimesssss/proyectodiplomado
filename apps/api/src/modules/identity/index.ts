/**
 * Superficie pública del módulo Identity.
 * Otros módulos solo pueden importar desde aquí.
 */
export { createAuthRouter, type AuthRouterDeps } from './presentation/routes/auth-routes.js';
export {
  changePassword,
  createSessionChecker,
  getProfile,
  login,
  logout,
  refresh,
  revokeTenantSessions,
  type AuthDeps,
  type AuthTokens,
} from './application/auth-service.js';
export { hashPassword, verifyPassword } from '../../core/auth/password.js';
export { validatePasswordPolicy } from './domain/rules/auth-rules.js';
export { createUser, findUserById } from './infrastructure/repositories/identity-repository.js';
export { toPublicUser, type PublicUser, type User } from './domain/entities/user.js';
