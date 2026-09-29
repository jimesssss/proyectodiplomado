/**
 * Permission system
 */

export const PERMISSION_CATALOG_VERSION = 1;

export const PLATFORM_PERMISSIONS = [
  'tenant:suspend',
  'tenant:reactivate',
  'role:delete',
  'user:delete',
  'audit:read',
  'report:export',
] as const;

export const ALL_PERMISSIONS = [
  'org:read',
  'org:write',
  'tenant:read',
  'tenant:update',
  'tenant:suspend',
  'tenant:reactivate',
  'user:read',
  'user:create',
  'user:update',
  'user:delete',
  'role:read',
  'role:create',
  'role:update',
  'role:delete',
  'audit:read',
  'report:read',
  'report:export',
  'customer:read',
  'customer:create',
  'customer:update',
  'customer:delete',
  'contact:read',
  'contact:create',
  'contact:update',
  'contact:delete',
  'lead:read',
  'lead:create',
  'lead:update',
  'lead:delete',
  'opportunity:read',
  'opportunity:create',
  'opportunity:update',
  'opportunity:delete',
  'activity:read',
  'activity:create',
  'activity:update',
  'activity:delete',
  'employee:read',
  'employee:create',
  'employee:update',
  'employee:delete',
  'attendance:read',
  'attendance:create',
  'attendance:update',
  'hr.salary:read',
  'hr.salary:create',
  'hr.salary:update',
  'product:read',
  'product:create',
  'product:update',
  'product:delete',
  'stock.movement:read',
  'stock.movement:create',
  'stock.movement:update',
  'stock.transfer:read',
  'stock.transfer:create',
  'stock.transfer:update',
  'stock.count:read',
  'stock.count:create',
  'stock.count:update',
  'stock.count:approve',
  'goods.receipt:read',
  'goods.receipt:create',
  'supplier:read',
  'supplier:create',
  'supplier:update',
  'supplier:delete',
  'sales.quote:create',
  'sales.quote:approve',
  'sales.order:read',
  'sales.order:create',
  'sales.invoice:read',
  'sales.invoice:create',
  'sales.invoice:approve',
  'purchase.request:read',
  'purchase.request:create',
  'purchase.request:update',
  'purchase.order:read',
  'purchase.order:create',
  'purchase.order:update',
  'purchase.return:read',
  'purchase.return:create',
  'purchase.return:update',
  'purchases.order:read',
  'purchases.order:create',
  'purchases.order:approve',
  'supplier.invoice:read',
  'supplier.invoice:create',
  'supplier.invoice:approve',
  'bank.account:read',
  'bank.account:create',
  'bank.account:update',
  'payment:read',
  'payment:create',
  'payment:update',
  'receipt:read',
  'receipt:create',
  'receipt:update',
  'reconciliation:read',
  'reconciliation:create',
  'reconciliation:update',
  'accounting.account:read',
  'accounting.account:create',
  'accounting.account:update',
  'accounting.tax:read',
  'accounting.tax:create',
  'accounting.tax:update',
  'accounting.period:read',
  'accounting.period:create',
  'accounting.period:update',
  'accounting.journal:read',
  'accounting.journal:create',
  'accounting.journal:update',
  'accounting.journal:post',
  'approval:read',
  'approval:approve',
  'workflow:read',
  'workflow:create',
  'workflow:update',
  'bom:read',
  'bom:create',
  'bom:update',
  'production.order:read',
  'production.order:create',
  'production.order:update',
  'project:read',
  'project:create',
  'project:update',
  'project:delete',
  'ai:use',
  'ai:admin',
  'ticket:read',
  'ticket:create',
  'ticket:update',
  'ticket:delete',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSIONS: Record<string, readonly Permission[]> = {
  platform: [...PLATFORM_PERMISSIONS],
  identity: ['user:read', 'user:create', 'user:update', 'user:delete', 'role:read', 'role:create', 'role:update', 'role:delete'],
  organization: ['org:read', 'org:write', 'tenant:read', 'tenant:update', 'tenant:suspend', 'tenant:reactivate'],
  sales: ['customer:read', 'customer:create', 'customer:update', 'customer:delete', 'sales.quote:create', 'sales.quote:approve', 'sales.order:create', 'sales.order:read', 'sales.invoice:read', 'sales.invoice:create', 'sales.invoice:approve'],
  inventory: ['product:read', 'product:create', 'product:update', 'product:delete', 'stock.movement:read', 'stock.movement:create', 'stock.movement:update', 'stock.transfer:create', 'stock.count:approve', 'goods.receipt:create'],
  purchasing: ['supplier:read', 'supplier:create', 'supplier:update', 'supplier:delete', 'purchases.order:create', 'purchases.order:read', 'purchases.order:approve', 'supplier.invoice:read', 'supplier.invoice:create', 'supplier.invoice:approve'],
  treasury: ['bank.account:read', 'bank.account:create', 'bank.account:update', 'reconciliation:read', 'reconciliation:create', 'reconciliation:update'],
  accounting: ['accounting.account:read', 'accounting.account:create', 'accounting.account:update', 'accounting.tax:read', 'accounting.tax:create', 'accounting.tax:update', 'accounting.period:read', 'accounting.period:create', 'accounting.period:update', 'accounting.journal:read', 'accounting.journal:create', 'accounting.journal:update', 'accounting.journal:post'],
  reporting: ['report:read', 'report:export'],
  workflow: ['approval:read', 'approval:approve', 'workflow:read', 'workflow:create', 'workflow:update'],
  hr: ['employee:read', 'employee:create', 'employee:update', 'employee:delete', 'attendance:read', 'attendance:create', 'attendance:update', 'hr.salary:read', 'hr.salary:create', 'hr.salary:update'],
  crm: ['customer:read', 'customer:create', 'customer:update', 'customer:delete', 'contact:read', 'contact:create', 'contact:update', 'contact:delete', 'lead:read', 'lead:create', 'lead:update', 'lead:delete', 'opportunity:read', 'opportunity:create', 'opportunity:update', 'opportunity:delete', 'activity:read', 'activity:create', 'activity:update', 'activity:delete'],
  ai: ['ai:use', 'ai:admin'],
  service: ['ticket:read', 'ticket:create', 'ticket:update', 'ticket:delete'],
};

export const BUILTIN_ROLES = ['owner', 'super_admin'] as const;

export const BUILTIN_ROLE_PERMISSIONS: Record<(typeof BUILTIN_ROLES)[number], readonly Permission[]> = {
  owner: ALL_PERMISSIONS.filter(
    (permission) => !PLATFORM_PERMISSIONS.includes(permission as (typeof PLATFORM_PERMISSIONS)[number]),
  ),
  super_admin: [...ALL_PERMISSIONS],
};

export function isPermission(value: string): value is Permission {
  return ALL_PERMISSIONS.includes(value as Permission);
}

export function isBuiltinRole(value: string): value is (typeof BUILTIN_ROLES)[number] {
  return BUILTIN_ROLES.includes(value as (typeof BUILTIN_ROLES)[number]);
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [...ALL_PERMISSIONS],
  user: ['org:read', 'product:read', 'sales.order:read', 'report:read'],
  viewer: ['org:read', 'product:read', 'report:read'],
};

export function getUserPermissions(roles: string[]): Set<string> {
  const permissions = new Set<string>();

  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    rolePerms.forEach((perm) => permissions.add(perm));
  }

  return permissions;
}

export function hasPermission(userPermissions: Set<string>, requiredPermission: string): boolean {
  return userPermissions.has(requiredPermission);
}

export const ALL_PERMISSIONS_LIST = [...ALL_PERMISSIONS];

export function permissionCatalog(): { readonly version: number; readonly permissions: readonly Permission[] } {
  return { version: PERMISSION_CATALOG_VERSION, permissions: ALL_PERMISSIONS };
}
