/**
 * Catálogo canónico de permisos (ADR-005) — compartido backend/frontend.
 *
 * - Clave canónica `recurso[:subrecurso]:acción` (ej. `customer:read`,
 *   `sales.order:create`, `accounting.journal:post`).
 * - DENEGACIÓN POR DEFECTO: sin permiso explícito → 403.
 * - Cualquier cambio en el catálogo DEBE incrementar
 *   `PERMISSION_CATALOG_VERSION` (va en el JWT como `pv`): los tokens con una
 *   versión antigua dejan de servir para rutas con `requirePermission`.
 */

export const PERMISSIONS = {
  // --- Plataforma y acceso ---
  tenant: ['tenant:read', 'tenant:update', 'tenant:suspend', 'tenant:reactivate'],
  org: ['org:read', 'org:write'],
  user: ['user:read', 'user:create', 'user:update', 'user:delete'],
  role: ['role:read', 'role:create', 'role:update', 'role:delete'],
  audit: ['audit:read'],
  settings: ['settings:read', 'settings:update'],
  file: ['file:read', 'file:create', 'file:delete'],
  notification: ['notification:read', 'notification:manage'],
  // --- CRM (FASE 8) ---
  customer: ['customer:read', 'customer:create', 'customer:update', 'customer:delete'],
  contact: ['contact:read', 'contact:create', 'contact:update', 'contact:delete'],
  lead: ['lead:read', 'lead:create', 'lead:update', 'lead:delete'],
  opportunity: [
    'opportunity:read',
    'opportunity:create',
    'opportunity:update',
    'opportunity:delete',
  ],
  activity: ['activity:read', 'activity:create', 'activity:update', 'activity:delete'],
  // --- Ventas (FASE 9) ---
  'sales.quote': [
    'sales.quote:read',
    'sales.quote:create',
    'sales.quote:update',
    'sales.quote:delete',
    'sales.quote:approve',
  ],
  'sales.order': [
    'sales.order:read',
    'sales.order:create',
    'sales.order:update',
    'sales.order:delete',
  ],
  'sales.delivery': [
    'sales.delivery:read',
    'sales.delivery:create',
    'sales.delivery:update',
    'sales.delivery:delete',
  ],
  'sales.invoice': [
    'sales.invoice:read',
    'sales.invoice:create',
    'sales.invoice:update',
    'sales.invoice:delete',
  ],
  'sales.return': [
    'sales.return:read',
    'sales.return:create',
    'sales.return:update',
    'sales.return:delete',
  ],
  // --- Compras (FASE 10) ---
  supplier: ['supplier:read', 'supplier:create', 'supplier:update', 'supplier:delete'],
  'purchase.request': [
    'purchase.request:read',
    'purchase.request:create',
    'purchase.request:update',
    'purchase.request:delete',
  ],
  'purchase.order': [
    'purchase.order:read',
    'purchase.order:create',
    'purchase.order:update',
    'purchase.order:delete',
  ],
  'goods.receipt': ['goods.receipt:read', 'goods.receipt:create', 'goods.receipt:update'],
  'supplier.invoice': [
    'supplier.invoice:read',
    'supplier.invoice:create',
    'supplier.invoice:update',
    'supplier.invoice:delete',
  ],
  'purchase.return': [
    'purchase.return:read',
    'purchase.return:create',
    'purchase.return:update',
    'purchase.return:delete',
  ],
  // --- Inventario (FASE 11) ---
  product: ['product:read', 'product:create', 'product:update', 'product:delete'],
  'stock.movement': ['stock.movement:read', 'stock.movement:create'],
  'stock.transfer': ['stock.transfer:read', 'stock.transfer:create', 'stock.transfer:update'],
  'stock.count': [
    'stock.count:read',
    'stock.count:create',
    'stock.count:update',
    'stock.count:approve',
  ],
  // --- Contabilidad (FASE 12) ---
  'accounting.account': [
    'accounting.account:read',
    'accounting.account:create',
    'accounting.account:update',
  ],
  'accounting.journal': [
    'accounting.journal:read',
    'accounting.journal:create',
    'accounting.journal:update',
    'accounting.journal:post',
  ],
  'accounting.period': [
    'accounting.period:read',
    'accounting.period:create',
    'accounting.period:update',
  ],
  'accounting.tax': ['accounting.tax:read', 'accounting.tax:create', 'accounting.tax:update'],
  'accounting.budget': [
    'accounting.budget:read',
    'accounting.budget:create',
    'accounting.budget:update',
  ],
  // --- Tesorería (FASE 13) ---
  'bank.account': ['bank.account:read', 'bank.account:create', 'bank.account:update'],
  payment: ['payment:read', 'payment:create', 'payment:update'],
  receipt: ['receipt:read', 'receipt:create', 'receipt:update'],
  reconciliation: ['reconciliation:read', 'reconciliation:create', 'reconciliation:update'],
  // --- Workflow (FASE 14) ---
  workflow: ['workflow:read', 'workflow:create', 'workflow:update'],
  approval: ['approval:read', 'approval:approve'],
  // --- Reportes (FASE 15) ---
  report: ['report:read', 'report:export'],
  // --- Restantes módulos (FASE 17-20) ---
  project: ['project:read', 'project:create', 'project:update', 'project:delete'],
  ticket: ['ticket:read', 'ticket:create', 'ticket:update', 'ticket:delete'],
  employee: ['employee:read', 'employee:create', 'employee:update', 'employee:delete'],
  attendance: ['attendance:read', 'attendance:create', 'attendance:update'],
  'hr.salary': ['hr.salary:read', 'hr.salary:create', 'hr.salary:update'],
  ai: ['ai:use'],
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS][number];

/**
 * Versión del catálogo. Obligatoria en el JWT (`pv`): al cambiar permisos,
 * los tokens antiguos dejan de superar `requirePermission` (re-login/refresh).
 */
export const PERMISSION_CATALOG_VERSION = 1;

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS).flat();

const PERMISSION_SET: ReadonlySet<string> = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Roles embutidos: bootstrap del tenant (no viven en la colección `roles`). */
export const BUILTIN_ROLES = ['owner', 'super_admin'] as const;

export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

export function isBuiltinRole(value: string): value is BuiltinRole {
  return (BUILTIN_ROLES as readonly string[]).includes(value);
}

/**
 * Permisos SOLO de plataforma (gestión del ERP en sí): cualquier owner de un
 * tenant NO los recibe. `super_admin` sí (rol de plataforma, no tenant-scoped).
 */
export const PLATFORM_PERMISSIONS: readonly Permission[] = [
  'tenant:read',
  'tenant:suspend',
  'tenant:reactivate',
];

const OWNER_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !PLATFORM_PERMISSIONS.includes(permission),
);

export const BUILTIN_ROLE_PERMISSIONS: Record<BuiltinRole, readonly Permission[]> = {
  owner: OWNER_PERMISSIONS,
  super_admin: ALL_PERMISSIONS,
};
