/**
 * Permission checking utilities
 */
import { IRequestContext } from '@erp/types';
import { AuthorizationError } from '../errors/AppError';

export const PERMISSIONS = {
  // Organization
  'organization.read': 'organization.read',
  'organization.create': 'organization.create',
  'organization.update': 'organization.update',
  'organization.delete': 'organization.delete',

  // User
  'user.read': 'user.read',
  'user.create': 'user.create',
  'user.update': 'user.update',
  'user.delete': 'user.delete',

  // Products
  'inventory.product.read': 'inventory.product.read',
  'inventory.product.create': 'inventory.product.create',
  'inventory.product.update': 'inventory.product.update',
  'inventory.product.delete': 'inventory.product.delete',

  // Sales
  'sales.order.read': 'sales.order.read',
  'sales.order.create': 'sales.order.create',
  'sales.order.approve': 'sales.order.approve',

  // Purchases
  'purchases.order.read': 'purchases.order.read',
  'purchases.order.create': 'purchases.order.create',
  'purchases.order.approve': 'purchases.order.approve',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Check if context has required permission
 */
export function hasPermission(context: IRequestContext, _permission: Permission): boolean {
  // Admin role bypass
  if (context.roles.includes('admin')) {
    return true;
  }

  // TODO: Map permissions to roles from database
  return false;
}

/**
 * Ensure user has required permission
 */
export function requirePermission(context: IRequestContext | undefined, permission: Permission): void {
  if (!context) {
    throw new AuthorizationError('No context provided');
  }

  if (!hasPermission(context, permission)) {
    throw new AuthorizationError(`Permission denied: ${permission}`);
  }
}
