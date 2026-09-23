# Base de datos — TREASURY (FASE 13)

Seis colecciones del módulo `treasury` (la fila de FASE 13 de `docs/architecture/database.md` lista 7: `bankAccounts · cashAccounts · bankTransactions · payments · receipts · reconciliations · cashMovements` — desviación documentada abajo). Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `_id ObjectId`. Numeración `PAY/RCP/REC-YYYY-000001` vía `counters` (dueño: `core/numbering`, claves `treasury.payment`/`treasury.receipt`/`treasury.reconciliation`).

**Decisión de diseño**: banco y caja viven en UNA colección `treasuryAccounts` con `type` (el catálogo solo define el permiso `bank.account:*` para ambas). La fuente de verdad del dinero es el ledger **`cashMovements` APPEND-ONLY** (espejo de `stockMovements` de FASE 11): `balance` de la cuenta es una PROYECCIÓN (`openingBalance + Σ cashMovements`) que solo se modifica vía `$inc` con guardia atómica. Las conciliaciones emparejan líneas EXTERNAS (`bankTransactions`) contra ese ledger y llevan sus líneas **EMBEDDIDAS** (`reconciliations.lines`, subdoc sin `_id` — misma decisión que las líneas de FASE 9/12: documento + líneas siempre se leen y re-validan juntos).

## Colección `treasuryAccounts` (banco O caja)

| Campo            | Tipo / notas                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`       | string (SIEMPRE del JWT)                                                                                                      |
| `type`           | enum `bank \| cash` (ambas usan `bank.account:*`; solo `bank` admite líneas/conciliaciones)                                   |
| `code`           | string, **única por tenant**, normalizada (mayúsculas, espacios → `-`), inmutable                                             |
| `name`           | string (1–200)                                                                                                                |
| `description?`   | string, limpiable con `null`                                                                                                  |
| `accountNumber?` | string (IBAN/n.º de cuenta, solo bancos), inmutable                                                                           |
| `currency`       | string ISO-4217, normalizada, default `USD`, **inmutable** (UNA moneda por cuenta, sin conversión)                            |
| `openingBalance` | number ≥ 0, **inmutable** (se registra como movimiento `opening` en el ledger)                                                |
| `balance`        | number, **proyección server-only**: `openingBalance + Σ cashMovements` (`$inc` + guardia `balance ≥ −delta` → NUNCA negativo) |
| `archived`       | boolean (soft-delete; cuenta archivada no circula dinero → 409)                                                               |

- `balance`/`openingBalance` jamás del cliente en PATCH (esquema estricto → 400); `balance` solo se modifica en `applyDelta`.

## Colecciones `payments` (dinero OUT) y `receipts` (dinero IN) — espejo

| Campo        | Tipo / notas                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`   | string (SIEMPRE del JWT)                                                                                                              |
| `number`     | string, **única por tenant**, serie del servidor (`PAY-…` en pagos, `RCP-…` en cobros)                                                |
| `accountId`  | ObjectId → `treasuryAccounts` (debe estar activa al crear/publicar → 409 si archivada)                                                |
| `amount`     | number > 0 (0.01–1e12, 2 decimales); el SIGNO lo aplica el servidor (OUT − / IN +)                                                    |
| `date`       | Date (default ahora; el cliente puede backdatear)                                                                                     |
| `invoiceId?` | ObjectId → `supplierInvoices` (pago) / `invoices` (cobro) o `null` — FK **informacional**: valida pertenencia, sin cascadas (ADR-007) |
| `reference?` | string, limpiable con `null`                                                                                                          |
| `notes?`     | string, limpiable con `null`                                                                                                          |
| `status`     | `draft \| posted \| cancelled` (terminales; `posted` SOLO vía `PATCH {status}` con `:update`)                                         |
| `archived`   | boolean (soft-delete; sin ruta DELETE)                                                                                                |

- **Dinero SOLO en `posted`**: la publicación hace `transition` (condicionada a `draft`) + `$inc` en la cuenta + apunte en el ledger con `sourceType:'payment'|'receipt'`.
- Campos de negocio editables solo en `draft` (409 después).

## Colección `bankTransactions` (líneas EXTERNAS del banco)

