# API — SERVICE (`/api/v1/tickets`) — FASE 18

Estado: implementado. Módulo `apps/api/src/modules/service`; colección e índices en `docs/database/tickets.md`. Catálogo de permisos **SIN CAMBIOS** (`ticket:read/create/update/delete` ya existía desde v1 — verificado con `git log -S` sobre `packages/permissions/src/index.ts`, commit `d5d8753` → `pv` sigue en **2**, sin re-login por esta fase — ver `docs/security/permission-matrix.md`).

## Recursos y endpoints

**1 montaje** (convenciones §4, fila 18) — **5 endpoints** (GET/POST/GET:id/PATCH:id/**DELETE:id**). El catálogo **SÍ** define `ticket:delete` → la ruta DELETE **está publicada** como **soft-delete** (patrón CRM/product: marca `archived`, doble archive → `409`).

| Acción                         | Ruta                  | Permiso         |
| ------------------------------ | --------------------- | --------------- |
| listar tickets (colas)         | `GET /tickets`        | `ticket:read`   |
| crear ticket                   | `POST /tickets`       | `ticket:create` |
| detalle de ticket              | `GET /tickets/:id`    | `ticket:read`   |
| editar / transición / archivar | `PATCH /tickets/:id`  | `ticket:update` |
| borrar ticket (soft-delete)    | `DELETE /tickets/:id` | `ticket:delete` |

- **Leer ≠ crear/actualizar/borrar** (`ticket:read` no hace `PATCH` ni `DELETE`) — verificado en `tests/security/tickets-security.test.ts`.
- El **owner** (y `super_admin`) reciben los 4 permisos por derivación del catálogo; `pv` vigente **2**.

## Ticket

- **`number` lo asigna SIEMPRE el servidor**: serie `ticket` vía `core/numbering` (`$inc` atómico, único por tenant, reset anual) → `TK-YYYY-000001`. No existe en el body (crear con `number` → `400`, esquema estricto); dos altas concurrentes reciben números **distintos** (reintento ante carrera de upsert `E11000`).
- **Campos**: `subject` (1–120, `.trim()`: solo espacios → `400` en create y PATCH), `description?` (≤ 500; en blanco → `null`), `priority?` (`low|normal|high|urgent`, default `normal`), `assigneeId?` (FK usuario del MISMO tenant — desconocido/ajeno → `400` `Unknown user`, patrón CRM), `resolution?` (≤ 500, nota de resolución).
- **Estado inicial `open`**; transiciones SOLO vía `PATCH {status}` con `ticket:update`:

  | Desde         | Hacia                                  |
  | ------------- | -------------------------------------- |
  | `open`        | `in_progress`, `resolved`, `cancelled` |
  | `in_progress` | `resolved`, `cancelled`                |
  | `resolved`    | `in_progress` (**reabrir**), `closed`  |
  | `closed`      | — (terminal)                           |
  | `cancelled`   | — (terminal)                           |
  - mismo estado → `409` `Status is already the requested one`; salto inválido → `409` `Invalid status transition`; estado fuera del enum → `400`.
  - **`→ resolved` exige `resolution` NO vacía en el MISMO patch** (un borrador guardado antes no sirve): sin nota → `400` `Resolution is required to resolve a ticket` y **no escribe**. **Reabrir (`resolved → in_progress`) limpia la nota** (la próxima resolución debe ser nueva); cerrar (`resolved → closed`) la conserva.
  - **Solo los NO terminales (`open`/`in_progress`/`resolved`) editan campos de negocio** (`subject`, `description`, `priority`, `assigneeId`, `resolution`): en `closed`/`cancelled` → `409` `Only non-terminal tickets can be edited`. `status` y `archived` siguen ortogonales (los terminales simplemente no tienen transiciones).

- **SLA derivado `dueAt`** (NO se almacena; viaja solo en la proyección pública): `createdAt + horas de la prioridad ACTUAL` — `urgent` 4 h, `high` 8 h, `normal` 24 h, `low` 72 h (horas de reloj — PARTIAL: sin calendario laboral). Cambiar `priority` **desplaza** el vencimiento al re-leer. No es editable: `PATCH {dueAt}` → `400` (esquema estricto).
- **DELETE = soft-delete** (`ticket:delete`): marca `archived`; doble archive → `409` `Ticket is already archived`; restaurar = `PATCH {archived:false}` (audita `ticket.restore`). También admite `PATCH {archived}` (ortogonal al estado: archivar un `closed`/`cancelled` es válido). PATCH vacío → `400` `No valid fields to update`.

## Query (listados)

Los listados usan `z.object`: un parámetro **desconocido se DESCARTA sin error** (incluido `?tenantId=` — el filtro de tenant SIEMPRE sale del JWT y la query no lo altera); un **valor inválido de un parámetro conocido** (`status=bogus`, `page=0`, `assigneeId` malformado) → `400 VALIDATION_ERROR` (`Invalid request query`).

| Params                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page?` (≥1, def 1), `limit?` (1–100, def 20), `archived?` (`true\|false`), `status?` (enum de 5), `priority?` (enum de 4), `assigneeId?` (ObjectId → cola personal de UN agente) |

Listados ordenados desc por `createdAt` (desempate `_id`) con `meta {page, limit, total}`.

## Auditoría

`ticket.create` / `ticket.update` / `ticket.restore` / `ticket.archive` (acción = `<entity>.<acción>`, entidad canónica `ticket`); las transiciones de estado quedan en `metadata.reason` = `status:<valor>` (p. ej. `status:resolved`), los archivados en `archived:true` (el DELETE audita `ticket.archive`).

Envelope, códigos de error y paginación: `docs/api/conventions.md`. FK de usuario vía API pública de Identity (`findUserInTenant`): Service → Identity, nunca al revés (sin ciclos de módulos).

## NOT TESTED / RISK / PARTIAL

- **PARTIAL**: SLA en horas de reloj — sin calendario laboral/feriados ni escalado por incumplimiento (`overdue` no se calcula ni se filtra).
- **PARTIAL**: no hay cliente/ticket-threads ni comentarios: un ticket es un documento único (sin colección de mensajes).
- **NOT TESTED**: volumen alto de colas; `explain()` de los índices sobre Atlas.
