# API — PROJECTS (`/api/v1/projects` + `/api/v1/tasks`) — FASE 17

Estado: implementado. Módulo `apps/api/src/modules/projects`; colecciones e índices en `docs/database/projects.md`. Catálogo de permisos **SIN CAMBIOS** (`project:read/create/update/update/delete` ya existía desde v1 → `pv` sigue en **2**, sin re-login por esta fase — ver `docs/security/permission-matrix.md`).

## Recursos y endpoints

**2 montajes** (convenciones §4, fila 17) — **10 endpoints** (GET/POST/GET:id/PATCH:id/**DELETE:id** por recurso). AMBOS recursos comparten el grupo `project:*`: el catálogo **SÍ** define `project:delete` → la ruta DELETE **está publicada** como **soft-delete** (patrón CRM/product: marca `archived`, doble archive → `409`).

| Recurso / acción               | Ruta                   | Permiso          |
| ------------------------------ | ---------------------- | ---------------- |
| listar proyectos               | `GET /projects`        | `project:read`   |
| crear proyecto                 | `POST /projects`       | `project:create` |
| detalle de proyecto            | `GET /projects/:id`    | `project:read`   |
| editar / transición / archivar | `PATCH /projects/:id`  | `project:update` |
| borrar proyecto (soft-delete)  | `DELETE /projects/:id` | `project:delete` |
| listar tareas (cola)           | `GET /tasks`           | `project:read`   |
| crear tarea                    | `POST /tasks`          | `project:create` |
| detalle de tarea               | `GET /tasks/:id`       | `project:read`   |
| editar / transición / archivar | `PATCH /tasks/:id`     | `project:update` |
| borrar tarea (soft-delete)     | `DELETE /tasks/:id`    | `project:delete` |

- **Un solo grupo para los dos recursos**: `project:read` habilita proyectos Y tareas (una sola lectura por módulo); **leer ≠ crear/actualizar/borrar** (`:read` no hace `PATCH` ni `DELETE`) — verificado en `tests/security/projects-security.test.ts`.
- El **owner** (y `super_admin`) reciben los 4 permisos por derivación del catálogo; `pv` vigente **2**.

## Proyecto

- **`code` es la clave natural**: normalizado en el servidor (trim + mayúsculas + espacios → `-`, p. ej. `web portal` → `WEB-PORTAL`), validado `2-32` chars (`[A-Z0-9._-]`), **único POR tenant** (duplicado → `409` `Code already exists`) e **inmutable**: `code` no existe en el esquema del PATCH → intentarlo → `400` (esquema estricto).
- **Campos**: `name` (1–120), `description?` (≤ 500; en blanco → `null`), `startDate?`/`endDate?` (fechas; si ambas, **fin ≥ inicio** — invertidas → `400` `endDate must be on or after startDate`), `managerId?` (FK usuario del MISMO tenant — desconocido/ajeno → `400` `Unknown user`, patrón CRM).
- **Estado inicial `planning`**; transiciones SOLO vía `PATCH {status}` con `project:update`:

  | Desde       | Hacia                               |
  | ----------- | ----------------------------------- |
  | `planning`  | `active`, `cancelled`               |
  | `active`    | `on_hold`, `completed`, `cancelled` |
  | `on_hold`   | `active`, `cancelled`               |
  | `completed` | — (terminal)                        |
  | `cancelled` | — (terminal)                        |
  - mismo estado → `409` `Status is already the requested one`; salto inválido → `409` `Invalid status transition`; estado fuera del enum → `400`.
  - **Solo los NO terminales editan campos de negocio** (`name`, `description`, fechas, `managerId`): en `completed`/`cancelled` → `409` `Only non-terminal projects can be edited` (patrón "solo draft" de Sales/Purchasing/Manufacturing). `status` y `archived` siguen ortogonales a este bloqueo (los terminales simplemente no tienen transiciones).

- **DELETE = soft-delete** (`project:delete`): marca `archived`; doble archive → `409` `Project is already archived`; restaurar = `PATCH {archived:false}` (audita `project.restore`). También admite `PATCH {archived}`. PATCH vacío → `400` `No valid fields to update`.
- Un proyecto **archivado sigue siendo legible** pero no admite tareas nuevas (`409` `Project is archived`); sus tareas existentes no se tocan (nada cascada: no hay borrado físico).

## Tarea

- **Vive en SU proyecto**: `projectId` es obligatorio en el alta y **fijo después** (no está en el PATCH → `400`); proyecto inexistente/ajeno → `404` uniforme.
- **Defaults del alta**: `status: 'open'`, `priority: 'normal'` (`low|normal|high`), `assigneeId: null` (FK usuario → `400 Unknown user`), `dueDate: null`, `dependsOn: []`, `description: null`.
- **Máquina de estados** (vía `PATCH {status}` con `project:update`):

  | Desde         | Hacia                                                                           |
  | ------------- | ------------------------------------------------------------------------------- |
  | `open`        | `in_progress`, `done`, `cancelled` (salto directo a `done` para tareas simples) |
  | `in_progress` | `done`, `cancelled`                                                             |
  | `done`        | — (terminal)                                                                    |
  | `cancelled`   | — (terminal)                                                                    |
  - mismos guards `409` que el proyecto; **solo los NO terminales (`open`/`in_progress`) editan campos de negocio** (`title`, `description`, `priority`, `assigneeId`, `dueDate`, `dependsOn`) → `409` `Only non-terminal tasks can be edited`.

- **Dependencias `dependsOn` (lista de ids, máx. 50)** — el grafo de un proyecto es **ACÍCLICO por construcción**:
  - cada dependencia debe EXISTIR en el tenant → `404`; y pertenecer al **MISMO proyecto** → `400` `Dependencies must belong to the same project` (otro proyecto del tenant no sirve);
  - auto-referencia → `400` `A task cannot depend on itself`; ids duplicados → `400` `Duplicate dependency`;
  - **ciclos** → `400` `Circular dependency detected`: en cada escritura de `dependsOn` el servicio recorre (BFS) las aristas GUARDADAS del proyecto desde las nuevas dependencias; si alcanza la propia tarea, el update crearía un ciclo (p. ej. `B → A` cuando `A → B` ya estaba guardado). El ALTA no puede formar ciclos (id fresco), pero igual valida estructura y FKs.
- **Completar (`→ done`) exige dependencias desbloqueadas** (pre-chequeo ANTES de escribir): bloquea cualquier dependencia con estado ∉ {`done`, `cancelled`} y NO archivada → `409` `Task has unfinished dependencies` con `details.blockedBy: [ids]`; la tarea queda intacta. Una dependencia **cancelada o archivada desbloquea** (nunca se hará / fuera de juego).
- **DELETE = soft-delete** igual que el proyecto (`409` `Task is already archived` en doble archive).

## Query (listados)

Los listados usan `z.object`: un parámetro **desconocido se DESCARTA sin error** (incluido `?tenantId=` — el filtro de tenant SIEMPRE sale del JWT y la query no lo altera); un **valor inválido de un parámetro conocido** (`status=bogus`, `page=0`, `projectId` malformado) → `400 VALIDATION_ERROR` (`Invalid request query`).

| Recurso    | Params                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `projects` | `page?` (≥1, def 1), `limit?` (1–100, def 20), `archived?` (`true\|false`), `status?` (enum de 5) |
| `tasks`    | ídem + `status?` (enum de 4) y `projectId?` (ObjectId → cola por proyecto)                        |

Listados ordenados desc por `createdAt` (desempate `_id`) con `meta {page, limit, total}`.

## Auditoría

`project.create` / `project.update` / `project.restore` / `project.archive` y `task.create` / `task.update` / `task.restore` / `task.archive` (acción = `<entity>.<acción>`, entidades canónicas `project` y `task`); las transiciones de estado quedan en `metadata.reason` = `status:<valor>` (p. ej. `status:completed`) y los archivados en `archived:true` (el DELETE audita `<entity>.archive`).

Envelope, códigos de error y paginación: `docs/api/conventions.md`. FKs de usuario vía API pública de Identity (`findUserInTenant`): Projects → Identity, nunca al revés (sin ciclos de módulos).
