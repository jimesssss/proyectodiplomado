# API — INVENTORY (`/api/v1/…`) — FASE 11

Estado: implementado. Módulo `apps/api/src/modules/inventory`; reglas de dominio e índices en `docs/database/inventory.md`.

## Recursos y endpoints

5 recursos bajo `/inventory/…` (convenciones §4). 18 endpoints: el maestro de productos (CRUD completo con `DELETE` = **soft-delete**), el saldo proyectado (**solo lectura**), el ledger de movimientos (**append-only**: sin PATCH/DELETE) y dos documentos con máquina de estados (transferencia y conteo, **sin DELETE**: el catálogo no define `:delete` → archivar vía `PATCH {archived}`).

| Recurso       | Rutas                                                                                                | Prefijo | Permisos                                      |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| productos     | `POST /inventory/products`, `GET …`, `GET /:id`, `PATCH /:id`, `DELETE /:id`                         | —       | `product:create/read/update/delete`           |
| saldo         | `GET /inventory/stock` (única ruta: no existe escritura directa de saldos)                           | —       | `stock.movement:read`                         |
| movimientos   | `POST /inventory/movements`, `GET …`, `GET /:id` (**sin PATCH/DELETE**: ledger append-only)          | —       | `stock.movement:create/read`                  |
| transferencia | `POST /inventory/transfers`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)                    | `TR`    | `stock.transfer:create/read/update`           |
| conteo        | `POST /inventory/counts`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**) + `POST /:id/approve` | `CT`    | `stock.count:create/read/update` + `:approve` |

