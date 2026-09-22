# Base de datos — ACCOUNTING (FASE 12)

Cuatro colecciones del módulo `accounting` (la fila de FASE 12 de `docs/architecture/database.md`: "invariante DEBIT=CREDIT"). Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `_id ObjectId`.

**Decisión de diseño**: los asientos llevan sus líneas **EMBEDDIDAS** (`journalEntries.lines`, subdoc sin `_id`) — misma decisión que las líneas de Sales/Purchasing en FASE 9: la partida doble es una transacción lógica única (asiento + sus líneas + sus totales se leen y validan siempre juntos), no un grafo consultable por separado. Por eso **`journalLines` NO es una colección** (desviación documentada abajo). La publicación (`posted`) asigna `periodId` resuelto del `date`; los totales (`debitTotal`/`creditTotal`) los calcula y almacena el servidor.

## Colección `accounts` (plan contable)

| Campo          | Tipo / notas                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                                    |
| `code`         | string, **única por tenant**, normalizada (mayúsculas, espacios → `-`), inmutable (p. ej. `1000`, `CAJA-5`) |
| `name`         | string (1–200)                                                                                              |
| `nature`       | enum `asset \| liability \| equity \| revenue \| expense`, **inmutable** (no existe en el PATCH → 400)      |
| `description?` | string, limpiable con `null`                                                                                |
| `archived`     | boolean (soft-delete; una cuenta archivada NO puede recibir líneas de asiento → 409)                        |

- El **saldo normal** (`normalBalance`: asset/expense → `debit`; liability/equity/revenue → `credit`) **NO se almacena**: se deriva de `nature` al serializar (`normalBalanceFor`). Ningún endpoint lo acepta (create → 400).
- Plan contable **plano**: sin `parentId` (jerarquía de cuentas fuera del alcance de FASE 12, decisión documentada).

## Colección `journalEntries` (asientos; líneas embebidas)

| Campo         | Tipo / notas                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `tenantId`    | string (SIEMPRE del JWT)                                                                              |
| `number`      | string, inmutable, serie del servidor (`JE-YYYY-000001`, por tenant+año)                              |
| `date`        | Date — fecha contable (el cliente puede backdatear; el período fiscal se resuelve de AQUÍ al postear) |
| `currency`    | string ISO-4217 de 3 letras, normalizada a mayúsculas, default `USD` (UNA moneda por asiento)         |
| `lines[]`     | subdoc **sin `_id`**: `accountId` (ObjectId → `accounts`), `description?`, `debit`, `credit`          |
| `debitTotal`  | number, calculado por el servidor (suma de líneas, 2 decimales)                                       |
| `creditTotal` | number, calculado por el servidor (¡SIEMPRE = `debitTotal`!)                                          |
| `status`      | `draft \| posted \| cancelled` (terminales; `posted` SOLO vía endpoint `POST /:id/post`)              |
| `periodId?`   | ObjectId → `fiscalPeriods`, `null` en draft; escrito SOLO al postear                                  |
| `reference?`  | string, limpiable con `null`                                                                          |
| `notes?`      | string, limpiable con `null`                                                                          |

- **Invariante DEBIT=CREDIT** (fila de `database.md`): el servidor valida `sum(debits) === sum(credits)` en create, en PATCH de líneas y DEFENSIVAMENTE al postear → `422 DOMAIN_ERROR` con `details {debits, credits}` si no cumple.
- **XOR por línea** (exactamente una cara > 0, la otra = 0): validado en el esqueStricto (mínimo `0.01` por cara para que el redondeo a 2 decimales no anule una cara).
- Sin `archived`: los asientos se descartan **cancelándose**, no archivándose (la edición de negocio solo existe en `draft` → 409 después).

## Colección `fiscalPeriods` (períodos fiscales)

| Campo      | Tipo / notas                                                            |
| ---------- | ----------------------------------------------------------------------- |
| `tenantId` | string (SIEMPRE del JWT)                                                |
| `code`     | string, **única por tenant**, normalizada, inmutable (p. ej. `2026-01`) |
| `name?`    | string, limpiable con `null`                                            |
| `startsAt` | Date, **inmutable**                                                     |
| `endsAt`   | Date, **inmutable**, siempre > `startsAt` (400 en create)               |
| `status`   | `open \| closed` (`closed` terminal: sin re-apertura en FASE 12)        |

- **Sin solape entre períodos del mismo tenant** (revisado en el servidor al crear → `409 Fiscal period overlaps an existing period`): es lo que hace determinista la resolución "período que cubre la fecha" (`startsAt ≤ date ≤ endsAt`).
- Sin `archived`: los períodos se **cierran**, no se archivan.

## Colección `taxes` (maestro de impuestos)

