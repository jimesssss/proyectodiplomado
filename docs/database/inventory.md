# Base de datos — INVENTORY (FASE 11)

Cinco colecciones del módulo `inventory` (las rutas de `docs/architecture/database.md` para inventario). Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `_id ObjectId`.

**Decisión de diseño**: el saldo es una **proyección** (`stock`) del **ledger append-only** (`stockMovements`) — la única fuente de verdad del movimiento. `stockMovements` usa `createdAt` **sin** `updatedAt` (nada se reescribe). `products` es el maestro (`code` único por tenant). Transferencias y conteos son documentos con `archived` = soft-delete (sin permiso `:delete` en el catálogo → sin ruta DELETE; archivar via `PATCH {archived}`).

## Colección `products`

| Campo          | Tipo / notas                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                          |
| `code`         | string, **única por tenant**, normalizada (mayúsculas, espacios → `-`), inmutable                 |
| `name`         | string (1–200)                                                                                    |
| `description?` | string, limpiable con `null`                                                                      |
| `unit`         | string, default `unit` (unidad de medida física libre)                                            |
| `cost?/price?` | number, dinero con redondeo comercial a 2 decimales (escritos solo por el servicio)               |
| `minStock?`    | number ≥ 0, punto de reorden (alertas `StockLow` futuras)                                         |
| `archived`     | boolean (soft-delete; archivado no entra en movimientos/transferencias/conteos/recepciones → 409) |

## Colección `stock` (saldo proyectado)

| Campo         | Tipo / notas                                                                          |
| ------------- | ------------------------------------------------------------------------------------- |
| `tenantId`    | string (SIEMPRE del JWT)                                                              |
| `productId`   | ObjectId → `products`                                                                 |
| `warehouseId` | ObjectId → `warehouses` (Organization)                                                |
| `qty`         | number (≥ 0 — invariante: solo cambia con `$inc` y guardia `qty ≥ −delta` en salidas) |

- Clave de negocio: **única por (tenant, producto, almacén)** (índice único): el upsert del primer movimiento la crea; nunca se edita `$set` a mano.
- `GET /inventory/stock` no tiene escritura pública: NO existe endpoint que la altere.

## Colección `stockMovements` (ledger append-only)

| Campo          | Tipo / notas                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                                |
| `productId`    | ObjectId → `products`                                                                                   |
| `warehouseId`  | ObjectId → `warehouses`                                                                                 |
| `type`         | enum `receipt \| manual_in \| manual_out \| transfer_in \| transfer_out \| count_adjustment`            |
| `qty`          | number **con signo**: + entrada, − salida                                                               |
| `balanceAfter` | number, saldo resultante de (producto, almacén) tras aplicar este movimiento                            |
| `sourceType?`  | `goods.receipt \| stock.transfer \| stock.count` (null en manuales)                                     |
| `sourceId?`    | ObjectId del documento origen (null en manuales)                                                        |
| `reason?`      | string (obligatorio en manuales; los del sistema llevan `<documento> <número>` o el detalle del conteo) |
| `createdAt`    | Date — **sin `updatedAt`**: nada se reescribe                                                           |

## Colección `stockTransfers`

| Campo             | Tipo / notas                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `tenantId`        | string (SIEMPRE del JWT)                                                       |
| `number`          | string, inmutable, serie del servidor (`TR-YYYY-000001`, por tenant+año)       |
| `fromWarehouseId` | ObjectId → `warehouses` (≠ destino → 400)                                      |
| `toWarehouseId`   | ObjectId → `warehouses`                                                        |
| `lines[]`         | subdoc **sin `_id`**: `productId` (ObjectId → `products`), `quantity` (> 0)    |
| `status`          | `draft \| in_transit \| completed \| cancelled` (máquina en `inventory-rules`) |
| `notes?`          | string, limpiable con `null`                                                   |
| `archived`        | boolean (soft-delete; sin ruta DELETE)                                         |

## Colección `inventoryCounts`

| Campo         | Tipo / notas                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `tenantId`    | string (SIEMPRE del JWT)                                                                         |
| `number`      | string, inmutable, serie del servidor (`CT-YYYY-000001`, por tenant+año)                         |
| `warehouseId` | ObjectId → `warehouses` (un almacén por conteo)                                                  |
| `lines[]`     | subdoc **sin `_id`**: `productId` (ObjectId → `products`), `countedQty` (≥ 0, unidades contadas) |
| `status`      | `draft \| approved \| cancelled` (la aprobación SOLO vía endpoint con `stock.count:approve`)     |
| `notes?`      | string, limpiable con `null`                                                                     |
| `archived`    | boolean (soft-delete; sin ruta DELETE)                                                           |

