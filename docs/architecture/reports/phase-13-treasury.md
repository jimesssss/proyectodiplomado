# Reporte de fase — FASE 13: TREASURY

## ESTADO

**COMPLETADA** (QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `treasury` con las 5 rutas de convenciones §4 bajo `/api/v1/treasury/…` (**21 endpoints**):

- **Cuentas de tesorería** `/treasury/accounts` (`bank.account`: read/create/update, **sin `:delete`**): banco O caja en UNA colección `treasuryAccounts` con `type` (desviación documentada: `database.md` lista `bankAccounts`+`cashAccounts` y el catálogo solo define `bank.account:*`), `code` único por tenant normalizado e inmutable, `type`/`currency`/`accountNumber`/`openingBalance` inmutables, **`balance` proyección server-only** (`openingBalance + Σ cashMovements`) modificable SOLO vía `$inc` con guardia atómica `balance ≥ −delta` (saldo **nunca** negativo — patrón stock FASE 11), creación = 2 escrituras (documento + movimiento `opening`), archivar/restaurar vía `PATCH {archived}` (doble → 409), **sub-ruta `GET /:id/movements`** = extracto del ledger append-only (solo GET → PATCH/DELETE ausentes → 404).
- **Pagos** `/treasury/payments` (`payment`: r/c/u, sin `:delete`): serie **`PAY-YYYY-000001`**, FK **`invoiceId`** a la factura de proveedor (`supplier.invoice`) **informacional y validada** (inexistente/otro kind/otro tenant → 404 uniforme; sin cascadas — ADR-007), máquina **`draft → posted|cancelled`**; **el catálogo NO define `payment:post` → la publicación es `PATCH {status:'posted'}` con `:update`** (patrón `goods.receipt`), dinero SOLO en `posted`, negocio solo en draft (409), archivar en cualquier estado (doble → 409).
- **Publicación at-most-once** (sin transacciones Mongo): pre-chequeo lectura (cuenta activa + `balance ≥ amount` → **422 `Insufficient funds` con `details {available, required}`**, nada escrito) → `repo.transition()` escritura CONDICIONADA a `draft` (dos publicaciones concurrentes no mueven dinero dos veces; perdedora relee → 409) → `applyDelta` con guardia (carrera → **compensación** `restoreDraftPatch` y 422 sin efectos netos) → ledger (`(tenantId, sourceType, sourceId)` único = 1 apunte por documento).
- **Cobros** `/treasury/receipts` (`receipt`: r/c/u, sin `:delete`): serie **`RCP-*`**, espejo con FK a `sales.invoice`, `$inc` positivo sin pre-chequeo (cuenta desaparecida entre líneas → compensación + 404).
- **Líneas de banco** `/treasury/bank-transactions` (router propio, 4 rutas, **gobierna `bank.account:*`** porque el catálogo no define `bank.transaction:*`): registro EXTERNO con importe con signo ≠ 0 que **NO mueve saldo**, solo cuentas `type:'bank'` (422 `Bank transactions require a bank account`), `reconciliationId`/`reconciled` server-only (400), `PATCH` solo `description` (el hecho bancario es inmutable), filtro `?reconciled=`.
- **Conciliaciones** `/treasury/reconciliations` (router propio, 4 rutas, serie **`REC-***`, auditoría `reconciliation.*`): líneas EMBEDDIDAS (1–200) contra `bankTransactions` (+`movementId` opcional del ledger), solo cuentas `bank` (422), **validación de TODO el set en 2 fases antes de escribir** (duplicados del payload → 400 primero; luego 404/409 por entidad/estado), `mark` con `$or` libre-o-propia (nunca pisa otra conciliación), `PATCH {lines}` **reemplaza** el set re-validado con unmark/mark idempotente.

**Diferidos documentados**: `currencies`/`exchangeRates` **SIGUEN diferidos** — FASE 12 los postergó a esta fase, pero el catálogo tampoco define claves `currency:*`/`exchange:*` (crear el grupo exigiría bump de `pv`; nota honesta en `docs/database/treasury.md`); transferencias entre cuentas; pago automático/marcado de facturas (outbox ADR-007).

## ARCHIVOS

- `apps/api/src/modules/treasury/` (domain/entities ×6 + rules + test, infrastructure/schemas ×2 + repository, application ×5, presentation/routes + validators, `index.ts`).
- `apps/api/src/index.ts` (+ montaje de `createTreasuryRouters`, 6 routers).
- Tests: `tests/integration/treasury.test.ts` (nuevo), `tests/security/treasury-security.test.ts` (nuevo), `apps/api/src/modules/treasury/domain/rules/treasury-rules.test.ts` (nuevo).
- Docs: `docs/api/treasury.md`, `docs/database/treasury.md` (nuevos), `docs/security/permission-matrix.md` (+6 rutas), `docs/api/conventions.md` (fila 13 desglosada; filas 14/15 separadas), este reporte.

## APIs

21 endpoints nuevos (detallados en `docs/api/treasury.md`):

- `POST/GET /treasury/accounts`, `GET/PATCH /treasury/accounts/:id`, **`GET /treasury/accounts/:id/movements`** (5, sin DELETE).
- `POST/GET /treasury/payments`, `GET/PATCH /treasury/payments/:id` (4, sin DELETE).
- `POST/GET /treasury/receipts`, `GET/PATCH /treasury/receipts/:id` (4, sin DELETE).
- `POST/GET /treasury/bank-transactions`, `GET/PATCH /treasury/bank-transactions/:id` (4, sin DELETE).
- `POST/GET /treasury/reconciliations`, `GET/PATCH /treasury/reconciliations/:id` (4, sin DELETE).

Sin cambios en endpoints de otros módulos.

## COLECCIONES

`treasuryAccounts`, `payments`, `receipts`, `bankTransactions`, `reconciliations`, `cashMovements` (ledger **append-only**, `timestamps: {createdAt:true, updatedAt:false}`) (+`counters` de `core/numbering` para las series `PAY`/`RCP`/`REC`).

**Desviación documentada** (`docs/database/treasury.md`): la fila de FASE 13 de `database.md` lista 7 colecciones; FASE 13 implementa 6 — `bankAccounts`+`cashAccounts` se fusionan en `treasuryAccounts` con `type` (el catálogo solo define `bank.account:*`). **Diferido con justificación**: `currencies`/`exchangeRates` (sin claves `currency:*` en el catálogo → bump de `pv`; FASE 12 ya los postergó y aquí se mantienen), transferencias entre cuentas.

## ÍNDICES

21 índices con `tenantId` primero, todos con query justificada en `docs/database/treasury.md`: `treasuryAccounts` (unique `code`, list, `?archived`, `?type`), `payments` (unique `number`, list, `?status`, `?accountId`), `receipts` (idem ×4), `bankTransactions` (list, `?accountId`, `{tenantId, accountId, reconciliationId}` de `?reconciled=`), `reconciliations` (unique `number`, list, `?accountId`), `cashMovements` (list, por cuenta, **unique `{tenantId, sourceType, sourceId}`** = at-most-once del apunte).

## TESTS

- **QA real**: `npm run qa` (typecheck + lint + format:check + vitest + build) → **EXIT=0**; vitest **365 tests PASSED (48 archivos)**, typecheck 0, lint 0, prettier OK, build OK.
- **`npm audit` (ejecutado aparte — el script `qa` NO lo incluye)**: producción `npm audit --omit=dev` → **0 vulnerabilidades (EXIT=0)**; **`npm audit` completo → 2 vulnerabilidades MODERADAS preexistentes** en la cadena dev `vitest`/`@vitest/mocker` (fix = breaking `vitest@5`; FASE 13 NO modifica `package.json`/lockfile, verificado en `git status`).
- Nuevos de FASE 13 (27):
  - **unit** `treasury-rules.test.ts` (9): máquina `draft→posted|cancelled` (terminales, saltos), `isEditable`/archivar/restaurar, `normalizeCode`/`validateCode` (giones, 2–64) y divisa ISO-4217, `roundMoney`/`MONEY_MAX` re-exportados de core, prefijos `PAY/RCP/REC`, `toPublic*` de cuenta/pago/cobro/ledger **sin `tenantId`** y `reconciled` derivado de `reconciliationId`.
  - **integration** `treasury.test.ts` (10): cuentas (código normalizado/único por tenant/inmutable, apertura en el ledger, 6 inyecciones → 400, sin DELETE → 404, ciclo archivar/restaurar con dobles → 409, filtros `?type/?archived`), guardia de saldo (pago > saldo → **422 con details y NADA escrito**: sigue draft, ledger intacto), pagos (serie `PAY-*` exacta, draft editable + `PATCH {}` → 400, publicación mueve saldo `1000−125.5=874.5` con apunte `−125.5/balanceAfter`, inmutabilidad `posted` y doble post → 409, cancelado sin dinero), FK de pagos (404 por inexistente/otro kind/otro tenant; cuenta archivada → 409), cobros (`RCP-*` suma a `1224`, cancelado intacto, FKs), líneas de banco (422 en caja con `details.type`, saldo NO se mueve, `reconciliationId` → 400, `PATCH amount` → 400, filtros `?reconciled/?accountId`), conciliaciones (`REC-*`, duplicado → 400, ya conciliada → 409, línea de otra cuenta → 409, movimiento de otra cuenta → 409, `PATCH lines` desmarca/reclama, líneas propias re-editables, `number` inyectado → 400), aislamiento cruzado (B: 404 en los 6 recursos + extracto + 4 creates contra FKs de A + listas vacías + numeración propia `PAY-…000001`), auditoría (`bank.account.create/update/restore` con `archived:*`, `payment.update status:posted`, `receipt.update status:posted`, `bank.transaction.create`, `reconciliation.create lines:1` y `.update lines:2`, sin fugas de A en B).
  - **security** `treasury-security.test.ts` (8): 401 en las 5 rutas + extracto + los 5 POSTs + token manipulado; 403 con `details.permission` en **16 casos** (5 recursos × lectura/escritura + extracto); **separación crear ≠ actualizar** (rol con `payment:create` crea pero `PATCH` —incluyendo la publicación— → 403 `payment:update`; owner publica con `:update` y el saldo baja UNA vez; sin `bank.account:read` → 403); `pv` obsoleto → 403 re-login; inyecciones (`tenantId`/`archived`/`balance`/`type`/`number`/`status`/`reconciliationId`/`reconciled`) → 400; inválidos (tipo, apertura negativa, importes 0/negativos, líneas vacías, status `bogus`, queries) → 400 y **saldo insuficiente → 422 con details sin efectos** (nunca 500); ids/queries → 400 y **DELETE ausente → 404 en los 5 recursos** + `PATCH/DELETE` del extracto → 404 + `PUT` → 404 (ni el owner); respuestas sin `tenantId`/secretos en las 5 listas + extracto.
- Regresión: los **338 tests previos siguen verdes** (45 archivos).

## ERRORES

`npm run typecheck` → 0; `npm run lint` → 0 (tras correcciones listadas abajo); QA completo EXIT=0.

## CORRECCIONES

Durante el desarrollo de la fase (antes del QA final):

1. `treasury/infrastructure/schemas/collections.ts`: FKs nombradas `purchaseId`/`saleId` → **`invoiceId`** canónico uniforme (pagos → `supplier.invoice`, cobros → `sales.invoice`); resolvía 3 errores TS2379 (2 eran cascada del mismo campo en `types.ts`/repositorio).
2. `reconciliation-service.ts` — **validación de líneas en 2 fases**: los duplicados del PAYLOAD (error de petición → 400 `'Duplicate bank transaction in lines'`) se evalúan ANTES que el estado de las entidades; con el chequeo interleaved, una línea repetida que además estaba ya conciliada devolvía 409 en la primera línea antes de ver el duplicado de la segunda.
3. Test propio (`treasury.test.ts`): el segundo fallo de la primera ejecución (`lines:2` ausente en auditoría) era CONSECUENCIA del anterior — vitest aborta el `it` en la primera aserción fallida, por lo que `it8` nunca ejecutó los PATCH `lines:1`/`lines:2` y esas auditorías no existían. Con el fix (2) `it8` completa; verificado con **2 ejecuciones consecutivas 10/10 verdes** (determinista, no flaky).

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): (a) si el ledger fallara tras aplicar el `$inc`, el documento queda `posted` SIN apunte (el estado terminal impide reintentar/duplicar dinero — ventana documentada); (b) contadores `PAY/RCP/REC` separados del documento; (c) creación de cuenta = 2 escrituras (documento + `opening`); (d) creación de conciliación = update del doc + `mark` (curable re-editando líneas); (e) sin FK real en BD (`accountId`/`invoiceId`/`sourceId` solo en la aplicación).
- **PARTIAL**: sin `Idempotency-Key` (un reintento de red en `POST` crea un documento nuevo; la publicación sí es at-most-once); sin event bus/outbox (ADR-007): los pagos no emiten asientos contables automáticos ni marcan facturas `paid` (manual en FASE 9/10); `previousValue` de auditoría `null` en las rutas propias (solo `newValue`).
- **NOT IMPLEMENTED** (diferido y documentado): `currencies`/`exchangeRates`/multi-moneda (catálogo sin `currency:*` → bump de `pv`; FASE 12 los postergó y aquí se confirma el diferido), transferencias entre cuentas, auto-marca de facturas.
- **NOT TESTED**: `apps/web`, `apps/mobile`, Atlas real; concurrencia NO ejercitada (doble publicación simultánea, carrera `$inc` vs compensación, `markReconciled` concurrente entre conciliaciones).
- **RISK**: paginación offset; sin índice de texto ni búsqueda `q`; UNA moneda por cuenta (sin tipo de cambio); `cashMovements` sin poda/retención; vulnerabilidades **moderadas dev preexistentes** de `vitest` (arriba).

## PRÓXIMA FASE

**FASE 14 — WORKFLOW**: máquina de estados/configuración de workflows sobre documentos (catálogo `workflow.*`), rutas `/workflows` (convenciones fila 14); alcance por confirmar contra el catálogo de permisos antes de escribir (regla de la fase: revisar permisos/colecciones primero).
