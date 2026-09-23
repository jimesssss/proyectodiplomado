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

| Ruta                                                       | Permiso                                                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET/PATCH /tenants/current`                               | — / `tenant:update`                                                                                                                          |
| `GET /tenants`, `/:id/suspend`, `/:id/reactivate`          | `tenant:read` / `tenant:suspend` / `tenant:reactivate`                                                                                       |
| `/organizations`…`/cost-centers` (lectura)                 | `org:read`                                                                                                                                   |
| `/organizations`…`/cost-centers` (escritura)               | `org:write`                                                                                                                                  |
| `GET /users`, `GET /users/:id`                             | `user:read`                                                                                                                                  |
| `POST /users`                                              | `user:create`                                                                                                                                |
| `PATCH /users/:id`                                         | `user:update`                                                                                                                                |
| `GET /roles`, `GET /roles/:id`                             | `role:read`                                                                                                                                  |
| `POST /roles`                                              | `role:create`                                                                                                                                |
| `PATCH /roles/:id`                                         | `role:update`                                                                                                                                |
| `DELETE /roles/:id`                                        | `role:delete`                                                                                                                                |
| `GET /permissions`                                         | — (solo autenticado)                                                                                                                         |
| `GET /audit`                                               | `audit:read`                                                                                                                                 |
| `/customers` (GET/PATCH/POST/DELETE)                       | `customer:read` / `:update` / `:create` / `:delete`                                                                                          |
| `/contacts` (GET/PATCH/POST/DELETE)                        | `contact:read` / `:update` / `:create` / `:delete`                                                                                           |
| `/leads` (GET/PATCH/POST/DELETE)                           | `lead:read` / `:update` / `:create` / `:delete`                                                                                              |
| `/opportunities` (GET/PATCH/POST/DELETE)                   | `opportunity:read` / `:update` / `:create` / `:delete`                                                                                       |
| `/activities` (GET/PATCH/POST/DELETE)                      | `activity:read` / `:update` / `:create` / `:delete`                                                                                          |
| `/sales/quotes` (GET/PATCH/POST/DELETE)                    | `sales.quote:read` / `:update` / `:create` / `:delete`                                                                                       |
| `POST /sales/quotes/:id/approve`                           | `sales.quote:approve` (separado de `:update`)                                                                                                |
| `/sales/orders` (GET/PATCH/POST/DELETE)                    | `sales.order:read` / `:update` / `:create` / `:delete`                                                                                       |
| `/sales/deliveries` (GET/PATCH/POST/DELETE)                | `sales.delivery:read` / `:update` / `:create` / `:delete`                                                                                    |
| `/sales/invoices` (GET/PATCH/POST/DELETE)                  | `sales.invoice:read` / `:update` / `:create` / `:delete`                                                                                     |
| `/sales/returns` (GET/PATCH/POST/DELETE)                   | `sales.return:read` / `:update` / `:create` / `:delete`                                                                                      |
| `/suppliers` (GET/PATCH/POST/DELETE)                       | `supplier:read` / `:update` / `:create` / `:delete`                                                                                          |
| `/purchasing/requests` (GET/PATCH/POST/DELETE)             | `purchase.request:read` / `:update` / `:create` / `:delete`                                                                                  |
| `/purchasing/orders` (GET/PATCH/POST/DELETE)               | `purchase.order:read` / `:update` / `:create` / `:delete`                                                                                    |
| `/purchasing/receipts` (GET/PATCH/POST; sin DELETE)        | `goods.receipt:read` / `:update` / `:create` (sin `:delete` en el catálogo → ruta DELETE no publicada; archivar vía `PATCH {archived}`)      |
| `/purchasing/invoices` (GET/PATCH/POST/DELETE)             | `supplier.invoice:read` / `:update` / `:create` / `:delete`                                                                                  |
| `/purchasing/returns` (GET/PATCH/POST/DELETE)              | `purchase.return:read` / `:update` / `:create` / `:delete`                                                                                   |
| `/inventory/products` (GET/PATCH/POST/DELETE)              | `product:read` / `:update` / `:create` / `:delete`                                                                                           |
| `GET /inventory/stock`                                     | `stock.movement:read` (solo lectura del saldo proyectado: no existe escritura directa de saldos)                                             |
| `/inventory/movements` (GET/POST; sin PATCH/DELETE)        | `stock.movement:read` / `:create` (ledger append-only: el catálogo no define `:update`/`:delete` → rutas no publicadas)                      |
| `/inventory/transfers` (GET/PATCH/POST; sin DELETE)        | `stock.transfer:read` / `:update` / `:create` (sin `:delete` en el catálogo → archivar vía `PATCH {archived}`)                               |
| `/inventory/counts` (GET/PATCH/POST; sin DELETE)           | `stock.count:read` / `:update` / `:create` (sin `:delete` en el catálogo → archivar vía `PATCH {archived}`)                                  |
| `POST /inventory/counts/:id/approve`                       | `stock.count:approve` (separado de `:update`, como `sales.quote:approve`)                                                                    |
| `/accounting/accounts` (GET/PATCH/POST; sin DELETE)        | `accounting.account:read` / `:update` / `:create` (sin `:delete` en el catálogo → ruta DELETE no publicada; archivar vía `PATCH {archived}`) |
| `/accounting/journal-entries` (GET/PATCH/POST; sin DELETE) | `accounting.journal:read` / `:update` / `:create` (sin `:delete`: los asientos se descartan cancelándose, no archivándose)                   |
| `POST /accounting/journal-entries/:id/post`                | `accounting.journal:post` (separado de `:update`, como `sales.quote:approve`)                                                                |
| `/accounting/periods` (GET/PATCH/POST; sin DELETE)         | `accounting.period:read` / `:update` / `:create` (sin `:delete`: los períodos se cierran, no se archivan)                                    |
| `/accounting/taxes` (GET/PATCH/POST; sin DELETE)           | `accounting.tax:read` / `:update` / `:create` (sin `:delete` en el catálogo → archivar vía `PATCH {archived}`)                               |
| `/treasury/accounts` (GET/PATCH/POST; sin DELETE)          | `bank.account:read` / `:update` / `:create` (sin `:delete` en el catálogo → archivar vía `PATCH {archived}`)                                 |
| `GET /treasury/accounts/:id/movements`                     | `bank.account:read` (extracto append-only: sin PATCH/DELETE → rutas ausentes → 404)                                                          |
| `/treasury/payments` (GET/PATCH/POST; sin DELETE)          | `payment:read` / `:update` / `:create` (sin `:delete`; la publicación `PATCH {status:'posted'}` va con `:update` — no existe `payment:post`) |
| `/treasury/receipts` (GET/PATCH/POST; sin DELETE)          | `receipt:read` / `:update` / `:create` (mismo patrón que pagos: publicar = `PATCH {status:'posted'}` con `:update`)                          |
| `/treasury/bank-transactions` (GET/PATCH/POST; sin DELETE) | `bank.account:read` / `:update` / `:create` (vía `bank.account:*`: el catálogo no define `bank.transaction:*`)                               |
| `/treasury/reconciliations` (GET/PATCH/POST; sin DELETE)   | `reconciliation:read` / `:update` / `:create` (sin `:delete`; las líneas se corrigen reemplazándolas en `PATCH`)                             |
| `/workflows` (GET/PATCH/POST; sin DELETE)                  | `workflow:read` / `:update` / `:create` (sin `:delete` en el catálogo → archivar vía `PATCH {archived}`)                                     |
| `POST /workflows/:id/run`                                  | `workflow:update` (ejecutar la evaluación; NO crea definiciones — separado de `:create`)                                                     |
| `GET /workflows/:id/instances`                             | `workflow:read` (lista paginada; sin detalle individual → ruta `GET /workflows/instances/:id` ausente → 404)                                 |
| `GET /workflows/approvals[/:id]`                           | `approval:read` (cola de solicitudes; separada de `workflow:*`: el configurador con `workflow:update` NO la lee)                             |
| `POST /workflows/approvals/:id/decision`                   | `approval:approve` (leer ≠ decidir: `approval:read` NO decide; sin creación/PATCH/DELETE de solicitudes → rutas ausentes → 404)              |
| `GET /reports`                                             | `report:read` (catálogo estático SIN datos: las 5 claves y sus `params`)                                                                     |
| `GET /reports/sales`                                       | `report:read` + `sales.invoice:read` + `customer:read` (encadenados ADR-008 §1: la API filtraría igual con los subyacentes)                  |
| `GET /reports/purchases`                                   | `report:read` + `supplier.invoice:read` + `supplier:read`                                                                                    |
| `GET /reports/cashflow`                                    | `report:read` + `bank.account:read`                                                                                                          |
| `GET /reports/inventory` + `/inventory/low-stock`          | `report:read` + `product:read` + `stock.movement:read`                                                                                       |
| `GET /reports/crm`                                         | `report:read` + `lead:read` + `opportunity:read`                                                                                             |
| `GET /reports/{inventory,sales,purchases}/export`          | `report:export` + LOS MISMOS subyacentes del reporte (consultar ≠ exportar: `report:read` NO exporta y `report:export` NO lee)               |
| `GET /reports/:key/export` (`cashflow\|crm`)               | `report:export` + subyacentes de `key` (`bank.account:read` / `lead:read`+`opportunity:read`); clave desconocida → 400 (enum de params)      |
| `/manufacturing/boms` (GET/PATCH/POST; sin DELETE)         | `bom:read` / `:update` / `:create` (sin `:delete` en el catálogo → ruta DELETE no publicada; archivar vía `PATCH {archived}`)                |
| `/manufacturing/orders` (GET/PATCH/POST; sin DELETE)       | `production.order:read` / `:update` / `:create` (sin `:delete`: se CANCELAN, no se borran — trazabilidad; archivar vía `PATCH {archived}`)   |
| `PATCH /manufacturing/orders/:id` (`{status}`)             | `production.order:update` (las transiciones `draft→in_progress→completed/cancelled` van por el PATCH, sin endpoint `POST /:id/start`)        |
| `GET /search`                                              | por TIPO: `<recurso>:read` (sin él → el tipo no aparece)                                                                                     |
| `/auth/*`                                                  | — (autenticación propia)                                                                                                                     |

## ABAC (ruta, no implementado — PARTIAL)

Interfaz prevista `Policy.evaluate(subject, action, resource, context)` con `AllowByPermissionPolicy` por defecto; reglas por ownership/monto/sucursal se añaden como políticas sin tocar controllers (ADR-005). **NOT IMPLEMENTED** en FASE 6.

## Cambios del catálogo

Cualquier alta/baja/renombre de permiso DEBE incrementar `PERMISSION_CATALOG_VERSION` en `packages/permissions/src/index.ts`: los tokens con `pv` anterior quedan invalidados para rutas con `requirePermission` (re-login). Existe test unitario que exige `version ≥ 1` y forma canónica de cada clave.

| Versión | Fase | Cambio                                                                                                                                                        |
| ------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | 6    | catálogo inicial (identity, org, CRM, sales, purchasing, inventory, accounting, treasury, workflow, …)                                                        |
| 2       | 16   | alta de `bom:read/create/update` y `production.order:read/create/update` (SIN `:delete` en ambos grupos) → todos los tokens existentes requieren **re-login** |