| Campo               | Tipo / notas                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `tenantId`          | string (SIEMPRE del JWT)                                                                                 |
| `accountId`         | ObjectId → `treasuryAccounts` con `type:'bank'` (otro tipo → 422)                                        |
| `date`              | Date (default ahora)                                                                                     |
| `amount`            | number **con signo** ≠ 0 (depósito + / retiro −)                                                         |
| `externalId?`       | string, referencia del banco (inmutable)                                                                 |
| `description?`      | string, limpiable con `null` (ÚNICO campo que admite `PATCH`)                                            |
| `reconciliationId?` | ObjectId → `reconciliations` o `null` — **server-only**: lo escribe SOLO la conciliación (cliente → 400) |

- Sin `status` ni `archived`: ES el hecho bancario (inmutable salvo `description`). **NO mueve el saldo interno.**

## Colección `reconciliations` (con líneas embebidas)

| Campo          | Tipo / notas                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `tenantId`     | string (SIEMPRE del JWT)                                                                                                       |
| `number`       | string, **única por tenant**, serie del servidor (`REC-…`)                                                                     |
| `accountId`    | ObjectId → `treasuryAccounts` con `type:'bank'` (otro tipo → 422)                                                              |
| `reconciledAt` | Date (default ahora)                                                                                                           |
| `lines[]`      | subdoc **sin `_id`**: `bankTransactionId` (ObjectId → `bankTransactions`), `movementId?` (ObjectId → `cashMovements` o `null`) |
| `notes?`       | string, limpiable con `null`                                                                                                   |

- `PATCH {lines}` **REEMPLAZA** el set con re-validación completa: salientes → `unmark` (solo si siguen en ESTA conciliación), entrantes → `mark` con `$or: [{reconciliationId: null}, {reconciliationId: nuestra}]` (nunca pisa otra conciliación).

## Colección `cashMovements` (ledger APPEND-ONLY)

| Campo          | Tipo / notas                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                           |
| `accountId`    | ObjectId → `treasuryAccounts`                                                                      |
| `amount`       | number CON signo: + entrada (`opening`/`receipt`), − salida (`payment`)                            |
| `balanceAfter` | number: saldo de la cuenta TRAS aplicar este movimiento                                            |
| `sourceType`   | enum `opening \| payment \| receipt`                                                               |
| `sourceId`     | ObjectId (documento que originó el movimiento; **único por tenant+tipo** → 1 apunte por documento) |
| `reason`       | string legible (`"Payment PAY-2026-000001"`, …)                                                    |

- `timestamps: {createdAt: true, updatedAt: false}` — nada se reescribe; sin rutas PATCH/DELETE (ausentes → 404).

Adicional: `counters` (dueño: `core/numbering`) para las series `PAY`/`RCP`/`REC`.

## Índices (21; query → índice, todos con `tenantId` primero)

| Colección          | Índice                                        | Query justificada                                                     |
| ------------------ | --------------------------------------------- | --------------------------------------------------------------------- |
| `treasuryAccounts` | `{tenantId, code}` **unique**                 | clave natural + `POST` (duplicado → 409)                              |
| `treasuryAccounts` | `{tenantId, createdAt:-1}`                    | `GET /treasury/accounts`                                              |
| `treasuryAccounts` | `{tenantId, archived, createdAt:-1}`          | `GET …?archived=`                                                     |
| `treasuryAccounts` | `{tenantId, type, createdAt:-1}`              | `GET …?type=bank\|cash`                                               |
| `payments`         | `{tenantId, number}` **unique**               | unicidad de la serie `PAY` (`core/numbering` `$inc`)                  |
| `payments`         | `{tenantId, createdAt:-1}`                    | `GET /treasury/payments`                                              |
| `payments`         | `{tenantId, status, createdAt:-1}`            | `GET …?status=`                                                       |
| `payments`         | `{tenantId, accountId, createdAt:-1}`         | `GET …?accountId=` (extracto por cuenta)                              |
| `receipts`         | `{tenantId, number}` **unique**               | unicidad de la serie `RCP`                                            |
| `receipts`         | `{tenantId, createdAt:-1}`                    | `GET /treasury/receipts`                                              |
| `receipts`         | `{tenantId, status, createdAt:-1}`            | `GET …?status=`                                                       |
| `receipts`         | `{tenantId, accountId, createdAt:-1}`         | `GET …?accountId=`                                                    |
| `bankTransactions` | `{tenantId, createdAt:-1}`                    | `GET /treasury/bank-transactions`                                     |
| `bankTransactions` | `{tenantId, accountId, createdAt:-1}`         | `GET …?accountId=`                                                    |
| `bankTransactions` | `{tenantId, accountId, reconciliationId}`     | `GET …?accountId=&reconciled=true\|false` (pendientes de conciliar)   |
| `reconciliations`  | `{tenantId, number}` **unique**               | unicidad de la serie `REC`                                            |
| `reconciliations`  | `{tenantId, createdAt:-1}`                    | `GET /treasury/reconciliations`                                       |
| `reconciliations`  | `{tenantId, accountId, createdAt:-1}`         | `GET …?accountId=`                                                    |
| `cashMovements`    | `{tenantId, createdAt:-1}`                    | `GET /treasury/accounts/:id/movements` (orden `createdAt:-1, _id:-1`) |
| `cashMovements`    | `{tenantId, accountId, createdAt:-1}`         | extracto por cuenta                                                   |
| `cashMovements`    | `{tenantId, sourceType, sourceId}` **unique** | at-most-once del apunte: 1 movimiento por documento de origen         |

