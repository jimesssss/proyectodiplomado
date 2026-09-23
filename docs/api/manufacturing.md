# API — MANUFACTURING (`/api/v1/manufacturing`) — FASE 16

Estado: implementado. Módulo `apps/api/src/modules/manufacturing`; colecciones e índices en `docs/database/manufacturing.md`. Catálogo de permisos **v2** (`bom:*`, `production.order:*` — ver `docs/security/permission-matrix.md`).

## Recursos y endpoints

**2 montajes** (convenciones §4, fila 16) — **8 endpoints** (GET/POST/GET:id/PATCH:id por recurso). **SIN DELETE en ninguno**: el catálogo no define `bom:delete` ni `production.order:delete` → la ruta DELETE no se publica (peticiones → `404`); archivar es `PATCH {archived}` y las órdenes además se CANCELAN (`PATCH {status:'cancelled'}`) — trazabilidad de producción.

| Recurso / acción               | Ruta                              | Permiso                   |
| ------------------------------ | --------------------------------- | ------------------------- |
| listar BOMs                    | `GET /manufacturing/boms`         | `bom:read`                |
| crear BOM                      | `POST /manufacturing/boms`        | `bom:create`              |
| detalle de BOM                 | `GET /manufacturing/boms/:id`     | `bom:read`                |
| editar/archivar BOM            | `PATCH /manufacturing/boms/:id`   | `bom:update`              |
| listar órdenes (cola)          | `GET /manufacturing/orders`       | `production.order:read`   |
| crear orden                    | `POST /manufacturing/orders`      | `production.order:create` |
| detalle de orden               | `GET /manufacturing/orders/:id`   | `production.order:read`   |
| editar / transición / archivar | `PATCH /manufacturing/orders/:id` | `production.order:update` |

- **`bom` ≠ `production.order`**: permisos separados en catálogo y en tests (leer BOMs no habilita las órdenes, y viceversa); **leer ≠ actualizar** (`:read` no hace `PATCH`).
- El **owner** (y `super_admin`) reciben los 6 permisos por derivación del catálogo; `pv` vigente **2**.

## BOM (lista de materiales)

- **`code` es la clave natural**: normalizado en el servidor (trim + mayúsculas + espacios → `-`, p. ej. `caja kit` → `CAJA-KIT`), validado `2-32` chars (`[A-Z0-9._-]`), **único POR tenant** (duplicado → `409 CONFLICT` `Code already exists`) e **inmutable**: `code` no existe en el esquema del PATCH → intentarlo → `400` (esquema estricto).
- **`lines` = componentes POR UNIDAD** de producto terminado: `[{productId, quantity}]`, 1–200 líneas (`LINES_MAX`), `quantity > 0` hasta `QUANTITY_MAX`. El producto terminado (`productId`) **nunca puede estar entre sus propios componentes** y no puede repetirse en dos líneas → ambos → `400` con `details.issues[].message` (`Output product cannot be a component` / `Duplicate component product`).
- **FKs de producto** (vía API pública de Inventory): inexistente/ajeno → `404` uniforme (tanto la salida como cada componente); archivado → `409` `Product is archived`.
- **PATCH editable**: `name`, `productId`, `lines`, `archived`. Al cambiar `productId` y/o `lines` las reglas se revalidan contra el par **efectivo** (nuevo producto × líneas efectivas). Archivar/restaurar con doble archive → `409` (`BOM is already archived` / `BOM is not archived`). PATCH vacío → `400` `No valid fields to update`.
- Una BOM **archivada sigue siendo legible** pero no admite nuevas órdenes (`409` `BOM is archived`).

## Orden de producción