- `POST` → `201`; `GET/PATCH` → `200`; `POST /counts/:id/approve` → `200`. Envelope, paginación (`page`, `limit` ≤100) y códigos: `docs/api/conventions.md`.
- Filtros: productos `?archived=true|false`; saldo `?productId=`, `?warehouseId=`; movimientos `?productId=`, `?warehouseId=`, `?type=` (los 6 tipos); transferencias `?status=`, `?archived=`; conteos `?status=`, `?archived=`.
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login.
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`, `number`, `status`, `archived` (en create), `balanceAfter`/`qty` del saldo u otro campo desconocido → `400`. Respuestas **sin** `tenantId`.

## Productos (`/inventory/products`)

- `code` único por tenant (`(tenantId, code)`), normalizado (mayúsculas, espacios → guiones), validado (2–32 chars: letras/dígitos/`. _ -`) e **inmutable** (`PATCH code` → 400); duplicado mismo tenant → 409; el mismo `code` en otro tenant → 201 (ADR-002).
- `unit` (default `unit`), `description?`, `cost?`/`price?` (dinero, redondeo comercial a 2 decimales vía `core/domain/line-totals`), `minStock?` (punto de reorden ≥ 0, alertas futuras de `StockLow`).
- `DELETE` = archivar (doble → 409); producto **archivado no puede entrar en movimientos/transferencias/conteos/recepciones** → `409 Product is archived`; `PATCH {archived}` también funciona.

## Saldos y movimientos (el ledger)

- **Invariante**: el saldo por (producto, almacén) **NUNCA es negativo**. Una salida se aplica con guardia atómica en el propio filtro del update (`qty ≥ −delta`): si no alcanza → `422 DOMAIN_ERROR` con `details {productId, warehouseId, available, required}` y **nada cambia**.
- **`GET /inventory/stock`** es una PROYECCIÓN (colección `stock`): no hay endpoint que la escriba; solo cambia aplicando movimientos.
- **Movimientos manuales** (`POST /inventory/movements`): solo `type ∈ {manual_in, manual_out}` (los tipos del sistema los crea el servidor); `quantity > 0` con signo aplicado por el servidor (+/−); `reason` obligatorio (1–200). El ledger guarda `balanceAfter` (saldo resultante) y `sourceType/sourceId` (documento origen; `null` en manuales).
- **Tipos del sistema**: `receipt` (recepción `posted`), `transfer_out`/`transfer_in` (completar transferencia), `count_adjustment` (aprobar conteo), `production_out`/`production_in` (completar orden de producción, FASE 16 — `sourceType: 'production.order'`). Intentar crearlos por API → `400`.
- **Append-only**: no existen rutas PATCH/DELETE de movimientos (peticiones → 404): la corrección es un movimiento compensatorio (`manual_in`/`manual_out`), nunca reescribir historia.
- FKs: producto inexistente/ajeno → `404`; archivado → `409`; almacén inexistente/ajeno → `404`; almacén archivado → `409 Warehouse is archived`.

## Transferencias (`/inventory/transfers`) — serie `TR-YYYY-000001`

- Forma: `{fromWarehouseId, toWarehouseId (distintos → 400), lines: [{productId, quantity>0}] (1–200), notes?}`; FKs de ambos almacenes y de cada producto (404 ajeno / 409 archivado). Numeración atómica `TR` (`core/numbering`) por tenant+año.
- Máquina: `draft → in_transit → completed`; `cancelled` desde `draft`/`in_transit` (terminal). Salto/repetido → `409`.
- **Edición**: campos de negocio (`from/to/lines/notes`) solo en `draft` (después → `409 Only draft documents can be edited`).
- **El stock se mueve SOLO al `completed`**: primero un pre-chequeo de saldo de TODAS las líneas (`422 DOMAIN_ERROR` **sin escribir nada** si no alcanza), luego el estado, y después los pares `transfer_out` (origen, −) / `transfer_in` (destino, +) con `sourceType: stock.transfer`.
- `POST …/:id/approve` no aplica aquí; `DELETE` no publicado → archivar con `PATCH {archived:true}`.

## Conteos (`/inventory/counts`) — serie `CT-YYYY-000001`

- Forma: `{warehouseId, lines: [{productId, countedQty ≥ 0}] (1–200), notes?}`; una sola almacén por conteo. FKs como transferencias.
- Máquina: `draft → cancelled`; `approved` SOLO vía **`POST /inventory/counts/:id/approve`** con el permiso PROPIO `stock.count:approve` (patrón de `sales.quote:approve`): un `PATCH {status:'approved'}` recibe `409 Approval requires the approve endpoint` (mensaje accionable en vez de un 400 críptico).
- **Aprobación**: congela el conteo (`approved`, solo desde `draft` → si no, `409`) y aplica `contado − sistema` por línea como movimiento `count_adjustment` (±) con razón `Count <número>: system <s>, counted <c>`; **diferencia 0 → sin movimiento** y sin cambio de saldo.
- Editar campos de negocio tras aprobar → `409`; `DELETE` no publicado → `PATCH {archived}`.

## Recepciones → stock (composición con Purchasing, FASE 10 → 11)

- Toda recepción lleva `warehouseId` (FK Organization, obligatorio en create) y sus líneas pueden enlazar `productId` (FK de este módulo).
- Al pasar `goods.receipt` a **`posted`** (terminal), el servidor registra un movimiento `receipt` (+cantidad) por cada línea enlazada en el almacén de la recepción, con `sourceType: goods.receipt`, `sourceId` = recepción y razón `Goods receipt <número>`. Líneas sin `productId` se omiten.
- Dirección del acoplamiento: **Purchasing → Inventory** (nunca al revés; sin ciclos). `posted` terminal = guarda de **at-most-once** sin transacciones (ver RISK).

## Auditoría (FASE 7)

`product.create/.update/.archive/.restore`, `stock.movement.create`, `stock.transfer.*`, `stock.count.*` y **`stock.count.approve`** (`reason: status:approved`). El posting de recepción queda trazado por el `goods.receipt.update` con `reason: status:posted` del propio documento.

## Errores

| Caso                                                                                     | HTTP | Código             |
| ---------------------------------------------------------------------------------------- | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                   | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` / `pv` viejo                                                     | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (cantidades, tipos, enums, ids, campos extra)                | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant (uniforme)                                               | 404  | `NOT_FOUND`        |
| Salida con saldo insuficiente (`available`, `required` en `details`)                     | 422  | `DOMAIN_ERROR`     |
| Transición inválida/repetida, edición fuera de borrador, doble archivado, código/almacén | 409  | `CONFLICT`         |
| `DELETE` de movimientos/transferencias/conteos (ruta no publicada)                       | 404  | `NOT_FOUND`        |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): saldo y movimiento son DOS escrituras (saldo primero, movimiento después): una caída entre ambas deja el saldo correcto sin su registro en el ledger (recuperable re-insertando el movimiento); pre-chequeo de transferencia/conteo contra carreras concurrentes (la ventana estado↔ledger es at-most-once, como el posting de recepciones).
- **PARTIAL**: cantidades sin redondeo forzado (p. ej. 1/3 en unidades fraccionarias); sin reservas (`stockReservations`), lotes ni series (ver desviaciones en `docs/database/inventory.md`).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; escrituras concurrentes sobre el mismo saldo (la guardia `qty ≥ −delta` está diseñada para ello pero solo se ejercita secuencialmente).
- **RISK**: sin índice de texto ni búsqueda `q` en productos; alertas `StockLow` (`minStock`) sin consumidor hasta fases de reporting/eventos; sin cascadas (archivar producto no afecta documentos enlazados).
