# Matriz de permisos (ADR-005)

Estado: Aceptado (FASE 6). Fuente de verdad: catálogo versionado en `packages/permissions` (`@erp/permissions`) — backend y frontend importan EL MISMO código.

## Cómo funciona

- Clave canónica `recurso[:subrecurso]:acción` (p. ej. `customer:read`, `sales.order:create`, `accounting.journal:post`).
- **Denegación por defecto**: sin permiso explícito → `403 FORBIDDEN`.
- El JWT lleva `permissions[]` resueltos al hacer login/refresh + el claim `pv` (versión del catálogo). `requirePermission('x:y')` rechaza con `403` si `pv` no coincide con la versión vigente → el cliente debe re-autenticarse.
- Roles **tenant-scoped** (colección `roles`, con `permissions[]`). Roles **embutidos** (no son documentos): `owner` y `super_admin`.

## Roles embutidos

| Rol           | Permisos                                                   |
| ------------- | ---------------------------------------------------------- |
| `owner`       | TODOS los del catálogo **menos** los de plataforma (abajo) |
| `super_admin` | TODOS los del catálogo (incluye plataforma)                |

Permisos de plataforma (solo `super_admin`): `tenant:read`, `tenant:suspend`, `tenant:reactivate`.

> `owner` = administrador de SU empresa (users, roles, org, negocio). `super_admin` = operador de la plataforma ERP (puede listar/suspender cualquier tenant).

## Matrices obligatorias (ejemplos ADR-005)

### VENDEDOR

| Permiso                  | Otorgado |
| ------------------------ | :------: |
| `customer:read`          |    ✅    |
| `customer:create`        |    ✅    |
| `customer:update`        |    ✅    |
| `contact:read`           |    ✅    |
| `contact:create`         |    ✅    |
| `lead:read`              |    ✅    |
| `lead:create`            |    ✅    |
| `sales.quote:read`       |    ✅    |
| `sales.quote:create`     |    ✅    |
| `sales.order:read`       |    ✅    |
| `sales.order:create`     |    ✅    |
| `report:read`            |    ✅    |
| `accounting.*`           |    ❌    |
| `hr.salary:read`         |    ❌    |
| `settings:update`        |    ❌    |
| `user:create` / `role:*` |    ❌    |
| `tenant:suspend`         |    ❌    |

Creación de ejemplo:

```json
POST /api/v1/roles
{
  "key": "vendedor",
  "name": "Vendedor",
  "permissions": [
    "customer:read", "customer:create", "customer:update",
    "contact:read", "contact:create",
    "lead:read", "lead:create",
    "sales.quote:read", "sales.quote:create",
    "sales.order:read", "sales.order:create",
    "report:read"
  ]
}
```

### ALMACÉN

| Permiso                   | Otorgado |
| ------------------------- | :------: |
| `product:read`            |    ✅    |
| `stock.movement:read`     |    ✅    |
| `stock.movement:create`   |    ✅    |
| `stock.transfer:read`     |    ✅    |
| `stock.transfer:create`   |    ✅    |
| `stock.count:read`        |    ✅    |
| `stock.count:create`      |    ✅    |
| `goods.receipt:read`      |    ✅    |
| `goods.receipt:create`    |    ✅    |
| `report:read`             |    ✅    |
| `sales.order:*`           |    ❌    |
| `payment:create`          |    ❌    |
| `accounting.journal:post` |    ❌    |
| `customer:delete`         |    ❌    |
| `org:write`               |    ❌    |

Creación de ejemplo:

```json
POST /api/v1/roles
{
  "key": "almacen",
  "name": "Almacén",
  "permissions": [
    "product:read",
    "stock.movement:read", "stock.movement:create",
    "stock.transfer:read", "stock.transfer:create",
    "stock.count:read", "stock.count:create",
    "goods.receipt:read", "goods.receipt:create",
    "report:read"
  ]
}
```

## Rutas protegidas hasta la fecha

| Ruta                                              | Permiso                                                |
| ------------------------------------------------- | ------------------------------------------------------ |
| `GET/PATCH /tenants/current`                      | — / `tenant:update`                                    |
| `GET /tenants`, `/:id/suspend`, `/:id/reactivate` | `tenant:read` / `tenant:suspend` / `tenant:reactivate` |
| `/organizations`…`/cost-centers` (lectura)        | `org:read`                                             |
| `/organizations`…`/cost-centers` (escritura)      | `org:write`                                            |
| `GET /users`, `GET /users/:id`                    | `user:read`                                            |
| `POST /users`                                     | `user:create`                                          |
| `PATCH /users/:id`                                | `user:update`                                          |
| `GET /roles`, `GET /roles/:id`                    | `role:read`                                            |
| `POST /roles`                                     | `role:create`                                          |
| `PATCH /roles/:id`                                | `role:update`                                          |
| `DELETE /roles/:id`                               | `role:delete`                                          |
| `GET /permissions`                                | — (solo autenticado)                                   |
| `/auth/*`                                         | — (autenticación propia)                               |

## ABAC (ruta, no implementado — PARTIAL)

Interfaz prevista `Policy.evaluate(subject, action, resource, context)` con `AllowByPermissionPolicy` por defecto; reglas por ownership/monto/sucursal se añaden como políticas sin tocar controllers (ADR-005). **NOT IMPLEMENTED** en FASE 6.

## Cambios del catálogo

Cualquier alta/baja/renombre de permiso DEBE incrementar `PERMISSION_CATALOG_VERSION` en `packages/permissions/src/index.ts`: los tokens con `pv` anterior quedan invalidados para rutas con `requirePermission` (re-login). Existe test unitario que exige `version ≥ 1` y forma canónica de cada clave.
