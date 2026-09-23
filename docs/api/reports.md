# API — REPORTS (`/api/v1/reports`) — FASE 15

Estado: implementado. Módulo `apps/api/src/modules/reporting`; índices y lecturas en `docs/database/reporting.md`. Read models CQRS: Reporting SOLO-agrega con `.aggregate()` sobre 10 colecciones físicas de otros módulos (0 escrituras propias del módulo).

## Recursos y endpoints

**Montaje único `/reports`** (convenciones §4, fila 15) — **11 endpoints GET** (sin POST/PATCH/DELETE → esas rutas ausentes → 404):

| Recurso / acción      | Ruta                               | Permisos (catálogo + subyacentes, ADR-008 §1)                 |
| --------------------- | ---------------------------------- | ------------------------------------------------------------- |
| catálogo estático     | `GET /reports`                     | `report:read`                                                 |
| ventas                | `GET /reports/sales`               | `report:read` + `sales.invoice:read` + `customer:read`        |
| compras               | `GET /reports/purchases`           | `report:read` + `supplier.invoice:read` + `supplier:read`     |
| flujo de caja         | `GET /reports/cashflow`            | `report:read` + `bank.account:read`                           |
| inventario (snapshot) | `GET /reports/inventory`           | `report:read` + `product:read` + `stock.movement:read`        |
| faltantes de stock    | `GET /reports/inventory/low-stock` | `report:read` + `product:read` + `stock.movement:read`        |
| CRM                   | `GET /reports/crm`                 | `report:read` + `lead:read` + `opportunity:read`              |
| export CSV inventario | `GET /reports/inventory/export`    | `report:export` + `product:read` + `stock.movement:read`      |
| export CSV ventas     | `GET /reports/sales/export`        | `report:export` + `sales.invoice:read` + `customer:read`      |
| export CSV compras    | `GET /reports/purchases/export`    | `report:export` + `supplier.invoice:read` + `supplier:read`   |
| export CSV dinámico   | `GET /reports/:key/export`         | `report:export` + subyacentes de `key` (enum `cashflow\|crm`) |

- **Permisos ENCADENADOS**: `report:read` (o `report:export`) MÁS los MISMOS permisos de la API base — un reporte jamás expone datos que la API filtraría con esos permisos. **Consultar ≠ exportar**: `report:read` no habilita `/export` y `report:export` no habilita la lectura. El catálogo de permisos NO cambia (sin bump de `pv`).
- El catálogo es **la fuente de verdad**: `/reports` devuelve `{reports: [{key, name, params}]}` (5 claves) — descubrimiento estático, SIN datos.
- `/:key/export` acepta SOLO `cashflow` y `crm` (las demás tienen ruta explícita); clave desconocida → `400` (enum de params) y clave de lectura desconocida (`GET /reports/unknown`) → `404`.
- Todo GET → `200`. Envelope, códigos y paginación: `docs/api/conventions.md`. El catálogo NO define `report:create/update/delete` → rutas de escritura ausentes → `404`.

## Query (strictObject POR CLAVE)

Un parámetro desconocido para ese reporte se RECHAZA con `400 VALIDATION_ERROR` (`Invalid request query`): incluye `?tenantId=` (el tenant viene SOLO del JWT), `from/to` sobre el snapshot de inventario, `groupBy` en CRM y `status` en cashflow.

| Reporte     | Params                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| `sales`     | `from?`, `to?` (`YYYY-MM-DD`), `groupBy?` (`day\|month`, default `month`), `status?` (`issued\|paid`) |
| `purchases` | idénticos a `sales`                                                                                   |
| `cashflow`  | `from?`, `to?`, `groupBy?` (SIN `status`)                                                             |
| `inventory` | ninguno (snapshot actual; `z.strictObject({})`)                                                       |
| `crm`       | `from?`, `to?` (SIN `groupBy` ni `status`)                                                            |
| low-stock   | `page?` (≥1, default 1), `limit?` (1–100, default 20) → lista paginada con `meta`                     |
| exports     | `from?`, `to?`, `status?` (ventas/compras), `format?` (solo `csv`), `limit?` (1–5000, default 5000)   |

- **Defaults por request**: `to` = hoy (UTC), `from` = `to` − 365 días — nunca congelados en el esquema.
- **Roundtrip de calendario**: `2026-02-31` es inválido (rueda a marzo → `Invalid calendar date`).
- **Límites de escaneo**: `groupBy=day` → máximo 366 días (`day grouping allows at most 366 days`); `groupBy=month` o sin agrupación → máximo 120 meses (`range allows at most 120 months`); `from` después de `to` → `from must not be after to`.