Adicional: `counters` (dueño: `core/numbering`) para las series `TR`/`CT` atómicas.

## Índices (query → índice, todos con `tenantId` primero)

| Colección         | Índice                                          | Query justificada                                                                        |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `products`        | `{tenantId, code}` **unique**                   | clave natural + `POST` (duplicado → 409)                                                 |
| `products`        | `{tenantId, createdAt:-1}`                      | `GET /inventory/products`                                                                |
| `products`        | `{tenantId, archived, createdAt:-1}`            | `GET /inventory/products?archived=`                                                      |
| `stock`           | `{tenantId, productId, warehouseId}` **unique** | clave de saldo + upsert (carrera de primer movimiento) + `GET …?productId=&warehouseId=` |
| `stock`           | `{tenantId, warehouseId}`                       | `GET /inventory/stock?warehouseId=` (existencias por almacén)                            |
| `stockMovements`  | `{tenantId, createdAt:-1}`                      | `GET /inventory/movements` (desc)                                                        |
| `stockMovements`  | `{tenantId, productId, createdAt:-1}`           | `GET …?productId=`                                                                       |
| `stockMovements`  | `{tenantId, warehouseId, createdAt:-1}`         | `GET …?warehouseId=`                                                                     |
| `stockTransfers`  | `{tenantId, number}` **unique**                 | unicidad de la serie `TR` (`core/numbering` `$inc`)                                      |
| `stockTransfers`  | `{tenantId, createdAt:-1}`                      | `GET /inventory/transfers`                                                               |
| `stockTransfers`  | `{tenantId, status, createdAt:-1}`              | `GET …?status=`                                                                          |
| `inventoryCounts` | `{tenantId, number}` **unique**                 | unicidad de la serie `CT` (`core/numbering` `$inc`)                                      |
| `inventoryCounts` | `{tenantId, createdAt:-1}`                      | `GET /inventory/counts`                                                                  |
| `inventoryCounts` | `{tenantId, status, createdAt:-1}`              | `GET …?status=`                                                                          |

`?type=` de movimientos y `?archived=` de transferencias/conteos son filtros residuales sobre índices de `tenantId`+`createdAt` (cardinalidad baja; ADR-003). La unicidad de `code`/`number` es **por tenant**: lo mismo en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en tests de aislamiento.

## Desviaciones documentadas de `database.md`

`database.md` lista 12 colecciones de inventario; esta fase implementa 5 (`products`, `stock`, `stockMovements`, `transfers`→`stockTransfers`, `inventoryCounts`). **NOT IMPLEMENTED** (sin endpoints en convenciones §4; postergadas, no olvidadas): `productVariants`, `categories`, `brands`, `units` (hoy `unit` es un string en el producto), `stockReservations`, `lots`, `serialNumbers`. Requieren decisiones propias (variantes de SKU, trazabilidad por lote/serie, reservas vs. disponibilidad) y se retoman en fases de detalle de producto.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`inventory-repository.ts` es el único camino a MongoDB). Único punto de casteo: `payload`/`$set` de create/update y ObjectId en filtros.
- `tenantId` jamás del cliente; `number`/`balanceAfter` jamás del cliente; FKs cruzadas → `404` uniforme.
- Salida = `$inc` negativo con guardia `qty ≥ −delta` **en el filtro** (nunca negativo aunque haya concurrencia); entrada = `$inc` con upsert (reintenta una vez ante carrera de upserts por el índice único).

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): saldo y movimiento se escriben en DOS operaciones (saldo primero): una caída entre ambas deja saldo sin registro en el ledger; pre-chequeos de transferencia/conteo contra carreras concurrentes (estado↔ledger es at-most-once).
- **PARTIAL**: sin referential integrity en BD (soft-delete conserva enlaces por diseño, coherente con FASE 5/8/9/10).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); concurrencia real sobre el mismo saldo; volumen alto sobre `counters`.
- **RISK**: sin índice de texto en productos; `qty` sin redondeo forzado; colecciones diferidas listadas arriba (variantes/lotes/series/reservas).
