# Reporte de fase — FASE 15: REPORTING

## ESTADO

**COMPLETADA** (QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `reporting` montado bajo `/api/v1/reports` (convenciones §4 fila 15, **11 endpoints GET**) como lector **CQRS solo-agregación** (ADR-008 §4):

- **Catálogo** `GET /reports` (`report:read`): descubrimiento estático `{reports: [{key, name, params}]}` con las 5 claves (`sales`, `purchases`, `cashflow`, `inventory`, `crm`) — SIN datos.
- **Permisos ENCADENADOS** (ADR-008 §1): cada reporte exige `report:read` (o `report:export` en los exports) MÁS los MISMOS permisos subyacentes de su API base (`sales`→`sales.invoice:read`+`customer:read`; `purchases`→`supplier.invoice:read`+`supplier:read`; `cashflow`→`bank.account:read`; `inventory`→`product:read`+`stock.movement:read`; `crm`→`lead:read`+`opportunity:read`). **Consultar ≠ exportar** en ambos sentidos; el catálogo de permisos NO cambia (sin bump de `pv`).
- **Reportes multi-moneda SIN FX**: `sales`/`purchases` (serie por `period+currency`, `totals` por moneda ordenados asc, top-5 POR moneda), `cashflow` (inflow/outflow/net sobre `cashMovements` con moneda vía `$lookup`), `inventory` (snapshot: `products/valued/unpriced/stockValue/lowStock` + low-stock paginado con `deficit`), `crm` (`leadRate = converted/total`, `winRate = won/(won+lost)` a 4 decimales). `draft`/`cancelled` jamás entran; `archived` se excluye siempre.
- **Rangos de fecha**: `YYYY-MM-DD` con roundtrip de calendario (`2026-02-31` → 400), defaults POR REQUEST (`to`=hoy, `from`=to−365d), límites de escaneo 366 días con `day` / 120 meses con `month`, `from ≤ to`.
- **Query strictObject POR CLAVE**: parámetro desconocido para ese reporte → 400 (incluye `?tenantId=`, `groupBy` en CRM, `status` en cashflow, `from/to` sobre inventario); clave de lectura desconocida → 404; `/:key/export` acepta solo `cashflow|crm` (clave desconocida → 400).
- **Exports CSV síncronos** (5, `report:export` + subyacentes): dentro del envelope con `rowCount`, `truncated` (fetch `limit+1` → `warning: "Export truncated at N rows (max 5000)"`), headers fijos por reporte, números CRUDOS y **guarda anti formula-injection (OWASP)**; cada export emite auditoría `report.export` con `{format, rowCount, truncated}`.
- **Read models `Reporting*`** sobre las 10 colecciones físicas de otros módulos (0 escrituras del módulo); nombres de modelo PROPIOS para no corromper el `getModel` del dueño; 2 índices `{tenantId, kind, issueDate:-1}` declarados sobre `salesDocuments`/`purchaseDocuments` sin tocar sus `collections.ts`.
- **Montado en `apps/api/src/index.ts`** tras workflow.

## ARCHIVOS

- `apps/api/src/modules/reporting/` (10 archivos): `domain/entities/report.ts`, `domain/rules/report-rules.ts` (+ test), `application/report-service.ts`, `application/export-service.ts`, `infrastructure/schemas/read-models.ts`, `infrastructure/repositories/report-repository.ts`, `presentation/validators/report-validators.ts`, `presentation/routes/report-routes.ts`, `index.ts`.
- `apps/api/src/index.ts` (+ montaje de `createReportingRouters`).
- Tests: `tests/integration/reports.test.ts` (nuevo), `tests/security/reports-security.test.ts` (nuevo), `apps/api/src/modules/reporting/domain/rules/report-rules.test.ts` (nuevo).
- Docs: `docs/api/reports.md`, `docs/database/reporting.md` (nuevos), `docs/database/sales.md` / `docs/database/purchasing.md` (fila `issueDate`), `docs/security/permission-matrix.md` (+8 rutas), `docs/api/conventions.md` (fila 15 desglosada), este reporte.

## APIs

11 endpoints GET nuevos (detallados en `docs/api/reports.md`):

- `GET /reports` (catálogo) (1).
- `GET /reports/{sales,purchases,cashflow,inventory,crm}` (5).
- `GET /reports/inventory/low-stock` (1).
- `GET /reports/{inventory,sales,purchases}/export` (3).
- `GET /reports/:key/export` dinámico (`cashflow|crm`) (1).

Sin POST/PATCH/DELETE (rutas ausentes → 404) y sin cambios en endpoints de otros módulos.

## COLECCIONES

**0 colecciones nuevas.** Reporting lee 10 colecciones físicas de otros módulos (`salesDocuments`, `purchaseDocuments`, `customers`, `suppliers`, `products`, `stock`, `cashMovements`, `treasuryAccounts`, `leads`, `opportunities`) vía 10 read models `Reporting*` — la fila de plataforma `reporting` de `database.md` es el MÓDULO solo-lectura, no una colección. Escrituras del módulo: 0 (solo auditoría `report.export` en `auditEntries`, dueño FASE 7). 0 eventos, 0 cache.

## ÍNDICES

2 índices nuevos declarados por Reporting (con query justificada en `docs/database/reporting.md`): `{tenantId, kind, issueDate:-1}` sobre `salesDocuments` y sobre `purchaseDocuments` (rango `issueDate` de los reportes/exports; los dueños ya tenían sus índices de `createdAt`). El resto de agregaciones usan los índices de los dueños (FASE 8–13).

## TESTS

- **QA real**: `npm run qa` (typecheck + lint + format:check + vitest + build) → **EXIT=0**; vitest **439 tests PASSED (55 archivos)**, typecheck 0, lint 0, prettier OK, build OK.
- **`npm audit` (ejecutado aparte — el script `qa` NO lo incluye)**: producción `npm audit --omit=dev` → **0 vulnerabilidades (EXIT=0)**; **`npm audit` completo → 2 vulnerabilidades MODERADAS preexistentes** en la cadena dev `vitest`/`@vitest/mocker` (fix = breaking `vitest@5`; FASE 15 NO modifica `package.json`/lockfile, verificado en `git diff`).
- Nuevos de FASE 15 (38):
  - **unit** `report-rules.test.ts` (13): `isValidReportDate` roundtrip (`2026-02-31` inválido), `resolveDateRange` con `now` fijo (defaults `to`=hoy, `from`=to−365d), `checkDateRange` caps 366/367 días y 120/121 meses con mensajes exactos, `utcRange` rollo mes/año (extremo superior exclusivo), `periodFormat`, `roundRate` (1/3→0.3333), `csvText` anti-inyección (`=`, `+`, `-`, `@`, comillas RFC) y `buildCsv` (CRLF, números CRUDOS, no-finito→vacío).
  - **integration** `reports.test.ts` (15): catálogo (5 claves con `params`, sin datos ni `tenantId`); ventas por defecto (totales multi-moneda EUR `{2,300,30,330}` / USD `{1,50,0,50}` y top-5 POR moneda); serie diaria exacta con `from/to` (excluye draft/cancelled/archived); `?status=issued` excluye pagadas; cubetas mensuales Σ = totales; compras con `topSuppliers` (draft fuera); cashflow `inflow 1500 / outflow 300 / net 1200 / count 3` con moneda vía `$lookup`; inventario `stockValue` exacta (archivado fuera) + low-stock paginado (`REP-2`, `deficit 97`, página 2 vacía); CRM `leadRate`/`winRate` 0.5 con desgloses ordenados; 12 queries inválidas → 400 + `/reports/unknown` → 404 + mensajes de límites vía JSON.stringify; exports (`rowCount`, `limit=1` → `truncated`, inventario `evil` fuera del rango); auditoría ≥7 `report.export`; **aislamiento cruzado B)** (B ve SOLO lo suyo; A no ve a B en 6 reportes + export).
  - **security** `reports-security.test.ts` (10): 401 en las 8 rutas + token corrupto; 403 con `details.permission` (`report:read` ×7, `report:export` en export) para roles vacíos; **cadena subyacente** (`report:read` solo → primer subyacente exacto por ruta: `sales.invoice:read`, `supplier.invoice:read`, `bank.account:read`, `product:read` ×2, `lead:read`); segundo eslabón (`partial-chain` → `customer:read`); separación consultar→exportar (`report-sales` → lectura 200 + export 403) y exportar→leer (`export-only` → `/reports` y `/sales` 403 `report:read` + `/sales/export` 200); `pv` obsoleta → 403 `'Permissions catalog outdated. Sign in again.'` (report + export) con `/auth/me` 200; query estricta por clave (10 rutas → 400, lectura desconocida → 404); **CSV injection neutralizado** (nombre `=HYPERLINK(...)` → celda `'=HYPERLINK` y ninguna línea inicia con `=+-@`); sin `tenantId` en 3 respuestas.