- **`number` lo asigna el servidor**: secuencial `MO-YYYY-000001` por tenant+año (`core/numbering`, `$inc` atómico) al FINAL del create — los intentos fallidos (FK/líneas) NO consumen números. `number` en el body → `400` (esquema estricto).
- **Alta con XOR de plan**: `bomId` O `lines` explícitas — ambos → `400` `Provide either bomId or lines, not both`; ninguno → `400` `Either bomId or lines is required`. Con `bomId` se copia un **snapshot POR UNIDAD** de la BOM (las líneas NO se escalan por `quantity`; la escala `× unidades` ocurre al completar). La BOM debe ser del mismo tenant (`404`), no archivada (`409`) y su salida coincidir con el `productId` de la orden (`409` `BOM does not match the output product`, con `details {bomProductId, productId}`).
- **Campos**: `productId` (salida), `quantity` (entero ≥ 1), `warehouseId` (almacén del consumo y de la entrada), `notes?` (≤ 500). FKs → `404`/`409` como en BOM (`Warehouse is archived` si el almacén está archivado).
- **Máquina de estados** (transiciones SOLO vía `PATCH {status}` con `production.order:update`, patrón de recepciones/transferencias — sin endpoint `POST /:id/start`):

  | Desde         | Hacia                      |
  | ------------- | -------------------------- |
  | `draft`       | `in_progress`, `cancelled` |
  | `in_progress` | `completed`, `cancelled`   |
  | `completed`   | — (terminal)               |
  | `cancelled`   | — (terminal)               |
  - mismo estado → `409` `Status is already the requested one`; salto inválido (p. ej. `draft → completed`) → `409` `Invalid status transition`; estado fuera del enum → `400`.
  - **Solo los `draft` editan campos de negocio** (`productId`, `quantity`, `warehouseId`, `notes`): fuera de draft → `409` `Only draft documents can be edited` (patrón Sales/Purchasing). `lines`/`bomId`/`number` son inmutables tras el create (no están en el PATCH → `400`).

- **Completar mueve stock** (patrón transferencia FASE 11), en este orden:
  1. **PRE-CHEQUEO** de saldo de TODOS los componentes (`líneas × quantity`, redondeo a 6 decimales) vía `listBalances` de Inventory: si no alcanza → **`422 DOMAIN_ERROR` `Insufficient stock` con `details {productId, warehouseId, available, required}` y NO se escribe nada** (ni estado ni movimientos).
  2. Flip del estado a `completed`.
  3. Movimientos con `sourceType: 'production.order'`, `sourceId` y `reason: "Production order <number>"`: `production_out` (−) por componente y `production_in` (+) del producto terminado.
  - El estado **terminal es la guarda de at-most-once** (sin transacciones Mongo): repetir `PATCH {status:'completed'}` → `409` y el ledger no duplica movimientos. Cancelar (`draft`/`in_progress → cancelled`) NO mueve stock.
- **Archivar**: `PATCH {archived}` con doble archive → `409` (`Production order is already archived` / `... is not archived`).

## Query (strictObject)

Parámetro desconocido → `400 VALIDATION_ERROR` (`Invalid request query`); incluye `?tenantId=` (el tenant viene SOLO del JWT).

| Recurso  | Params                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| `boms`   | `page?` (≥1, def 1), `limit?` (1–100, def 20), `archived?` (`true\|false`)    |
| `orders` | ídem + `status?` (`draft\|in_progress\|completed\|cancelled`) → cola filtrada |

Listados ordenados desc por `createdAt` (desempate `_id`) con `meta {page, limit, total}`.

## Auditoría

`bom.create` / `bom.update` / `bom.archive` y `production.order.create` / `production.order.update` / `production.order.archive` (acción = `<entity>.<acción>`, `entity` canónico `bom` y `production.order`); las transiciones de estado quedan en `metadata.reason` = `status:<valor>` (p. ej. `status:completed`).

Envelope, códigos de error y paginación: `docs/api/conventions.md`. Extensión de Inventory usada por este módulo: tipos de sistema `production_in`/`production_out` y `sourceType: 'production.order'` (el cliente NO puede crearlos: `POST /inventory/movements` sigue restringido a `manual_in|manual_out`).
