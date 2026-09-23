# API — Convenciones (/api/v1)

Estado: Aceptado (FASE 1). Documentación endpoint-a-endpoint en `docs/api/` desde FASE 2.

## 1. Prefijo y versionado

- Todas las rutas bajo `/api/v1`. Cambios incompatibles ⇒ `/v2` (nunca romper clientes silenciosamente).
- Recursos en plural, kebab-case: `/api/v1/sales/orders`, `/api/v1/purchasing/orders`.

## 2. Envelope (obligatorio en todas las respuestas)

Éxito:

```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "…", "timestamp": "…" },
  "error": null
}
```

Error:

```json
{
  "success": false,
  "data": null,
  "meta": { "requestId": "…" },
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} }
}
```

Tipos compartidos ya existentes: `packages/shared-types` (`ApiResponse<T>`).

## 3. Códigos de error

| HTTP    | `error.code`          | Cuándo                                                            |
| ------- | --------------------- | ----------------------------------------------------------------- |
| 400     | `VALIDATION_ERROR`    | body/params/query inválidos (detalles por campo)                  |
| 401     | `UNAUTHENTICATED`     | sin/ inválido/ expirado token                                     |
| 401     | `INVALID_CREDENTIALS` | login fallido                                                     |
| 403     | `FORBIDDEN`           | sin permiso                                                       |
| 403/404 | `NOT_FOUND`           | recurso inexistente **o de otro tenant** (sin revelar existencia) |
| 409     | `CONFLICT`            | duplicado/estado inválido                                         |
| 422     | `DOMAIN_ERROR`        | regla de negocio violada                                          |
| 429     | `RATE_LIMITED`        | límite de tasa                                                    |
| 500     | `INTERNAL_ERROR`      | fallo inesperado (detalle solo en log, `requestId` en meta)       |

## 4. Endpoints previstos por fase

| Fase | Rutas                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2    | `/health`, `/health/ready`                                                                                                                                                                                                                                                                 |
| 3    | `/auth` (login, logout, refresh, change-password, forgot/reset)                                                                                                                                                                                                                            |
| 4    | `/tenants` (admin)                                                                                                                                                                                                                                                                         |
| 5    | `/organizations`, `/companies`, `/branches`, `/departments`, `/warehouses`, `/cost-centers`                                                                                                                                                                                                |
| 6    | `/users`, `/roles`, `/permissions` (RBAC; `forgot/reset` sigue pendiente con workers/email)                                                                                                                                                                                                |
| 7    | `/audit` (lectura con `audit:read`)                                                                                                                                                                                                                                                        |
| 8    | `/customers`, `/contacts`, `/leads`, `/opportunities`, `/activities`                                                                                                                                                                                                                       |
| 9    | `/sales/quotes` (+ `POST /:id/approve` con `sales.quote:approve`), `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/returns`                                                                                                                                               |
| 10   | `/suppliers`, `/purchasing/requests`, `/purchasing/orders`, `/purchasing/receipts` (sin DELETE), `/purchasing/invoices`, `/purchasing/returns`                                                                                                                                             |
| 11   | `/inventory/products`, `/inventory/stock` (lectura), `/inventory/movements` (append-only: sin PATCH/DELETE), `/inventory/transfers` (sin DELETE), `/inventory/counts` (sin DELETE) (+ `POST /:id/approve` con `stock.count:approve`)                                                       |
| 12   | `/accounting/accounts` (sin DELETE), `/accounting/journal-entries` (sin DELETE + `POST /:id/post` con `accounting.journal:post`), `/accounting/periods` (sin DELETE), `/accounting/taxes` (sin DELETE)                                                                                     |
| 13   | `/treasury/accounts` (sin DELETE + `GET /:id/movements`), `/treasury/payments` (sin DELETE), `/treasury/receipts` (sin DELETE), `/treasury/bank-transactions` (sin DELETE), `/treasury/reconciliations` (sin DELETE)                                                                       |     |
| 14   | `/workflows` (definiciones CRUD sin DELETE), `POST /workflows/:id/run`, `GET /workflows/:id/instances`, `GET /workflows/approvals[/:id]`, `POST /workflows/approvals/:id/decision`                                                                                                         |
| 15   | `/reports` (catálogo + ventas/compras/cashflow/inventory/inventory-low-stock/crm + 5 exports CSV en `/reports/{key}/export`) — 11 GET, permisos ENCADENADOS `report:read/export` + subyacentes                                                                                             |
| 16   | `/manufacturing/boms` (sin DELETE: archivar con `PATCH {archived}`), `/manufacturing/orders` (sin DELETE: máquina de estados `draft→in_progress→completed\|cancelled` vía `PATCH {status}`; el `completed` pre-chequea stock → 422 y mueve `production_out`/`production_in`) — 8 endpoints |
| —    | `/search` (búsqueda global con `<recurso>:read` por tipo — implementada desde FASE 8)                                                                                                                                                                                                      |
| —    | `/ai` (FASE 20)                                                                                                                                                                                                                                                                            |

## 5. Listados y paginación

- Respuestas de lista: `{ data: [...], meta: { requestId, timestamp, page?, limit?, total?, nextCursor? } }`.
- `limit` con máximo (100); listas grandes usan **cursor** (`nextCursor` sobre `createdAt+_id`).
- Nunca devolver colecciones completas sin límite.

## 6. Escritura

- `POST` crea (201 + `data`), `PATCH` actualiza parcial, `PUT` solo si se define reemplazo total, `DELETE` soft-delete cuando aplique.
- **El body nunca define `tenantId`**: se ignora si viene (y se puede rechazar con `VALIDATION_ERROR` para hacerlo explícito).
- **Los números de documento comercial los asigna el servidor** (numeración atómica `core/numbering`, FASE 9): `number` en el body → `VALIDATION_ERROR`; los importes calculados (líneas y totales) también los calcula el servidor.
- Idempotencia: cabecera `Idempotency-Key` en pagos/órdenes (evaluar en FASE 9+; NOT TESTED).

## 7. Validación

- Zod (`shared-validation`) en body/params/query y archivos (MIME allow-list, tamaño máximo).
- Errores de validación → 400 con `details` por campo (el form del cliente muestra el mismo mensaje).

## 8. Documentación

- OpenAPI generado/actualizado por módulo en `docs/api/<modulo>.md` + spec; revisado en cada Definition of Done.
