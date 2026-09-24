/**
 * Permission system
 */

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'organization.read',
    'organization.create',
    'organization.update',
    'organization.delete',
    'user.read',
    'user.create',
    'user.update',
    'user.delete',
    'inventory.product.read',
    'inventory.product.create',
    'inventory.product.update',
    'inventory.product.delete',
    'sales.order.read',
    'sales.order.create',
    'sales.order.approve',
    'purchases.order.read',
    'purchases.order.create',
    'purchases.order.approve',
  ],
  user: ['organization.read', 'inventory.product.read', 'sales.order.read'],
  viewer: ['organization.read', 'inventory.product.read'],
};

export function getUserPermissions(roles: string[]): Set<string> {
  const permissions = new Set<string>();

  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role] || [];
    rolePerms.forEach((perm) => permissions.add(perm));
  }

  return permissions;
}

export function hasPermission(
  userPermissions: Set<string>,
  requiredPermission: string
): boolean {
  return userPermissions.has(requiredPermission);
}
