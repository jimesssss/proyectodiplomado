# API — ACCOUNTING (`/api/v1/…`) — FASE 12

Estado: implementado. Módulo `apps/api/src/modules/accounting`; reglas de dominio e índices en `docs/database/accounting.md`.

## Recursos y endpoints

4 recursos bajo `/accounting/…` (convenciones §4). **17 endpoints**: plan contable e impuestos (CRUD **sin `DELETE`** — el catálogo no define `accounting.account:delete`/`accounting.tax:delete` → archivar vía `PATCH {archived}`), períodos fiscales (CRUD **sin `DELETE` ni `archived`**: se cierran, no se archivan) y asientos (sin `DELETE` ni `archived` + **`POST /:id/post`** con el permiso PROPIO `accounting.journal:post`).

| Recurso           | Rutas                                                                                        | Prefijo | Permisos                                              |
| ----------------- | -------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------- |
| cuentas           | `POST /accounting/accounts`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)            | —       | `accounting.account:create/read/update`               |
| asientos          | `POST /accounting/journal-entries`, `GET …`, `GET /:id`, `PATCH /:id` + **`POST /:id/post`** | `JE`    | `accounting.journal:create/read/update` + **`:post`** |
| períodos fiscales | `POST /accounting/periods`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)             | —       | `accounting.period:create/read/update`                |
| impuestos         | `POST /accounting/taxes`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)               | —       | `accounting.tax:create/read/update`                   |