| Campo          | Tipo / notas                                                                            |
| -------------- | --------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                |
| `code`         | string, **única por tenant**, normalizada, inmutable (p. ej. `VAT-16`)                  |
| `name`         | string (1–200)                                                                          |
| `rate`         | number, porcentaje 0–100 (16 = 16%; sin redondeo extra, como el `taxRate` de FASE 9/10) |
| `description?` | string, limpiable con `null`                                                            |
| `archived`     | boolean (soft-delete; sin ruta DELETE)                                                  |

Adicional: `counters` (dueño: `core/numbering`) para la serie `JE` atómica.

## Índices (query → índice, todos con `tenantId` primero)

| Colección        | Índice                                        | Query justificada                                                             |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `accounts`       | `{tenantId, code}` **unique**                 | clave natural + `POST` (duplicado → 409)                                      |
| `accounts`       | `{tenantId, createdAt:-1}`                    | `GET /accounting/accounts`                                                    |
| `accounts`       | `{tenantId, archived, createdAt:-1}`          | `GET …?archived=`                                                             |
| `journalEntries` | `{tenantId, number}` **unique**               | unicidad de la serie `JE` (`core/numbering` `$inc`)                           |
| `journalEntries` | `{tenantId, createdAt:-1}`                    | `GET /accounting/journal-entries`                                             |
| `journalEntries` | `{tenantId, status, createdAt:-1}`            | `GET …?status=`                                                               |
| `journalEntries` | `{tenantId, 'lines.accountId', createdAt:-1}` | **extracto de cuenta** `GET …?accountId=` (multikey sobre el array de líneas) |
| `journalEntries` | `{tenantId, periodId, createdAt:-1}`          | `GET …?periodId=` (cierre/reporte: asientos posteados de un período)          |
| `fiscalPeriods`  | `{tenantId, code}` **unique**                 | clave natural + `POST` (duplicado → 409)                                      |
| `fiscalPeriods`  | `{tenantId, createdAt:-1}`                    | `GET /accounting/periods`                                                     |
| `fiscalPeriods`  | `{tenantId, startsAt:-1, endsAt:-1}`          | resolución al postear `startsAt ≤ date ≤ endsAt` + chequeo de solape al crear |
| `taxes`          | `{tenantId, code}` **unique**                 | clave natural + `POST` (duplicado → 409)                                      |
| `taxes`          | `{tenantId, createdAt:-1}`                    | `GET /accounting/taxes`                                                       |
| `taxes`          | `{tenantId, archived, createdAt:-1}`          | `GET …?archived=`                                                             |

La unicidad de `code`/`number` es **por tenant**: lo mismo en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en tests de aislamiento.

## Desviaciones documentadas de `database.md`

`database.md` (fila FASE 12) lista 9 colecciones contables; esta fase implementa 4 (`accounts`, `journalEntries`, `fiscalPeriods`, `taxes`):

- **`journalLines` NO es una colección**: las líneas van embebidas en `journalEntries.lines` (misma decisión de diseño que `salesOrderLines`/`purchaseOrderLines` de FASE 9/10: documento+líneas+totales siempre se leen y validan juntos).
- **`currencies`, `exchangeRates` → FASE 13 (TREASURY)**: el catálogo de permisos NO tiene claves `currency:*`/`exchange:*` (crearlas exigiría un bump de `pv` y treasury es el módulo del dinero); un asiento ya lleva su `currency` (una moneda por asiento, default USD).
- **`budgets`**: permiso `accounting.budget` existe en el catálogo pero el pronóstico de fases no lo incluye en FASE 12 (postergado, documentado en el reporte de fase).
- **`accountingDocuments`**: asientos **manuales** por ahora; la emisión automática desde documentos de venta/compra requiere event bus/outbox (ADR-007) y queda pendiente.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`accounting-repository.ts` es el único camino a MongoDB). Único punto de casteo: `payload`/`$set` de create/update y ObjectId en filtros.
- `tenantId` jamás del cliente; `number`, `debitTotal`, `creditTotal`, `periodId` y `status` en create jamás del cliente (esquemas estrictos → 400); FKs cruzadas → `404` uniforme.
- `posted`/`closed` son terminales: la ventana estado↔período es **at-most-once** (pre-chequeos antes de escribir, sin transacciones — RISK abajo).

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): (a) `POST /:id/post` escribe `status`+`periodId` en UN solo update, pero el pre-chequeo del período contra un cierre concurrente es una **ventana at-most-once** (dos posts concurrentes de borradores distintos contra un período que se cierra en medio); (b) contador de serie `JE` separado del documento.
- **PARTIAL**: sin referential integrity en BD (no hay FK real: `accountId`/`periodId` se validan en la aplicación; soft-delete de cuenta solo bloquea líneas nuevas).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); volumen alto sobre `counters`; concurrencia de dos publicaciones simultáneas sobre el mismo período.
- **RISK**: sin índice de texto ni búsqueda `q`; una moneda por asiento (sin tipo de cambio ni `exchangeRates`); sin auto-posting desde ventas/compras (ADR-007); plan contable plano sin jerarquía (`parentId`); `budgets`/`accountingDocuments` diferidos.