- Regresión: los **401 tests previos siguen verdes** (52 archivos).

## ERRORES

`npm run typecheck` → 0; `npm run lint` → 0 (tras corrección listada abajo); `format:check` → 0 (prettier aplicado); QA completo EXIT=0 en el segundo intento (el primero falló en lint — ver CORRECCIONES).

## CORRECCIONES

Durante el desarrollo de la fase (antes del QA final):

1. **2 bugs reales de agregación capturados por los tests de integración**:
   - `partyLookup(..., 'id', ...)` en `aggregateTopCustomers`/`aggregateTopSuppliers`: tras `$group` el id vive en `_id.id`, no top-level → el `$lookup` nunca matcheaba y `$unwind` vaciaba los tops (`topCustomers: []`). Corregido a refField `'_id.id'`.
   - `byCurrency` de `getCrmReport` mapeaba las filas `stage+currency` SIN plegar por moneda (USD aparecía dos veces en vez de una sola fila por divisa). Corregido con fold por moneda antes de `roundMoney`/orden.
2. **`InventoryFacet` sin uso** en `report-repository.ts` (la agregación real usa `InventorySummaryAgg`) → eliminado (lint 1 error → 0).
3. **Test de integración propio con fixtures mal creadas**: la factura del tenant B se creaba con `tokenA` (customer ajeno → 404 FK en `beforeAll`) → `createDocument` ahora acepta token explícito; y la expectación `byStage` decía `proposal: 2` (sumaría 4 con `total: 3`) → corregida a 1 (won/lost/proposal = 1 c/u según las fixtures). **No eran bugs del código** en estos 2 últimos casos.
4. **Prettier**: 8 archivos nuevos/editados (módulo, tests, docs) reformateados con `npm run format` antes del QA final.

