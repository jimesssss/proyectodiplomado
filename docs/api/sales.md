# API — SALES (`/api/v1/sales/…`) — FASE 9

Estado: implementado. Módulo `apps/api/src/modules/sales`; reglas de dominio e índices en `docs/database/sales.md`.

## Recursos y endpoints

5 documentos comerciales con la MISMA forma (líneas + importes calculados) y distintas series de numeración. `DELETE` = **soft-delete** (`archived: true`), nunca borra filas.

| Documento   | Rutas                                                                                                                     | Prefijo | Permisos (`sales.<tipo>:*`)                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------- |
| cotización  | `POST /sales/quotes`, `GET /sales/quotes`, `GET /sales/quotes/:id`, `PATCH /sales/quotes/:id`, `DELETE /sales/quotes/:id` | `QT`    | `sales.quote:create/read/update/delete`           |
| pedido      | `POST /sales/orders`, `GET …`, `GET /:id`, `PATCH /:id`, `DELETE /:id` (mismo patrón bajo `/sales/orders`)                | `SO`    | `sales.order:*`                                   |
| envío       | `POST /sales/deliveries`, … (bajo `/sales/deliveries`)                                                                    | `DL`    | `sales.delivery:*`                                |
| factura     | `POST /sales/invoices`, … (bajo `/sales/invoices`)                                                                        | `IV`    | `sales.invoice:*`                                 |
| devolución  | `POST /sales/returns`, … (bajo `/sales/returns`)                                                                          | `RT`    | `sales.return:*`                                  |
| **aprobar** | `POST /sales/quotes/:id/approve`                                                                                          | —       | **`sales.quote:approve`** (separado de `:update`) |

- `POST` → `201`; `GET/PATCH/DELETE` → `200`. Envelope, paginación (`page`, `limit` ≤100, `archived=true|false`) y códigos: `docs/api/conventions.md`.
- Filtros de listado: `?status=` (por tipo), `?customerId=`, y por FK según el tipo: `?orderId=` (envíos/facturas/devoluciones), `?quoteId=` (pedidos), `?invoiceId=` (devoluciones), `?opportunityId=` (cotizaciones).
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login.
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`, `number`, `status`, `archived`, `approvedBy`, `total` u otro campo desconocido en create → `400`. Respuestas **sin** `tenantId`.

## Documento: forma común y numeración

- **Líneas**: `{ description, quantity>0, unitPrice≥0, taxRate 0-100 (default 0), discountPct 0-100 (default 0) }`; 1–200 líneas. El servidor calcula por línea `subtotal/tax/total` y los totales del documento — el cliente NO los envía (mandar `subtotal`/`total` → 400).
- **Cálculo**: descuento **antes** del impuesto: `subtotal = qty × unitPrice × (1 − discount%)`, `tax = subtotal × taxRate%`, `total = subtotal + tax`. Redondeo comercial a 2 decimales por línea; los totales suman las líneas YA redondeadas (test unitario `sales-rules.test.ts`).
- **`number`**: asignado por el servidor con numeración atómica (`core/numbering`, colección `counters`) — serie `PREFIX-YYYY-000001` por **tenant + tipo + año UTC** (`QT/SO/DL/IV/RT`), inmutable; enviado en create → 400.
- `currency` ISO-4217 (default `USD`, normalizado a mayúsculas; formato inválido → 400), `issueDate` (default: ahora del servidor), `notes` opcional. Todo nace en **`draft`**.
- `kind` aísla los documentos: `GET /sales/orders/:id` con un id de cotización → 404.

## Estados (máquinas validadas)

| Tipo       | Transiciones                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| cotización | `draft → sent → approved\|rejected`, `draft/sent → cancelled`; `approved` SOLO vía `POST /:id/approve` |
| pedido     | `draft → confirmed → fulfilled`, `draft/confirmed → cancelled`                                         |
| envío      | `draft → shipped → received`, `draft/shipped → cancelled`                                              |
| factura    | `draft → issued → paid`, `draft/issued → cancelled`                                                    |
| devolución | `draft → received → refunded`, `draft/received → cancelled`                                            |

- Salto inválido o repetir estado → `409 CONFLICT` (`Invalid status transition` / `Status is already the requested one`).
- **Aprobación**: `POST /sales/quotes/:id/approve` exige `sales.quote:approve` y estado `sent` (otros → 409); registra `approvedBy` (usuario del JWT), `approvedAt` y auditoría `sales.quote.approve`. Un `PATCH {status:'approved'}` → 400 (el enum de PATCH no lo incluye).
- **Edición**: más allá de `draft` solo se permite cambiar `status`/`archived`; cualquier otro campo → `409 Only draft documents can be edited`. PATCH sin campos → `400`.

## Reglas por tipo

- **Cotización**: `customerId` obligatorio (cliente del tenant → 404 si no existe/ajeno); `opportunityId` opcional (FK CRM → 404); `validUntil` exclusive de cotizaciones y debe ser posterior a `issueDate` (400).
- **Pedido**: `customerId` + `quoteId` opcional (FK sales → 404).
- **Envío**: `orderId` **obligatorio** (400 si falta); el servidor **deriva `customerId` del pedido** — el body de create/patch no admite `customerId` (→ 400).
- **Factura**: `customerId` + `orderId` opcional.
- **Devolución**: `customerId` + `orderId`/`invoiceId` opcionales (FK sales → 404).
- FKs cruzadas (cliente/pedido/oportunidad de OTRO tenant) → **404 uniforme** (no revela existencia).

## Auditoría (FASE 7)

Toda mutación deja traza: `sales.<tipo>.create/.update/.archive/.restore` con `entityType = sales.<tipo>`; el `reason` (`status:…`, `archived:…`) va en `metadata.reason`. La aprobación usa `sales.quote.approve`.

## Errores

| Caso                                                                                        | HTTP | Código             |
| ------------------------------------------------------------------------------------------- | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                      | 401  | `UNAUTHENTICATED`  |
| Sin `sales.<tipo>:permiso` / sin `sales.quote:approve` / `pv` viejo                         | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (líneas, importes, ids, enums, campos extra)                    | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant (uniforme), `GET` por tipo ajeno                            | 404  | `NOT_FOUND`        |
| Transición inválida/repetida, edición fuera de borrador, doble archivado, aprobar no-`sent` | 409  | `CONFLICT`         |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): crear documento y contador no es atómico entre sí (el contador sí lo es vía `$inc`); sin `Idempotency-Key` en create (convenciones §6, evaluar en FASE 10+).
- **PARTIAL**: sin índice de texto en `salesDocuments` (sin `/search` de ventas; la búsqueda global sigue siendo CRM).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; conversión automática cotización→pedido/factura (hoy es manual con `quoteId`/`orderId`).
- **RISK**: sin cascadas (archivar cotización no afecta pedidos enlazados); paginación por offset (cursor pendiente, convenciones §5).
