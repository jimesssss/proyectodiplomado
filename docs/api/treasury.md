# API — TREASURY (`/api/v1/…`) — FASE 13

Estado: implementado. Módulo `apps/api/src/modules/treasury`; colecciones e índices en `docs/database/treasury.md`.

## Recursos y endpoints

5 recursos bajo `/treasury/…` (convenciones §4). **21 endpoints**: cuentas de tesorería (CRUD **sin `DELETE`** + extracto `GET /:id/movements` sobre el MISMO path), pagos y cobros (CRUD sin `DELETE`, series `PAY`/`RCP`), líneas de banco (router propio, sin `DELETE`) y conciliaciones (router propio, sin `DELETE`, serie `REC`).

| Recurso         | Rutas                                                                                    | Prefijo | Permisos                            |
| --------------- | ---------------------------------------------------------------------------------------- | ------- | ----------------------------------- |
| cuentas         | `POST /treasury/accounts`, `GET …`, `GET /:id`, `PATCH /:id` + **`GET /:id/movements`**  | —       | `bank.account:create/read/update`   |
| pagos           | `POST /treasury/payments`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)          | `PAY`   | `payment:create/read/update`        |
| cobros          | `POST /treasury/receipts`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)          | `RCP`   | `receipt:create/read/update`        |
| líneas de banco | `POST /treasury/bank-transactions`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**) | —       | `bank.account:create/read/update`   |
| conciliaciones  | `POST /treasury/reconciliations`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)   | `REC`   | `reconciliation:create/read/update` |