- `POST` → `201`; `GET/PATCH/POST /:id/post` → `200`. Envelope, paginación (`page`, `limit` ≤100) y códigos: `docs/api/conventions.md`.
- Filtros: cuentas e impuestos `?archived=true|false`; períodos `?status=open|closed`; asientos `?status=draft|posted|cancelled`, `?accountId=` (extracto de cuenta), `?periodId=`.
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login.
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`, `number`, `status`/`archived` (en create), `debitTotal`/`creditTotal`/`periodId`, `normalBalance` u otro campo desconocido → `400`. Respuestas **sin** `tenantId`.

## Cuentas (`/accounting/accounts`)

- `code` único por tenant (`(tenantId, code)`), normalizado (mayúsculas, espacios → guiones), validado (2–32 chars) e **inmutable** (`PATCH code` → 400); duplicado mismo tenant → 409; otro tenant con el mismo `code` → 201 (ADR-002).
- `nature ∈ {asset, liability, equity, revenue, expense}` **inmutable**: no existe en el PATCH → 400. El **`normalBalance` se DERIVA** en el servidor (asset/expense → `debit`; liability/equity/revenue → `credit`): viaja en la respuesta pero **nunca** se acepta del cliente (create/PATCH → 400).
- Sin `DELETE`: `PATCH {archived:true}` con `accounting.account:update` (doble archivar → 409; restaurar → 200; doble restaurar → 409). La ruta `DELETE` no existe → `404` incluso para el owner.
- **Cuenta archivada no puede recibir líneas de asiento** → `409 Account is archived` (FK); inexistente/ajena → `404` uniforme.
- Plan contable **plano** (sin `parentId`/jerarquía — decisión documentada).

## Impuestos (`/accounting/taxes`)

- `code` único por tenant e **inmutable** (mismo patrón que cuentas); `rate` en porcentaje **0–100** (16 = 16%; fuera de rango → 400).
- Sin `DELETE`: `PATCH {archived}` (doble → 409). Los documentos de venta/compras siguen llevando su `taxRate` por línea (FASE 9/10): la vinculación automática de este maestro a facturas queda pendiente de eventos (ADR-007).

## Períodos fiscales (`/accounting/periods`)

- Forma: `{code, name?, startsAt, endsAt}` (fechas ISO; `endsAt > startsAt` → si no, **400**). `code` y fechas **inmutables** (`PATCH code/startsAt/endsAt` → 400); solo `{name?, status?}` es editable.
- **Sin solape** entre períodos del mismo tenant (el servidor chequea el rango → `409 Fiscal period overlaps an existing period`); ventanas contiguas (31-ene/01-feb) NO solapan.
- Máquina: **`open → closed`** (terminal; `PATCH {status:'closed'}` → 200; repetir → `409`; reabrir (`closed → open`) → `409`); mismo estado → `409 Status is already the requested one`.
- Sin `DELETE` (ruta ausente → 404): los períodos se cierran, no se archivan.

## Asientos (`/accounting/journal-entries`) — serie `JE-YYYY-000001`

- Forma: `{date?, currency?, lines: [{accountId, description?, debit, credit}] (2–200), reference?, notes?}`; `date` default ahora (el cliente puede backdatear); `currency` ISO-4217 de 3 letras (default `USD`, normalizada a mayúsculas — UNA moneda por asiento); numeración atómica `JE` por tenant+año.
- **Partida doble — invariante del servidor**: `sum(debits) === sum(credits)` con importes redondeados a 2 decimales. Se valida en **create**, en **PATCH de líneas** y **defensivamente al postear** → `422 DOMAIN_ERROR` con `details {debits, credits}` (nada se escribe).
- **XOR por línea**: exactamente UNA cara ≥ `0.01` y la otra exactamente `0` (una línea con ambas caras, ninguna o un negativo → `400`).
- Mínimo **2 líneas** (doble partida). FK por línea: cuenta inexistente/ajena → `404`; **cuenta archivada → `409 Account is archived`**.
- **Servidor SOLO**: `number`, `debitTotal`/`creditTotal` (suma calculada), `status` (`draft` en create) y `periodId` (`null` hasta postear) → cualquier intento de escribirlos desde el body → `400`.
- Máquina: **`draft → posted|cancelled`** (ambos terminales). Campos de negocio (`lines/currency/date/reference/notes`) **solo en `draft`** → después `409 Only draft documents can be edited`; `cancelled` vía `PATCH {status}` normal (con `accounting.journal:update`).

### Publicación (`POST /:id/post`) — permiso PROPIO

- El endpoint exige **`accounting.journal:post`**, SEPARADO de `accounting.journal:update` (patrón de `sales.quote:approve`/`stock.count:approve`): un editor de asientos puede crear/editar pero **no** postear → `403` con `details.permission: "accounting.journal:post"`.
- Un `PATCH {status:'posted'}` recibe **`409 Posting requires the post endpoint`** (mensaje accionable en vez de un 400 críptico).
- Al postear, el servidor: (1) exige `draft` (doble post / post de `cancelled` → `409 Only draft journal entries can be posted`); (2) re-verifica el balance (defensivo → 422); (3) **resuelve el período fiscal que CUBRE `date`** (`startsAt ≤ date ≤ endsAt`): **sin período → `422 No fiscal period covers the entry date`** (`details.date`); **período `closed` → `409 Fiscal period is closed`** (`details.period = "2026-01"`); (4) escribe `status: posted` + `periodId` en UN update (guardia de at-most-once — ver RISK).
- `posted` congela el asiento (edición de negocio → 409; `cancelled` sobre `posted` → 409). Los borradores siguen siendo editables aunque su período esté cerrado (la ventana solo se cierra al postear).

### Filtros del asiento

- `GET …?accountId=<id>` = **extracto de cuenta** (multikey sobre `lines.accountId`); `?periodId=` lista los asientos posteados de un período (cierre/reporte); `?status=` por máquina.

## Auditoría (FASE 7)

- **Cuentas**: `accounting.account.create`; `accounting.account.update` (con `reason: archived:true` al archivar vía PATCH); `accounting.account.restore` (con `reason: archived:false` al restaurar). Sin acción `.archive` (viene solo de la ruta DELETE, que no se publica).
- **Impuestos**: `accounting.tax.create`, `accounting.tax.update` (`reason: archived:true`), `accounting.tax.restore` (`reason: archived:false`).
- **Períodos**: `accounting.period.create`; `accounting.period.update` (con `reason: status:closed` al cerrar).
- **Asientos**: `accounting.journal.create` (`reason: debitTotal:<n>`); `accounting.journal.update` (`reason: status:cancelled` cuando cambia estado); **`accounting.journal.post`** (`reason: status:posted`).

## Errores

| Caso                                                                                                                                                    | HTTP | Código             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                                                                                  | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` / `pv` viejo                                                                                                                    | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (XOR de línea, fechas, enums, ids, campos extra, `rate`)                                                                    | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant (uniforme)                                                                                                              | 404  | `NOT_FOUND`        |
| `sum(debits) ≠ sum(credits)` (`details {debits, credits}`); sin período para la fecha                                                                   | 422  | `DOMAIN_ERROR`     |
| Código duplicado, solape de períodos, transición inválida/repetida, `PATCH status:posted`, período cerrado, cuenta archivada, edición fuera de borrador | 409  | `CONFLICT`         |
| `DELETE` de cuentas/asientos/períodos/impuestos (ruta no publicada)                                                                                     | 404  | `NOT_FOUND`        |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): el pre-chequeo del período y la escritura `posted`+`periodId` son DOS operaciones → dos publicaciones concurrentes contra un cierre simultáneo son una ventana **at-most-once**; contador de serie separado del documento.
- **PARTIAL**: sin emisión automática de asientos desde ventas/compras (ADR-007: requiere outbox); `taxes` no se aplica a facturas (las líneas siguen con su `taxRate` propio).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; dos `POST /:id/post` concurrentes sobre borradores distintos del mismo período.
- **RISK**: una moneda por asiento (sin `currencies`/`exchangeRates` — FASE 13); plan contable plano sin jerarquía; `budgets`/`accountingDocuments` diferidos; sin índice de texto ni búsqueda `q`.
