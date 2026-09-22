# API — PURCHASING (`/api/v1/…`) — FASE 10

Estado: implementado. Módulo `apps/api/src/modules/purchasing`; reglas de dominio e índices en `docs/database/purchasing.md`.

## Recursos y endpoints

6 recursos: el maestro de proveedores + 5 documentos de compra con la MISMA forma que los de venta (líneas + importes calculados) y series de numeración propias. `DELETE` = **soft-delete** (`archived: true`), salvo receipts (ver abajo).

| Recurso           | Rutas                                                                                                      | Prefijo | Permisos                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------ |
| proveedores       | `POST /suppliers`, `GET /suppliers`, `GET /suppliers/:id`, `PATCH /suppliers/:id`, `DELETE /suppliers/:id` | —       | `supplier:create/read/update/delete` |
| solicitud         | `POST /purchasing/requests`, `GET …`, `GET /:id`, `PATCH /:id`, `DELETE /:id`                              | `RQ`    | `purchase.request:*`                 |
| orden             | `POST /purchasing/orders`, … (bajo `/purchasing/orders`)                                                   | `PO`    | `purchase.order:*`                   |
| recepción         | `POST /purchasing/receipts`, `GET …`, `GET /:id`, `PATCH /:id` (**sin `DELETE`**)                          | `GR`    | `goods.receipt:read/create/update`   |
| factura proveedor | `POST /purchasing/invoices`, … (bajo `/purchasing/invoices`)                                               | `PI`    | `supplier.invoice:*`                 |
| devolución        | `POST /purchasing/returns`, … (bajo `/purchasing/returns`)                                                 | `RET`   | `purchase.return:*`                  |

- `POST` → `201`; `GET/PATCH/DELETE` → `200`. Envelope, paginación (`page`, `limit` ≤100, `archived=true|false`) y códigos: `docs/api/conventions.md`.
- Filtros de listado: `?status=` (por tipo), `?supplierId=` (documentos y útil en general), y por FK: `?requestId=` (órdenes), `?orderId=` (recepciones/facturas/devoluciones), `?invoiceId=` (devoluciones).
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login.
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`, `number`, `status`, `kind`, `total`, `archived` (en create) u otro campo desconocido → `400`. Respuestas **sin** `tenantId`.
- **Decisión**: el maestro de proveedores vive en `/suppliers` (raíz, simetría con `/customers`); los documentos, agrupados bajo `/purchasing/…` (convenciones §4).

## Proveedores (`/suppliers`)

- `code` único por tenant (`(tenantId, code)`), normalizado (mayúsculas, espacios → guiones) e **inmutable** (`PATCH code` → 400); duplicado mismo tenant → 409; `code` en otro tenant → 201 (ADR-002).
- `email` a minúsculas (validado), `taxId`/`country` a mayúsculas, `address` estricta (ISO-3166 alpha-2); campos opcionales se limpian con `null`.
- Estados de registro: `PATCH { archived }` validado (doble archivar → 409); `DELETE` = archivar (doble → 409); PATCH vacío → 400.

## Documento: forma común y numeración

- **Mismas reglas de FASE 9**: líneas `{ description, quantity>0, unitPrice≥0, taxRate 0-100 (default 0), discountPct 0-100 (default 0) }` (1–200); el servidor calcula por línea `subtotal/tax/total` y los totales (descuento **antes** del impuesto, redondeo comercial a 2 decimales; compartir `core/domain/line-totals` con Sales). Campos calculados en el body → 400.
- **`number`**: serie `PREFIX-YYYY-000001` por **tenant + tipo + año UTC** (`RQ/PO/GR/PI/RET`), atómica (`core/numbering`, `$inc`), inmutable; enviado en create → 400.
- `currency` ISO-4217 (default `USD`), `issueDate` (default: ahora), `notes` opcional. Todo nace en **`draft`**.
- `kind` aísla los documentos: `GET /purchasing/orders/:id` con un id de solicitud → 404.

## Estados (máquinas validadas)

| Tipo               | Transiciones                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| solicitud (`RQ`)   | `draft → submitted → approved\|rejected`, `draft/submitted → cancelled` |
| orden (`PO`)       | `draft → confirmed → completed`, `draft/confirmed → cancelled`          |
| recepción (`GR`)   | `draft → received → posted`, `draft/received → cancelled`               |
| factura (`PI`)     | `draft → issued → paid`, `draft/issued → cancelled`                     |
| devolución (`RET`) | `draft → received → refunded`, `draft/received → cancelled`             |

- Salto inválido o repetir estado → `409` (`Invalid status transition` / `Status is already the requested one`).
- **Aprobación de solicitud**: vía `PATCH {status:'approved'}` con `purchase.request:update` — el catálogo NO define permiso `:approve` para compras (decisión documentada; a diferencia de Sales donde `sales.quote:approve` es explícito).
- **Edición**: más allá de `draft` solo `status`/`archived`; cualquier otro campo → `409 Only draft documents can be edited`. PATCH sin campos → `400`.
- `posted` en recepciones marca el documento listo para el ledger de stock (**FASE 11** lo consumirá).

## Reglas por tipo

- **Solicitud**: `supplierId` obligatorio (proveedor del tenant → 404 si no existe/ajeno); sin referencias.
- **Orden**: `supplierId` + `requestId` opcional (FK purchases → 404).
- **Recepción**: `orderId` **obligatorio** (400 si falta); el servidor **deriva `supplierId` de la orden** — el body no admite `supplierId` (→ 400). **Sin ruta `DELETE`** (el catálogo no tiene `goods.receipt:delete`): se archiva con `PATCH {archived:true}` (`goods.receipt:update`); peticiones `DELETE` → 404 (ruta ausente).
- **Factura de proveedor**: `supplierId` + `orderId` opcional.
- **Devolución**: `supplierId` + `orderId`/`invoiceId` opcionales (FK purchases → 404).
- FKs cruzadas (proveedor/orden/factura de OTRO tenant) → **404 uniforme**.

## Auditoría (FASE 7)

`supplier.create/.update/.archive/.restore` y `purchase.request|purchase.order|goods.receipt|supplier.invoice|purchase.return` `.create/.update/.archive/.restore`, con `reason` (`status:…`, `archived:…`) en `metadata.reason`.

## Errores

| Caso                                                                                       | HTTP | Código             |
| ------------------------------------------------------------------------------------------ | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                     | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` / `pv` viejo                                                       | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (líneas, importes, ids, enums, campos extra)                   | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant (uniforme), `GET` por tipo ajeno                           | 404  | `NOT_FOUND`        |
| Transición inválida/repetida, edición fuera de borrador, doble archivado, código duplicado | 409  | `CONFLICT`         |
| `DELETE /purchasing/receipts/:id` (ruta no publicada)                                      | 404  | `NOT_FOUND`        |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): documento y contador en operaciones separadas (el contador es atómico vía `$inc`); sin `Idempotency-Key` (convenciones §6).
- **PARTIAL**: recepciones `posted` NO mueven stock todavía (FASE 11 los consumirá — NOT TESTED hasta entonces); sin conversión automática solicitud→orden (hoy manual con `requestId`).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; cargas concurrentes sobre `counters`.
- **RISK**: sin cascadas (archivar proveedor no afecta documentos enlazados); paginación por offset (cursor pendiente); sin `/search` de proveedores.
