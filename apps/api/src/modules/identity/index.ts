/**
 * Superficie pública del módulo Identity.
 * Otros módulos solo pueden importar desde aquí.
 */
export { createAuthRouter, type AuthRouterDeps } from './presentation/routes/auth-routes.js';
export { createUserRouter, type UserRouterDeps } from './presentation/routes/user-routes.js';
export { createRoleRouter, type RoleRouterDeps } from './presentation/routes/role-routes.js';
export {
  createPermissionRouter,
  type PermissionRouterDeps,
} from './presentation/routes/permission-routes.js';
export {
  createAppUser,
  deleteRole,
  createRole,
  getAppUser,
  getRole,
  listAppUsers,
  listRoles,
  permissionCatalog,
  resolvePermissions,
  updateAppUser,
  updateRole,
} from './application/rbac-service.js';
export {
  changePassword,
  createSessionChecker,
  forgotPassword,
  getProfile,
  login,
  logout,
  refresh,
  register,
  resetPassword,
  resendVerification,
  revokeTenantSessions,
  type AuthDeps,
  type AuthTokens,
  verifyEmail,
} from './application/auth-service.js';
export { hashPassword, verifyPassword } from '../../core/auth/password.js';
export { validatePasswordPolicy } from './domain/rules/auth-rules.js';
export {
  createUser,
  findUserById,
  findUserInTenant,
} from './infrastructure/repositories/identity-repository.js';
export { toPublicUser, type PublicUser, type User } from './domain/entities/user.js';
