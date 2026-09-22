# API — CRM (`/api/v1` …) — FASE 8

Estado: implementado. Módulo `apps/api/src/modules/crm`; reglas de dominio en `docs/database/crm.md`.

## Recursos y endpoints

Cada recurso expone el CRUD completo. `DELETE` = **soft-delete** (`archived: true`), nunca borra filas.

| Recurso       | Rutas                                                                                                      | Permisos (`<recurso>:*`)             |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| customers     | `POST /customers`, `GET /customers`, `GET /customers/:id`, `PATCH /customers/:id`, `DELETE /customers/:id` | `customer:create/read/update/delete` |
| contacts      | `POST /contacts`, `GET /contacts`, `GET /contacts/:id`, `PATCH /contacts/:id`, `DELETE /contacts/:id`      | `contact:*`                          |
| leads         | `POST /leads`, `GET /leads`, `GET /leads/:id`, `PATCH /leads/:id`, `DELETE /leads/:id`                     | `lead:*`                             |
| opportunities | `POST /opportunities`, … (mismo patrón)                                                                    | `opportunity:*`                      |
| activities    | `POST /activities`, … (mismo patrón)                                                                       | `activity:*`                         |
| búsqueda      | `GET /search?q=&types=&limit=`                                                                             | por tipo: `<recurso>:read`           |

- `GET /` acepta `page`, `limit` (≤100) y `archived=true|false`; además `?customerId=` (contacts/activities), `?leadId=`/`?opportunityId=` (activities), `?status=` (leads), `?stage=` (opportunities).
- `POST` → `201`; `GET/PATCH/DELETE` → `200`. Envelope y paginación: `docs/api/conventions.md`.
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. Token con `pv` viejo → `403` re-login (también en `/search`).
- `tenantId` SIEMPRE del JWT; esquemas estrictos: `tenantId` o campo desconocido en el body → `400`. Respuestas **sin** `tenantId`.

## Reglas de dominio

- **customers**: `code` único por tenant (`(tenantId, code)`), normalizado (mayúsculas/guiones) e **inmutable** tras crear (`PATCH code` → 400). `type` (`company|person`), `taxId` a mayúsculas, `address` estricta con `country` ISO-3166 alpha-2 a mayúsculas; `email` a minúsculas. Campos opcionales se limpian con `null`.
- **contacts**: FK `customerId` obligatoria y del MISMO tenant (inexistente/ajena → `404` uniforme); `customerId` inmutable. **Un solo principal por cliente**: crear/marcar `isPrimary` degrada a los demás.
- **leads**: `status` es una máquina de estados validada — `new → contacted → qualified → converted`, con `lost` accesible desde cualquier estado abierto; `converted`/`lost` terminales. Salto inválido o repetir estado → `409`; convertir **exige** `customerId` (400 si falta) y desvincular un convertido → `409`. `assignedTo` debe ser usuario del tenant (`400 Unknown user`).
- **opportunities**: `stage` validada — `prospecting → qualification → proposal → negotiation → won|lost`; `won`/`lost` terminales (409). Al crear solo etapas abiertas (`won`/`lost` → 400). `lost` **exige** `lostReason` (400) y `lostReason` sin `stage: lost` → 400. `currency` ISO-4217 (default `USD`), `amount ≥ 0`. FK `customerId` → 404.
- **activities**: debe referenciar AL MENOS UNO de `customerId`/`leadId`/`opportunityId` (create y tras cada patch; si no, 400); FKs del tenant → 404. `completedAt` lo fija SIEMPRE el servidor (no acepta `completedAt` en body → 400).
- Estados de registro: `PATCH { archived }` con transiciones validadas (archivar dos veces → 409, restaurar no-archivado → 409); `DELETE` = archivar (doble → 409). PATCH vacío → 400.
- **Auditoría** (FASE 7): toda mutación deja traza — `<recurso>.create/.update/.archive/.restore` con `entityType = <recurso>`; el `reason` del patch (`status:…`, `stage:…`, `archived:…`) va en `metadata.reason`.

## `/search` (búsqueda global)

`GET /api/v1/search?q=<2-100>&types=customer,lead&limit=<1-50>`

- Búsqueda **literal**: el término se escapa (metacaracteres de regex inertes — sin ReDoS), case-insensitive, sobre `name|code` (customers), `firstName|lastName` (contacts), `name|email` (leads), `name` (opportunities), `subject` (activities).
- **Por tenant** y con `<recurso>:read` POR TIPO: sin permiso el tipo no aparece (no hay 403 global). `types` desconocido → 400; `q < 2` → 400.
- Respuesta: `{ query, results: [{ type, id, title, subtitle }] }` con `limit` por tipo.
- `RISK`: incluye también `archived`; regex sin anclar → colección completa por tipo (limitado a 50) — ver `docs/database/crm.md`.

## Errores

| Caso                                                                           | HTTP | Código             |
| ------------------------------------------------------------------------------ | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                         | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` o `pv` viejo                                           | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (strict, ids, enums)                               | 400  | `VALIDATION_ERROR` |
| FK inexistente o de otro tenant (uniforme)                                     | 404  | `NOT_FOUND`        |
| Código duplicado (mismo tenant), transición/estado inválido, doble archivado   | 409  | `CONFLICT`         |
| `lost` sin razón, convertir sin cliente, sin enlaces, `assignedTo` desconocido | 400  | `VALIDATION_ERROR` |

## NOT TESTED / RISK

- **PARTIAL**: sin `customerTags` ni colección de timeline (la actividad ES la línea del timeline; las etiquetas quedan para fases de reporting) — desviación documentada de `database.md`.
- **PARTIAL**: archivar un cliente/contacto NO elimina en cascada hijos ni enlaces (coherente con FASE 5; los enlaces siguen siendo consultables).
- **NOT TESTED**: `apps/web`/`apps/mobile` consumiendo la API; Atlas real; volumen alto de `/search` (sin índice de texto).