## Formas de respuesta (multi-moneda SIN FX)

Cada agregado agrupa `period + currency` — **jamás se suman USD+EUR** (decisión documentada; `totals` es un array por moneda ordenado asc). `draft` y `cancelled` NUNCA entran en ventas/compras (solo `issued`/`paid` cuando se filtra) y `archived` (soft-delete) se excluye siempre.

- **ventas/compras**: `{report, from, to, groupBy, series[{period, currency, count, subtotal, tax, total}], totals[{currency, count, subtotal, tax, total}], topCustomers|topSuppliers[{id, name, code, currency, total, count}]}` — top-5 POR moneda (`REPORT_TOP_N = 5`).
- **cashflow**: `{report, from, to, groupBy, series[{period, currency, inflow, outflow, net, count}], totals[{currency, inflow, outflow, net, count}]}` — sobre `cashMovements` (ledger append-only de FASE 13) con moneda vía `$lookup` a `treasuryAccounts`.
- **inventory**: `{report, products, valued, unpriced, stockValue, lowStock}` — `stockValue = Σ qty × cost` de productos no archivados; los productos sin `cost` cuentan en `unpriced` y NO se valorizan.
- **low-stock**: lista paginada `[{productId, code, name, unit, minStock, qty, deficit}]` con `meta {page, limit, total}` (`deficit = minStock − qty`).
- **crm**: `{report, from, to, leads{total, byStatus[{status, count}], leadRate}, opportunities{total, byStage[{stage, count}], byCurrency[{currency, amount, count}], winRate}}` — `leadRate = converted/total`, `winRate = won/(won + lost)`, ambos a 4 decimales (0 si denominador 0). Los literales `converted`/`won`/`lost` los define el módulo CRM (RISK: drift si CRM los renombra).

## Exportaciones CSV

- **Síncronas dentro del envelope** (sin cola de trabajos): `{report, format: 'csv', rowCount, truncated, warning, csv}` (el texto con líneas CRLF).
- **`limit` con honestidad de truncado**: se piden `limit + 1` filas; si hay más, `truncated: true` y `warning: "Export truncated at <limit> rows (max 5000)"`.
- **Headers fijos por reporte**: ventas `number,customer,customerId,issueDate,status,currency,subtotal,tax,total`; compras idéntico con `supplier,supplierId`; cashflow `createdAt,accountId,currency,sourceType,amount,balanceAfter,reason`; inventario `code,name,unit,minStock,qty,cost,value`; CRM `name,stage,currency,amount,expectedCloseDate,createdAt`.
- **Guarda anti formula-injection (OWASP)**: cualquier celda que empieza por `=`, `+`, `-`, `@`, tab o CR lleva apóstrofo `'` delante (CSV injection neutralizado en tests de seguridad).
- Números CRUDOS (sin formato localizado); celdas no finitas → vacías.
- **Auditoría obligatoria**: cada export emite `action: report.export`, `entityType: report`, `entityId: <key>`, `newValue {format, rowCount, truncated}` (auditable vía `GET /audit?action=report.export`).

## Aislamiento multi-tenant

- `tenantId` SIEMPRE del JWT (`currentUser(req).tenantId`), nunca de la query — `?tenantId=` → `400`.
- Todo pipeline de agregación arranca con `tenantId` como primer `$match`; los `$lookup` fijan `tenantId` literal en SU sub-pipeline (también sale del JWT).
- Ninguna respuesta incluye `tenantId` en el envelope (test de seguridad).

## NOT TESTED / RISK / PARTIAL

- **PARTIAL**: agregación EN VIVO sobre las colecciones de los módulos dueños (sin read models materializados ni refresh job): correcto para volúmenes actuales, costoso a escala (RISK con volumen alto — Atlas real NOT TESTED).
- **PARTIAL**: export síncrono hasta 5000 filas (sin cola de trabajos ni export Excel/PDF; `format` solo `csv`).
- **RISK**: SIN tipo de cambio (FX) — `stockValue` y los `byCurrency` de CRM se reportan SIN moneda (el inventario mezclaría costes en divisas distintas si existieran).
- **RISK**: rates de CRM con literales `converted`/`won`/`lost` — si el módulo CRM los renombra, estas tasas deben seguirlo (sin contrato de tipo compartido).
- **NOT TESTED**: rotación de inventario (DSO/DSI) y series por moneda de ejemplo con >1 año de datos; Atlas real (índices creados en memory server igual que en dev).