## RIESGOS

- **PARTIAL**: agregación EN VIVO sobre las colecciones de los módulos dueños (sin read models materializados ni job de refresh): correcto a volumen actual, RISK de latencia con millones de documentos (Atlas real NOT TESTED).
- **PARTIAL**: exports SÍNCRONOS dentro del envelope hasta 5000 filas (sin cola de trabajos `jobs`, sin export Excel/PDF — `format` solo `csv`).
- **RISK**: SIN tipo de cambio (FX): `stockValue` y `byCurrency` se reportan sin moneda de referencia (mezclaría costes en divisas distintas si existieran).
- **RISK**: rates de CRM con literales `converted`/`won`/`lost` del módulo CRM (sin contrato de tipo compartido — drift si CRM los renombra).
- **PARTIAL** heredado (sigue vigente): sin transacciones Mongo; sin `Idempotency-Key`; outbox/jobs de ADR-007 no implementados; paginación offset; `trigger.event` diferido; `apps/web`/`apps/mobile`/Atlas real NOT TESTED; vulnerabilidades moderadas dev preexistentes de `vitest` (arriba).
- **NOT TESTED**: rotación de inventario (DSO/DSI); volumen alto de agregaciones; `explain()` de los pipelines sobre Atlas; top-N > 5 (fijo en `REPORT_TOP_N = 5`).

## PRÓXIMA FASE

**FASE 16 MANUFACTURING** — módulo `manufacturing` (órdenes de producción BOM/costes, detracción de inventario, stages de producción) bajo `/api/v1/manufacturing`, con su reporte de fase y QA gate (`npm run qa` EXIT=0) antes del commit.