- `POST` → `201`; `GET/PATCH` → `200`. Envelope, paginación (`page`, `limit` ≤100) y códigos: `docs/api/conventions.md`.
- Filtros: cuentas `?type=bank|cash`, `?archived=true|false`; pagos/cobros `?status=draft|posted|cancelled`, `?accountId=`; líneas de banco `?accountId=`, `?reconciled=true|false`; conciliaciones `?accountId=`; extracto solo paginación.
- El catálogo **no define `:delete`** para `bank.account`/`payment`/`receipt`/`reconciliation` → rutas `DELETE` no publicadas (**404 incluso para el owner**); en cuentas/pagos/cobros el soft-delete es `PATCH {archived}`.
- **El catálogo tampoco define `payment:post`/`receipt:post`**: la publicación de dinero es `PATCH {status:'posted'}` con `:update` (patrón `goods.receipt` de FASE 10) — es la ÚNICA vía que mueve saldo.
- Las líneas de banco viajan sobre **`bank.account:*`** (el catálogo no define `bank.transaction:*` — desviación documentada).
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login.
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`, `number`, `status`/`archived` (en create), `balance`, `openingBalance` (en PATCH de cuenta), `reconciliationId`, `reconciled` u otro campo desconocido → `400`. Respuestas **sin** `tenantId`.

## Cuentas de tesorería (`/treasury/accounts`)

- **UNA colección `treasuryAccounts`** con `type ∈ {bank, cash}`: el catálogo solo define el permiso `bank.account:*` para ambas (`database.md` lista `bankAccounts` + `cashAccounts` → desviación documentada en `docs/database/treasury.md`).
- `code` único por tenant, normalizado (mayúsculas, espacios → guiones), validado (2–64 chars) e **inmutable**; duplicado mismo tenant → `409 Code already exists`; otro tenant con el mismo `code` → `201` (ADR-002).
- `type`, `currency` (ISO-4217, default `USD`, normalizada; UNA moneda por cuenta, sin conversión), `accountNumber` y `openingBalance` (≥ 0) **inmutables**: `PATCH` sobre cualquiera de ellos → `400`.
- **`balance` es proyección server-only** (`openingBalance + Σ cashMovements`): solo cambia vía `$inc` con guardia atómica `balance ≥ −delta` en el propio filtro (el saldo **nunca** queda negativo — mismo patrón que el stock de FASE 11); intentar escribirlo desde el cliente → `400`.
- Al crear la cuenta se escriben **2 cosas**: el documento y el movimiento `opening` en el ledger (ventana documentada si la segunda escritura fallara).
- Sin `DELETE`: `PATCH {archived:true}` con `bank.account:update` (doble → `409 Account is already archived`; doble restaurar → `409 Account is not archived`); ruta `DELETE` ausente → `404`.
- **Cuenta archivada no circula dinero**: create de pago/cobro/línea/conciliación y publicación contra ella → `409 Account is archived`; inexistente o de otro tenant → `404` uniforme.

### Extracto (`GET /treasury/accounts/:id/movements`)

- **Ledger `cashMovements` (append-only)**: `GET` paginado con `amount` CON signo (+ entrada, − salida), `balanceAfter` (saldo de la cuenta tras ese movimiento) y `sourceType`/`sourceId`/`reason`.
- Solo existe `GET`: `PATCH`/`DELETE` sobre esa sub-ruta → `404` (rutas no publicadas); permiso `bank.account:read`; cuenta inexistente/ajena → `404`.

## Pagos (`/treasury/payments`) — serie `PAY-YYYY-000001`

- Forma: `{accountId, amount (0.01–1e12), date?, invoiceId?, reference?, notes?}`; nacen **`draft`** (`number`/`status` SOLO-del-servidor en create → `400`); numeración atómica por tenant+año (`core/numbering`).
- **FK `invoiceId` informacional** a la factura de proveedor (`supplier.invoice`): debe existir **y pertenecer al tenant** → si no → `404` uniforme (id inexistente, factura de venta —otro `kind`— o de otro tenant → 404). **NO modifica la factura** (marcarla `paid` es manual hoy en FASE 9/10; la sincronización automática requiere outbox — ADR-007).
- Máquina **`draft → posted|cancelled`** (`posted` y `cancelled` son terminales):
  - `PATCH {status:'posted'}` con **`payment:update`** (no existe `payment:post`) → única vía que mueve dinero.
  - Campos de negocio (`accountId`/`amount`/`date`/`invoiceId`/`reference`/`notes`) **solo en `draft`** → `409 Only draft documents can be edited`.
  - Mismo estado → `409 Status is already the requested one`; salto inválido → `409 Invalid status transition`.
  - `cancelled` solo cambia el estado: sin movimiento de saldo ni apunte en el ledger.
- Archivar vía `PATCH {archived}` en cualquier estado (doble → `409 Payment is already archived`).

### Publicación at-most-once (sin transacciones Mongo)

Orden de `postPayment` (pasos con escritura condicionada y compensación):

1. **Pre-chequeo SOLO-lectura**: cuenta activa + `balance ≥ amount` → si no, **`422 DOMAIN_ERROR 'Insufficient funds'` con `details {available, required}`** (respuesta limpia: NADA se escribe; el pago sigue `draft`).
2. **Escritura CONDICIONADA a `draft`** (`repo.transition`: el filtro lleva `status:'draft'`) — puerta at-most-once: dos `PATCH {status:'posted'}` concurrentes no pueden mover el dinero dos veces; la perdedora relee → `409 Status is already the requested one`.
3. **`$inc` del saldo con guardia atómica** (`balance ≥ amount` en el filtro): si una carrera la pierde, se **COMPENSA** la escritura de estado (`restoreDraftPatch`: `status` y campos de negocio vuelven a sus valores previos) y responde `422 'Insufficient funds'` con el saldo fresco → **sin efectos netos**.
4. **Apunte en el ledger** (`sourceType:'payment'`; `(tenantId, sourceType, sourceId)` único garantiza 1 apunte por documento).

## Cobros (`/treasury/receipts`) — serie `RCP-YYYY-000001`

- Espejo de los pagos, con FK a la **factura de venta** (`sales.invoice`, mismos 404 uniformes) y publicación con **`receipt:update`**: el dinero ENTRA (`$inc` positivo).
- Sin pre-chequeo de saldo; misma transición condicionada a `draft` (perdedora → 409) y ledger `sourceType:'receipt'` con `reason: "Receipt RCP-…"`.
- Si la cuenta desapareciera entre líneas: **compensación del estado + 404** (un defensivo `422 'Account is unavailable'` cubre el caso de cuenta presente con `$inc` rechazado — no debería ocurrir).
- Archivar → `409 Receipt is already archived`.

## Líneas de banco (`/treasury/bank-transactions`) — router propio

- Registro **EXTERNO** del estado de cuenta: depósito `+` / retiro `−` (`amount ≠ 0`, con signo). **NO mueve el saldo interno** — el dinero solo se mueve con `payment`/`receipt`; estas líneas existen para RECONCILIARLAS contra el ledger.
- Solo sobre cuentas **`type:'bank'`** → `422 DOMAIN_ERROR 'Bank transactions require a bank account'` con `details {type:'cash'}`; cuenta archivada → `409 Account is archived`; cuenta inexistente/ajena → `404`.
- **`reconciliationId` (y `reconciled`) SOLO-del-servidor**: lo pone la conciliación → intentar escribirlos en create → `400`.
- Sin máquina de estados ni `archived`; **`PATCH` solo admite `description`** (importe/fecha/cuenta/externalId son el hecho bancario → inmutables, `400`).
- Sin `DELETE` (ruta ausente → `404`). Filtros: `?accountId=`, `?reconciled=true|false`.

## Conciliaciones (`/treasury/reconciliations`) — serie `REC-YYYY-000001`

- Forma: `{accountId, reconciledAt?, lines: [{bankTransactionId, movementId?}] (1–200), notes?}`; `number` SOLO-del-servidor (inyección → `400`).
- Solo cuentas `type:'bank'` → `422 'Reconciliations require a bank account'`.
- **Validación de TODO el set ANTES de escribir**, en 2 fases (los errores de PETICIÓN van primero que los de estado):
  1. Duplicados del payload → **`400 'Duplicate bank transaction in lines'`** (aunque la línea repetida además esté conciliada).
  2. Entidades/estados: línea inexistente o ajena → `404`; línea de **otra cuenta** → `409 'Bank transaction belongs to another account'`; ya conciliada en **OTRO** documento → `409 'Bank transaction is already reconciled'`; `movementId` de otra cuenta → `409 'Movement belongs to another account'`; movimiento inexistente → `404`.
- Al crear: **marca** `reconciliationId` solo sobre líneas **libres o ya nuestras** (`$or` en el filtro del `updateMany`) — nunca pisa la marca de otra conciliación concurrente; `unmark` guarda por id propio.
- **`PATCH {lines}` REEMPLAZA el set completo** con re-validación (sin máquina de estados: las líneas se corrigen reemplazándolas, no archivándolas): salientes → `unmark` (solo si siguen en ESTA conciliación), entrantes → `mark` idempotente (cura desajustes); re-editar líneas propias no genera falsos 409. `PATCH {notes}` no toca líneas; `PATCH {}` → `400 No valid fields to update`.
- Sin `DELETE` (ruta ausente → `404`); filtro `?accountId=`.

## Auditoría (FASE 7)

- **Cuentas**: `bank.account.create`; `bank.account.update` (`reason: archived:true`); `bank.account.restore` (`reason: archived:false`).
- **Pagos**: `payment.create`; `payment.update` (`reason: status:posted` / `status:cancelled` / `archived:*`).
- **Cobros**: `receipt.create`; `receipt.update` (ídem).
- **Líneas de banco**: `bank.transaction.create`; `bank.transaction.update` (edición de `description`).
- **Conciliaciones**: `reconciliation.create` (`reason: lines:<n>`); `reconciliation.update` (`reason: lines:<n>` cuando cambian líneas).
- El ledger `cashMovements` no tiene rutas → SIN acciones propias (append-only).

## Errores

| Caso                                                                                                                                                                                                                                                                                                                                                | HTTP | Código             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                                                                                                                                                                                                                                                                              | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` / `pv` viejo                                                                                                                                                                                                                                                                                                                | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (enums, ids, importes, `No valid fields to update`, duplicados de líneas; `tenantId`/`number`/`status`/`balance`/`reconciliationId`)                                                                                                                                                                                    | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant — uniforme (cuenta, factura de pago/cobro, línea, movimiento)                                                                                                                                                                                                                                                       | 404  | `NOT_FOUND`        |
| `Insufficient funds` (`details {available, required}`); `Bank transactions require a bank account`; `Reconciliations require a bank account`                                                                                                                                                                                                        | 422  | `DOMAIN_ERROR`     |
| `Code already exists`; `Account is already archived`/`is archived`; `Only draft documents can be edited`; `Status is already the requested one`; `Invalid status transition`; `Payment/Receipt is already archived`; `Bank transaction belongs to another account`; `Bank transaction is already reconciled`; `Movement belongs to another account` | 409  | `CONFLICT`         |
| `DELETE` de las 5 rutas y `PATCH`/`DELETE` del extracto (rutas no publicadas)                                                                                                                                                                                                                                                                       | 404  | `NOT_FOUND`        |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): (a) la publicación encadena pre-chequeo → escritura condicionada → `$inc` con guardia + compensación → ledger: si el paso 4 (ledger) fallara tras aplicar el paso 3, el documento queda `posted` SIN apunte (el estado terminal `posted` impide reintentar y duplicar dinero — ventana documentada); (b) contador de serie `PAY/RCP/REC` separado del documento; (c) la creación de cuenta son 2 escrituras (documento + `opening`); (d) creación de conciliación = update del doc + `mark` (curable re-editando las líneas); (e) sin FK real en BD (`accountId`/`invoiceId` validados solo en la aplicación).
- **PARTIAL**: **sin `Idempotency-Key`**: un reintento de red en `POST` crea un documento nuevo (la publicación sí está protegida at-most-once); sin event bus/outbox (ADR-007): los pagos/cobros **no** emiten asientos contables automáticamente ni marcan la factura como `paid` (hoy manual en FASE 9/10); `previousValue` de auditoría `null` en las rutas propias (solo se persiste `newValue`).
- **NOT IMPLEMENTED** (diferido y documentado): `currencies`/`exchangeRates` y conversión/multi-moneda — FASE 12 los postergó a esta fase, pero el catálogo **tampoco** define claves `currency:*`/`exchange:*` (crear el grupo exigiría bump de `pv`); **transferencias entre cuentas**; pago automático/auto-marca de facturas (ADR-007).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; concurrencia NO ejercitada (dos `PATCH {status:'posted'}` simultáneos sobre el mismo pago, carrera `$inc` vs compensación, `markReconciled` entre conciliaciones concurrentes).
- **RISK**: paginación por offset; sin índice de texto ni búsqueda `q`; UNA moneda por cuenta (sin tipo de cambio); vulnerabilidades dev preexistentes de `vitest` (`npm audit` ejecutado aparte — ver reporte de fase).