La unicidad de `code`/`number` es **por tenant**: lo mismo en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en tests de aislamiento.

## Desviaciones documentadas de `database.md`

`database.md` (fila FASE 13) lista 7 colecciones; esta fase implementa **6**:

- **`bankAccounts` + `cashAccounts` → UNA `treasuryAccounts` con `type`**: el catálogo de permisos solo define `bank.account:*` para ambas; dos colecciones exigirían duplicar el grupo de permisos (o crear uno nuevo con bump de `pv`) sin aportar separación real — una cuenta con `bank.account:read` puede leer las dos en cualquier caso.
- **`currencies`, `exchangeRates` → SIGUEN DIFERIDOS (nota honesta)**: FASE 12 los postergó a FASE 13 con la expectativa de que "treasury es el módulo del dinero"; al implementar esta fase se confirmó que el catálogo **tampoco** define claves `currency:*`/`exchange:*` → crear el grupo exigiría un bump de `pv` (contrato con clientes). Cada documento ya lleva su `currency`/importe (UNA moneda por cuenta en tesorería; una por asiento en contabilidad). **No se implementan en FASE 13**; queda pendiente para una fase que pueda versionar el catálogo.
- **Transferencias entre cuentas**: concepto nuevo (dos apuntes enlazados + documento propio) fuera del alcance de FASE 13; el ledger (`sourceType`) queda preparado para alojarlo.
- El auto-pago/marcado de facturas desde pagos NO usa colección nueva (los pagos ya enlazan `invoiceId`); la sincronización requiere event bus/outbox (ADR-007).

## Reglas

- Ninguna operación fuera del repositorio del módulo (`treasury-repository.ts` es el único camino a MongoDB). Único punto de casteo: payload/`$set` de create/update y ObjectId en filtros.
- `tenantId` jamás del cliente; `number`, `status` (en create), `balance`, `reconciliationId`/`reconciled` jamás del cliente (esquemas estrictos → 400); FKs cruzadas → `404` uniforme; cuenta archivada → `409`.
- `posted`/`cancelled` son terminales: la puerta del dinero es **at-most-once** (transición condicionada a `draft` + guardia de `$inc` + compensación, sin transacciones — RISK abajo).

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): (a) si el ledger fallara tras aplicar el `$inc`, el documento queda `posted` SIN apunte (el estado terminal impide el reintento/duplicado); (b) contadores de serie separados del documento; (c) creación de cuenta = 2 escrituras (documento + `opening`); (d) creación de conciliación = update del doc + `mark` (curable re-editando líneas).
- **PARTIAL**: sin referential integrity en BD (no hay FK real: `accountId`/`invoiceId`/`sourceId` se validan en la aplicación; sin cascadas — outbox ADR-007).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); volumen alto sobre `counters`/`cashMovements`; concurrencia NO ejercitada (doble publicación simultánea, `markReconciled` entre conciliaciones concurrentes, carrera de `$inc` vs compensación).
- **RISK**: sin índice de texto ni búsqueda `q`; paginación por offset; UNA moneda por cuenta (sin `currencies`/`exchangeRates`/tipo de cambio); `cashMovements` crece sin poda (retención fuera del alcance); sin auto-pago de facturas (ADR-007).
