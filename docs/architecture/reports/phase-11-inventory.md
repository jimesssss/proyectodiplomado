# Reporte de fase — FASE 11: INVENTORY

## ESTADO

**COMPLETADA** (sujeta a QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `inventory` con las 5 rutas de convenciones §4 bajo `/api/v1/inventory/…` (18 endpoints): maestro de productos (`product:*`, CRUD completo, `code` único e inmutable por tenant, `DELETE` = soft-delete), saldo proyectado **solo lectura** (`GET /inventory/stock`), ledger de movimientos **append-only** (`POST/GET` sin PATCH/DELETE; solo tipos manuales en el body; `balanceAfter` calculado por el servidor), transferencias `TR-*` (máquina `draft→in_transit→completed|cancelled`, stock movido SOLO al `completed` con pre-chequeo de saldo 422 sin escrituras parciales) y conteos `CT-*` con aprobación vía **`POST /inventory/counts/:id/approve`** con el permiso separado `stock.count:approve` (patrón `sales.quote:approve`; el PATCH recibe `409 Approval requires the approve endpoint`).

Composición FASE 10 → 11: toda recepción exige ahora `warehouseId` (FK Organization, esquestricto por tipo) y sus líneas pueden enlazar `productId` (FK Inventory); al pasar `goods.receipt` a **`posted`** el servidor crea movimientos `receipt` en el almacén de la recepción (solo líneas enlazadas; `posted` terminal = guarda at-most-once). Dirección del acoplamiento: Purchasing → Inventory (sin ciclos).

Invariante central: **el saldo nunca queda negativo** — toda salida se aplica con guardia atómica (`qty ≥ −delta` en el filtro del update) → `422 DOMAIN_ERROR` con `details {available, required}` sin tocar nada.

## ARCHIVOS

- `apps/api/src/modules/inventory/` (domain/entities ×3, domain/rules + test, infrastructure/schemas ×2, infrastructure/repositories, application ×4, presentation/routes + validators, `index.ts`).
- `apps/api/src/index.ts` (+ montaje de los 5 routers).
- **Purchasing (composición)**: `purchase-document.ts` (+`warehouseId`, +`PurchaseLine.productId`, +`PURCHASE_REQUIRES_WAREHOUSE`), `purchase-rules.ts` (`PurchaseLineInput` local + `normalizePurchaseLines`), `purchase-validators.ts` (línea/almacén por tipo), `collections.ts`/`types.ts`/`purchase-repository.ts` (mapeo), `purchase-service.ts` (FKs + posting).
- Tests: `tests/integration/inventory.test.ts` (nuevo), `tests/security/inventory-security.test.ts` (nuevo), `apps/api/src/modules/inventory/domain/rules/inventory-rules.test.ts` (nuevo), `tests/integration/purchasing.test.ts` (adaptado: cadena de almacén + `warehouseId` obligatorio).
- Docs: `docs/api/inventory.md`, `docs/database/inventory.md` (nuevos), `docs/api/purchasing.md`, `docs/database/purchasing.md`, `docs/security/permission-matrix.md` (+6 rutas), `docs/api/conventions.md` (fila 11 ampliada), este reporte.

## APIs

18 endpoints nuevos (detallados en `docs/api/inventory.md`):

- `POST/GET /inventory/products`, `GET/PATCH/DELETE /inventory/products/:id` (5).
- `GET /inventory/stock` (1, solo lectura).
- `POST/GET /inventory/movements`, `GET /inventory/movements/:id` (3, sin PATCH/DELETE).
- `POST/GET /inventory/transfers`, `GET/PATCH /inventory/transfers/:id` (4, sin DELETE).
- `POST/GET /inventory/counts`, `GET/PATCH /inventory/counts/:id`, **`POST /inventory/counts/:id/approve`** (5, sin DELETE).

Purchasing: sin endpoints nuevos; `POST /purchasing/receipts` ahora exige `warehouseId` (breaking del body, documentado) y `PATCH …/:id {status:'posted'}` tiene efecto colateral en stock.

## COLECCIONES

`products`, `stock`, `stockMovements` (append-only, `createdAt` sin `updatedAt`), `stockTransfers`, `inventoryCounts` (+`counters` de `core/numbering` para series `TR`/`CT`).

**Desviación documentada** (`docs/database/inventory.md`): `database.md` lista 12 colecciones de inventario; FASE 11 implementa 5. **NOT IMPLEMENTED**: `productVariants`, `categories`, `brands`, `units` (hoy `unit` string), `stockReservations`, `lots`, `serialNumbers` (postergadas con justificación: requieren decisiones propias de detalle de producto).

## ÍNDICES

14 índices con `tenantId` primero, todos con query justificada en `docs/database/inventory.md`: `products` (unique `code`, list, list `archived`), `stock` (unique clave de saldo, por almacén), `stockMovements` (list, `?productId`, `?warehouseId`), `stockTransfers`/`inventoryCounts` (unique `number`, list, `?status`). Filtros residuales `?type`/`?archived` documentados.

## TESTS

- **QA real**: `npm run qa` → **EXIT=0**; vitest **315 tests PASSED (42 archivos)**, typecheck 0, lint 0, prettier OK, audit 0 vulnerabilidades.
- Nuevos de FASE 11 (21):
  - **unit** `inventory-rules.test.ts` (6): máquinas de transferencia/conteo (transiciones válidas, saltos, terminales), archivado/restauración, código de producto y `roundMoney` re-exportado.
  - **integration** `inventory.test.ts` (7): producto (código normalizado/único por tenant/inmutable/archivos), ledger (entrada/salida con signo, 422 `DOMAIN_ERROR` sin cambio de saldo, sin PATCH/DELETE, tipos del sistema → 400, filtros), transferencia (serie `TR`, edición bloqueada post-borrador, movimiento de stock al `completed`, pre-chequeo 422 sin escrituras, terminales, sin DELETE), conteo (serie `CT`, 409 del PATCH `approved` con mensaje de endpoint, ajuste −2 con razón `system/counted`, diff 0 sin movimiento, cancelado no aprueba), recepción `posted` → stock (7 unidades, `sourceType/sourceId`, guardia at-most-once, línea sin producto no mueve stock, línea con producto archivado → 409), aislamiento cruzado (404/409 + listados vacíos + almacén archivado → 409), auditoría (`product.create`, `stock.movement.create`, `stock.count.approve`, `goods.receipt.update status:posted`).
  - **security** `inventory-security.test.ts` (8): 401 en las 5 rutas + approve + token manipulado; 403 con `details.permission` en 12 casos (los 4 recursos + approve); separación `stock.count:update` vs `:approve` (editor edita y no aprueba); `pv` obsoleto → 403 re-login; inyecciones (`tenantId`, `archived`, `status`, `number`, `balanceAfter`) → 400; cantidades/tipos/líneas inválidos → 400; ids/queries inválidos → 400; respuestas sin `tenantId`/secretos en las 5 listas.
- Regresión: los 294 tests previos siguen verdes; `purchasing.test.ts` adaptado (+5 aserciones: `warehouseId` obligatorio, eco del almacén, cadena de organización).

## ERRORES

`npm run typecheck` → 0; `npm run lint` → 0 (tras correcciones listadas abajo); QA completo EXIT=0.

## CORRECCIONES

Durante el desarrollo de la fase (antes del QA final):

1. `inventory-routes.ts`: `Router` importado como tipo pero usado como valor → import de valor (2 errores TS1361).
2. `inventory-repository.ts`: import de `MovementSourceType` no usado → eliminado (lint).
3. `inventory-repository.ts`: upsert con `$inc` y `$setOnInsert` sobre el MISMO campo (`qty`) — conflicto inválido en MongoDB → solo `$inc` (en upsert inicializa el campo con el incremento).
4. `stock-service.ts` / `count-service.ts`: placeholders/auxiliares absurdos introducidos al escribir (`tenantId: undefined as never`, función `approved()` sin sentido) → input `ReceiptPostingInput.tenantId` explícito y retorno directo.
5. `inventory-repository.ts`: alias de tipo roto (`StockTransferDocEntity`) → import directo de `StockTransfer`.
6. Test propio: la recepción que llega a `posted` es la **segunda** de la serie (la primera solo probó el salto `draft→posted` → 409) — la aserción de `reason` ahora usa el `number` real de la respuesta en vez de hardcodear `GR-…000001`.
7. `purchasing.test.ts` (preexistente, adaptado): las recepciones ahora exigen `warehouseId` → cadena organization→company→branch→warehouse en `beforeAll` + campo en todos los creates (el create sin `orderId` ahora lleva `warehouseId` para que el 400/primer 404 sigan probando lo que dicen).

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): (a) saldo y movimiento = 2 escrituras (saldo primero → caída = saldo sin registro en ledger); (b) pre-chequeo de transferencia/conteo y posting `posted` → ventana estado↔ledger **at-most-once** (recuperable con movimiento manual referenciando el documento); (c) contador de serie separado del documento.
- **PARTIAL**: concurrencia sobre el mismo saldo NO ejercitada en paralelo (la guardia `qty ≥ −delta` está en el filtro de BD, pero los tests son secuenciales) → RISK de carrera solo probado unitariamente por diseño, no por carga.
- **NOT IMPLEMENTED** (postergadas, documentadas): colecciones `productVariants`, `categories`, `brands`, `units`, `stockReservations`, `lots`, `serialNumbers`; alertas `StockLow` sin consumidor; búsqueda `q` de productos.
- **NOT TESTED**: `apps/web`, `apps/mobile`, Atlas real; emisión automática de stock desde facturas de venta (solo recepciones de compra consumen el ledger esta fase).
- **RISK**: sin cascadas (archivar producto/almacén no afecta documentos enlazados); paginación por offset; `?type`/`?archived` residuales sin índice propio.

## PRÓXIMA FASE

**FASE 12 — ACCOUNTING**: plan contable `accounts` (`/accounting/accounts`), entradas `journalEntries` con `journalLines` (invariante DEBIT=CREDIT en el servidor), períodos `fiscalPeriods` (cierre bloquea asientos), impuestos/tipos de cambio (`taxes`, `currencies`, `exchangeRates`), asientos desde documentos de venta/compra (hoy manuales + integración por eventos cuando exista outbox), permisos `accounting.*` del catálogo, auditoría completa y pruebas de aislamiento por tenant.
