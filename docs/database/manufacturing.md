# Base de datos — MANUFACTURING (FASE 16)

2 colecciones nuevas, propias de Manufacturing (dueño FASE 16): `boms` (maestro con clave natural) y `productionOrders` (documento numerado + máquina de estados). Líneas embebidas por ADR-003 (el plan de producción es parte del documento, no una colección aparte). Schema en `manufacturing/infrastructure/schemas/collections.ts`.

## Colección `boms`

| Campo       | Tipo / notas                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `tenantId`  | string (SIEMPRE del JWT)                                                           |
| `code`      | string, **única por tenant** (normalizada: mayúsculas, espacios → `-`) e inmutable |
| `name`      | string (1–120)                                                                     |
| `productId` | ObjectId → `products` (producto terminado que produce la BOM)                      |
| `lines`     | `[{productId: ObjectId, quantity}]` **POR UNIDAD** (1–200, sin `_id`)              |
| `archived`  | boolean (soft-delete; sin `bom:delete` en el catálogo)                             |

## Colección `productionOrders`

| Campo         | Tipo / notas                                                              |
| ------------- | ------------------------------------------------------------------------- |
| `tenantId`    | string (SIEMPRE del JWT)                                                  |
| `number`      | string, **único por tenant**: `MO-YYYY-000001` (`core/numbering` `$inc`)  |
| `productId`   | ObjectId → `products` (producto terminado a producir)                     |
| `quantity`    | number entero ≥ 1 (unidades a producir)                                   |
| `warehouseId` | ObjectId → `warehouses` (entra terminado, salen componentes)              |
| `bomId`       | ObjectId → `boms` \| null (null = líneas explícitas; inmutable tras alta) |
| `lines`       | `[{productId: ObjectId, quantity}]` snapshot POR UNIDAD (inmutable)       |
| `status`      | enum `draft \| in_progress \| completed \| cancelled`                     |
| `notes?`      | string ≤ 500 \| null                                                      |
| `archived`    | boolean (soft-delete; sin `production.order:delete`)                      |

## Índices

| Colección          | Índice                               | Query justificada                                                                 |
| ------------------ | ------------------------------------ | --------------------------------------------------------------------------------- |
| `boms`             | `{tenantId, code}` **unique**        | clave natural: `POST` duplicado en el mismo tenant → 409 (otros tenants intactos) |
| `boms`             | `{tenantId, createdAt:-1}`           | `GET /manufacturing/boms` (listado por defecto, desc)                             |
| `boms`             | `{tenantId, archived, createdAt:-1}` | `GET /manufacturing/boms?archived=`                                               |
| `productionOrders` | `{tenantId, number}` **unique**      | número secuencial atómico (`$inc`) + lookup por `MO-*`                            |
| `productionOrders` | `{tenantId, createdAt:-1}`           | `GET /manufacturing/orders` (cola por defecto, desc)                              |
| `productionOrders` | `{tenantId, status, createdAt:-1}`   | `GET /manufacturing/orders?status=` (cola filtrada por estado)                    |
| `productionOrders` | `{tenantId, archived, createdAt:-1}` | `GET /manufacturing/orders?archived=`                                             |

`tenantId` SIEMPRE primero (ADR-002); cada índice justificado por una lectura o restricción de unicidad (sin índices "por si acaso").

## Reglas de escritura

- Único camino a Mongo: `manufacturing/infrastructure/repositories/manufacturing-repository.ts` (2 modelos propios `ManufacturingBom`/`ManufacturingProductionOrder` — nunca reutilizan el nombre del modelo de otro módulo). Toda operación filtra por `tenantId`.
- **Stock**: las órdenes NO escriben `stock`/`stockMovements` directamente al crear/editar; SOLO al `completed`, a través de la API pública de Inventory (`listBalances` → pre-chequeo `422` → `recordMovement` `production_out`/`production_in` con `sourceType: 'production.order'`). Ver `docs/database/inventory.md`.
- **Sin transacciones multi-documento**: el flujo es pre-chequeo → estado → movimientos (mismo patrón que transferencias/recepciones, FASE 11); el estado terminal `completed` es la guarda de at-most-once. RISK documentado en el reporte de fase.
- Duplicado de clave natural (`tenantId,code` / `tenantId,number`) → `E11000` traducido a `409` en el repositorio.

## NOT TESTED / RISK / PARTIAL

- **RISK**: sin transacciones Mongo: un crash entre el flip a `completed` y los movimientos dejaría la orden completada sin ledger (misma ventana que transferencias/recepciones; mitigado por el pre-chequeo, que elimina los fallos de negocio previsibles). Atlas real (replica set) NOT TESTED.
- **NOT TESTED**: `explain()` de los índices sobre Atlas; volumen alto de la cola de producción.
