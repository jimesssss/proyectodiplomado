# Reporte de fase — FASE 12: ACCOUNTING

## ESTADO

**COMPLETADA** (sujeta a QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `accounting` con las 4 rutas de convenciones §4 bajo `/api/v1/accounting/…` (**17 endpoints**):

- **Plan contable** `/accounting/accounts` (`accounting.account`: read/create/update, **sin `:delete`**): `code` único por tenant, normalizado e inmutable; `nature ∈ {asset, liability, equity, revenue, expense}` **inmutable** (ni siquiera existe en el PATCH → 400); **`normalBalance` DERIVADO en el servidor** (asset/expense → `debit`; liability/equity/revenue → `credit`), presente en la respuesta pero jamás aceptado del cliente; plan **plano** (sin jerarquía `parentId` — decisión documentada); archivar/restaurar vía `PATCH {archived}` (doble → 409); cuenta archivada no recibe líneas de asiento (409).
- **Impuestos** `/accounting/taxes` (`accounting.tax`: r/c/u, sin `:delete`): `code` único e inmutable, `rate` 0–100, archivado vía PATCH.
- **Períodos fiscales** `/accounting/periods` (`accounting.period`: r/c/u, sin `:delete`): `code` y fechas **inmutables**, `endsAt > startsAt` (400), **sin solape** entre ventanas del mismo tenant (409 en create — hace determinista la resolución "período que cubre la fecha"), máquina **`open → closed`** terminal (repetido/mal salto → 409), sin `archived` (se cierran, no se archivan).
- **Asientos** `/accounting/journal-entries` (`accounting.journal`: r/c/u/**post**, sin `:delete`): serie **`JE-YYYY-000001`**, líneas **EMBEDDIDAS** con XOR por línea (exactamente una cara ≥ 0.01, la otra 0 → 400), invariante **DEBIT=CREDIT validado SIEMPRE en el servidor** (create, PATCH de líneas y defensivamente al postear → 422 `DOMAIN_ERROR` con `details {debits, credits}`), `currency` ISO-4217 (default USD, una moneda por asiento), máquina `draft → posted|cancelled`; `number`/`debitTotal`/`creditTotal`/`periodId`/`status` SOLO-del-servidor (400). **Publicación vía `POST /:id/post` con el permiso PROPIO `accounting.journal:post`** (patrón `sales.quote:approve`/`stock.count:approve`): `PATCH {status:'posted'}` → **409 `Posting requires the post endpoint`**; al postear resuelve el período que **CUBRE `date`** (sin período → 422; cerrado → 409 con `details.period`) y escribe `status + periodId` en un update (guardia at-most-once).

**Diferidos documentados**: `budgets` (permiso existe pero fuera del alcance de FASE 12), `currencies`/`exchangeRates` → FASE 13 (el catálogo NO tiene claves `currency:*`/`exchange:*`; crearlas exigiría bump de `pv` y treasury es el módulo del dinero), auto-posting de ventas/compras (ADR-007: requiere outbox), jerarquía de cuentas (`parentId`) y multi-moneda (una moneda por asiento).

## ARCHIVOS

- `apps/api/src/modules/accounting/` (domain/entities ×4, domain/rules + test, infrastructure/schemas ×2, infrastructure/repositories, application ×4, presentation/routes + validators, `index.ts`).
- `apps/api/src/index.ts` (+ montaje de los 4 routers).
- Tests: `tests/integration/accounting.test.ts` (nuevo), `tests/security/accounting-security.test.ts` (nuevo), `apps/api/src/modules/accounting/domain/rules/accounting-rules.test.ts` (nuevo).
- Docs: `docs/api/accounting.md`, `docs/database/accounting.md` (nuevos), `docs/security/permission-matrix.md` (+5 rutas), `docs/api/conventions.md` (fila 12 desglosada; fila 13 = treasury), este reporte.

## APIs

17 endpoints nuevos (detallados en `docs/api/accounting.md`):

- `POST/GET /accounting/accounts`, `GET/PATCH /accounting/accounts/:id` (4, sin DELETE).
- `POST/GET /accounting/journal-entries`, `GET/PATCH /accounting/journal-entries/:id`, **`POST /accounting/journal-entries/:id/post`** (5, sin DELETE).
- `POST/GET /accounting/periods`, `GET/PATCH /accounting/periods/:id` (4, sin DELETE).
- `POST/GET /accounting/taxes`, `GET/PATCH /accounting/taxes/:id` (4, sin DELETE).

Sin cambios en endpoints de otros módulos.

## COLECCIONES

`accounts`, `journalEntries` (líneas **embebidas** + `periodId` asignado al postear), `fiscalPeriods`, `taxes` (+`counters` de `core/numbering` para la serie `JE`).

**Desviación documentada** (`docs/database/accounting.md`): la fila de FASE 12 de `database.md` lista 9 colecciones contables; FASE 12 implementa 4. **NOT IMPLEMENTED** (postergadas, no olvidadas): `journalLines` (las líneas van embebidas — misma decisión de FASE 9/10 con líneas de venta/compra), `currencies`/`exchangeRates` (**FASE 13 Treasury**), `budgets`, `accountingDocuments` (asientos manuales hoy; auto-posting requiere outbox ADR-007).

## ÍNDICES

14 índices con `tenantId` primero, todos con query justificada en `docs/database/accounting.md`: `accounts` (unique `code`, list, list `archived`), `journalEntries` (unique `number`, list, `?status`, **`'lines.accountId'` multikey = extracto de cuenta**, `?periodId`), `fiscalPeriods` (unique `code`, list, `{startsAt, endsAt}` de resolución/solape), `taxes` (unique `code`, list, list `archived`).

## TESTS

- **QA real**: `npm run qa` (typecheck + lint + format:check + vitest + build) → **EXIT=0**; vitest **338 tests PASSED (45 archivos)**, typecheck 0, lint 0, prettier OK, build OK.
- **`npm audit` (ejecutado aparte — el script `qa` NO lo incluye)**: producción `npm audit --omit=dev` → **0 vulnerabilidades (EXIT=0)**; `npm audit --audit-level=high` → EXIT=0 (sin altas/críticas); **`npm audit` completo → 2 vulnerabilidades MODERADAS preexistentes** en la cadena dev `vitest`/`@vitest/mocker` (fix = breaking `vitest@5`; FASE 12 NO modifica `package.json`/lockfile, verificado en `git status`).
- Nuevos de FASE 12 (23):
  - **unit** `accounting-rules.test.ts` (8): máquinas `draft→posted|cancelled` y `open→closed` (terminales, saltos), `isEditable`/archivado, `normalizeCode`/`validateCode` (plan numérico `1000` válido) y divisa ISO-4217, `normalBalanceFor` (5 naturalezas), `normalizeJournalLines` (2 decimales, descripción default) y `journalTotals` (suma canónica sin residuo de float: 0.1+0.2 = 0.3 exacto).
  - **integration** `accounting.test.ts` (7): cuentas (código normalizado/único/inmutable, `normalBalance` derivado, `nature` inmutable, sin DELETE → 404, archivar/restaurar doble → 409, filtros `?archived`), impuestos (tasa 0–100, código inmutable, archivado), períodos (único, contiguo OK, solape → 409, fechas inmutables, `open→closed` terminal, sin DELETE), asientos (serie `JE-*`, XOR por línea, 422 con `details`, FK 404/409 archivada, 6 inyecciones → 400, balance re-validado en PATCH → 422), posting (422 sin período, 409 período cerrado con `details.period`, 409 doble post/edición/cancelado, 409 `Posting requires the post endpoint` desde PATCH, filtros `?periodId/?accountId/?status`, borrador editable con período cerrado), aislamiento cruzado (B: 404 en los 4 recursos + post 404 + FK ajena 404 + listas vacías + código reutilizable por tenant), auditoría (`accounting.account.create`, `tax.create`, `period.update status:closed`, `journal.create debitTotal:`, `journal.post status:posted`, `journal.update status:cancelled`, sin fugas de A en B).
  - **security** `accounting-security.test.ts` (8): 401 en las 4 rutas + `/post` + token manipulado; 403 con `details.permission` en **12 casos** (4 recursos × lectura/escritura + `accounting.journal:post`); **separación `accounting.journal:update` vs `:post`** (editor crea/edita asientos pero NO postea → 403 con el permiso exacto; sin `accounting.account:read` → 403); `pv` obsoleto → 403 re-login; inyecciones (`tenantId`, `normalBalance`, `archived`, `status`, `number`, `debitTotal`/`creditTotal`, `periodId`) → 400; inválidos (naturaleza/código, `rate` 150/−5, fechas invertidas, XOR/negativos/1 línea/divisa) → 400 y desbalance → **422 con details**; ids/queries inválidos → 400 y **DELETE ausente → 404 en los 4 recursos** (ni el owner); respuestas sin `tenantId`/secretos en las 4 listas.
- Regresión: los **315 tests previos siguen verdes** (42 archivos).

## ERRORES

`npm run typecheck` → 0; `npm run lint` → 0 (tras correcciones listadas abajo); QA completo EXIT=0.

## CORRECCIONES

Durante el desarrollo de la fase (antes del QA final):

1. `accounting/infrastructure/schemas/types.ts` y `accounting/presentation/routes/accounting-routes.ts`: imports de tipos no usados (`FiscalPeriod`, `PublicFiscalPeriod`, `PublicJournalEntry` — los routers propios no usan genéricos de spec) → eliminados (lint ×3).
2. `accounting-rules.ts`: `roundMoney` importado AL FINAL del archivo (funciona por hoisting pero es mala práctica) + tipo local `JournalStatusKey` duplicado del de la entidad → import superior junto al type-import y uso de `JournalStatus` de la entidad.
3. `accounting-validators.ts`: la condición XOR del `superRefine` era una fórmula equivalente pero enrevesada de tres términos → expresión directa: `(debit ≥ 0.01 && credit === 0) || (credit ≥ 0.01 && debit === 0)`.
4. `account-service.ts`: tipo local redundante `CreateAccountInputNature` (copiado de un borrador) → `AccountNature` de la entidad.
5. Test propio (`accounting.test.ts`): el caso de código duplicado de impuestos enviaba `'vat16'` (normaliza a `VAT16`, distinto del `VAT-16` creado) → devolvía 201 en vez de 409 → corregido a `'vat-16'`; y el comentario del caso "unbalanced" que en realidad usaba el helper balanceado quedó aclarado (el desbalance real va por separado).

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): (a) `POST /:id/post` pre-chequea el período y después escribe `status+periodId` en un update → ventana **at-most-once** ante un cierre de período concurrente; (b) contador de serie `JE` separado del documento; (c) sin FK real en BD (`accountId`/`periodId` validados solo en la aplicación).
- **PARTIAL**: sin emisión automática de asientos desde documentos de venta/compra (hoy manuales; requiere event bus/outbox — ADR-007); el maestro `taxes` **no se aplica** a facturas (los documentos siguen con `taxRate` por línea de FASE 9/10).
- **NOT IMPLEMENTED** (diferido y documentado): `budgets`, `currencies`/`exchangeRates` (→ FASE 13), `accountingDocuments`, jerarquía de cuentas (`parentId`), multi-moneda por asiento (una moneda, default USD), re-apertura de períodos.
- **NOT TESTED**: `apps/web`, `apps/mobile`, Atlas real; dos `POST /:id/post` concurrentes sobre borradores distintos del mismo período (la ventana de cierre solo está razonada, no ejercitada en paralelo).
- **RISK**: plan contable plano sin índice de texto ni búsqueda `q`; paginación por offset; vulnerabilidades **moderadas dev preexistentes** de `vitest` (arriba); `2027-06-01`/fechas fuera de cobertura dependen de que exista el período (422 esperado — cubierto en tests).

## PRÓXIMA FASE

**FASE 13 — TREASURY**: cuentas de efectivo/banco (`bankAccounts`, `cashAccounts`, permisos `payment`/`receipt` del catálogo), pagos y cobros (`payments`, `receipts`) con enlace a documentos de venta/compra, movimientos de caja (`cashMovements`) y posiblemente `currencies`/`exchangeRates` diferidos de FASE 12 (requiere confirmar el alcance contra el catálogo de permisos antes de escribir); conciliaciones bancarias posteriores.
