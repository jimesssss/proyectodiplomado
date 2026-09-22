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

| Fase  | Rutas                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------- |
| 2     | `/health`, `/health/ready`                                                                                     |
| 3     | `/auth` (login, logout, refresh, change-password, forgot/reset)                                                |
| 4     | `/tenants` (admin)                                                                                             |
| 5     | `/organizations`, `/companies`, `/branches`, `/departments`, `/warehouses`, `/cost-centers`                    |
| 6     | `/users`, `/roles`, `/permissions` (RBAC; `forgot/reset` sigue pendiente con workers/email)                    |
| 7     | `/audit` (lectura con `audit:read`)                                                                            |
| 8     | `/customers`, `/contacts`, `/leads`, `/opportunities`, `/activities`                                           |
| 9     | `/sales/quotes`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/returns`                     |
| 10    | `/purchasing/requests`, `/purchasing/orders`, `/purchasing/receipts`, `/purchasing/invoices`                   |
| 11    | `/inventory/products`, `/inventory/stock`, `/inventory/movements`, `/inventory/transfers`, `/inventory/counts` |
| 12-13 | `/accounting/...`, `/treasury/...`                                                                             |
| 14-15 | `/workflows`, `/reports`                                                                                       |
| —     | `/search` (búsqueda global por permisos, desde FASE 8)                                                         |
| —     | `/ai` (FASE 20)                                                                                                |

## 5. Listados y paginación

- Respuestas de lista: `{ data: [...], meta: { requestId, timestamp, page?, limit?, total?, nextCursor? } }`.
- `limit` con máximo (100); listas grandes usan **cursor** (`nextCursor` sobre `createdAt+_id`).
- Nunca devolver colecciones completas sin límite.

## 6. Escritura

- `POST` crea (201 + `data`), `PATCH` actualiza parcial, `PUT` solo si se define reemplazo total, `DELETE` soft-delete cuando aplique.
- **El body nunca define `tenantId`**: se ignora si viene (y se puede rechazar con `VALIDATION_ERROR` para hacerlo explícito).
- Idempotencia: cabecera `Idempotency-Key` en pagos/órdenes (evaluar en FASE 9+; NOT TESTED).

## 7. Validación

- Zod (`shared-validation`) en body/params/query y archivos (MIME allow-list, tamaño máximo).
- Errores de validación → 400 con `details` por campo (el form del cliente muestra el mismo mensaje).

## 8. Documentación

- OpenAPI generado/actualizado por módulo en `docs/api/<modulo>.md` + spec; revisado en cada Definition of Done.
