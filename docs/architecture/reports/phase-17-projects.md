# Reporte de fase — FASE 17: PROJECTS

## ESTADO

**COMPLETADA** (QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `projects` montado bajo `/api/v1/projects` + `/api/v1/tasks` (convenciones §4 fila 17, **10 endpoints** = GET/POST/GET:id/PATCH:id/**DELETE:id** por recurso):

- **Catálogo SIN cambios** (`project:read/create/update/delete` ya existía desde v1): `PERMISSION_CATALOG_VERSION` sigue en **2** → **sin re-login** por esta fase (patrón FASE 14/15; nota añadida en la matriz de permisos). Como el catálogo SÍ define `project:delete`, ambas rutas DELETE **se publican como soft-delete** (patrón CRM/product: `archived`, doble archive → 409, `DELETE` audita `<entity>.archive`).
- **Proyecto** con clave natural `code` (normalizada mayúsculas/espacios→`-`, `2-32 [A-Z0-9._-]`, **única por tenant** → 409, **inmutable**: PATCH con `code` → 400), `name`, `description` (blanco→null), fechas `startDate`/`endDate` (**fin ≥ inicio** → 400) y `managerId` (FK usuario → 400 `Unknown user`, patrón CRM). **Máquina de estados** `planning → active → completed` con pausa reversible `on_hold` y salida `cancelled` desde cualquier no-terminal (saltos → 409 `Invalid status transition`, repetidos → 409 `Status is already the requested one`, enum → 400) vía `PATCH {status}` con `project:update`. **Solo los NO terminales editan negocio** (`completed`/`cancelled` congelan el documento → 409 `Only non-terminal projects can be edited`, patrón "solo draft"); `archived` y `status` son ortogonales al bloqueo. Proyecto archivado: legible pero no admite tareas nuevas (409 `Project is archived`).
- **Tarea** hija con `projectId` **fijo al crear** (no está en el PATCH → 400; inexistente/ajeno → 404), defaults `open`/`normal`/`dependsOn: []`, `assigneeId` FK (400), `dueDate`. Máquina `open → in_progress → done` (con salto directo `open → done`) y `cancelled`; terminales `done`/`cancelled` con la misma guarda de negocio (409).
- **Dependencias `dependsOn` con grafo ACÍCLICO por construcción**: cada id debe existir (404) y ser del **MISMO proyecto** (400 `Dependencies must belong to the same project`); auto-referencia → 400 `A task cannot depend on itself`; duplicados → 400 `Duplicate dependency`; **ciclos** → 400 `Circular dependency detected` (BFS sobre las aristas guardadas del proyecto desde las nuevas dependencias; el ALTA no puede ciclar porque el id es fresco — documentado). Máx. 50 por tarea.
- **Completar (`→ done`) pre-chequea bloqueo ANTES de escribir**: cualquier dependencia con estado ∉ {`done`, `cancelled`} y no archivada → **409 `Task has unfinished dependencies` con `details.blockedBy`** y la tarea queda intacta; **cancelada o archivada desbloquea**. Sin eventos/jobs nuevos ni `Idempotency-Key`; módulo API-only (sin UI en web/mobile).
- **Cross-module**: FKs de usuario vía API pública de Identity (`findUserInTenant`) — Projects → Identity, nunca al revés; sin imports de schemas/repositorios/colecciones ajenos.
- **Query de listados documentada con honestidad**: los CRUD usan `z.object` → parámetro **desconocido se descarta sin error** (incluido `?tenantId=`, que no altera el filtro: siempre del JWT); valor inválido de un parámetro **conocido** (`status=bogus`, `page=0`) → 400. Ver CORRECCIONES §2 (la doc de FASE 16 decía lo contrario).

## ARCHIVOS

**21 + este reporte = 22**:

- **Nuevo módulo (12)**: `apps/api/src/modules/projects/` — `index.ts`, `domain/entities/{project,task}.ts`, `domain/rules/{project-rules.ts + project-rules.test.ts}`, `application/{project-service,task-service}.ts`, `infrastructure/schemas/{types,collections}.ts`, `infrastructure/repositories/project-repository.ts`, `presentation/validators/project-validators.ts`, `presentation/routes/project-routes.ts`.
- **Tests nuevos (2)**: `tests/integration/projects.test.ts` (9), `tests/security/projects-security.test.ts` (6).
- **Docs nuevos (2)**: `docs/api/projects.md`, `docs/database/projects.md`.
- **Modificados (5)**: `apps/api/src/index.ts` (composition root: `createProjectsRouters`), `docs/api/conventions.md` (fila 17), `docs/security/permission-matrix.md` (4 rutas + nota "sin bump en FASE 17"), `docs/architecture/database.md` (fila `projects`·`tasks`, `tickets`/`employees` → fases 18-19), `docs/api/manufacturing.md` (**corrección** de la afirmación de query, ver §2).
- **Reporte (1)**: este archivo.
- `packages/permissions`: **NO modificado** (sin cambios de catálogo).

## APIs

10 endpoints nuevos (0 de catálogo nuevo; permisos `project:*` ya vigentes):

| Ruta                   | Métodos                       | Permiso                          |
| ---------------------- | ----------------------------- | -------------------------------- |
| `/api/v1/projects`     | GET, POST                     | `project:read`, `project:create` |
| `/api/v1/projects/:id` | GET, PATCH, **DELETE** (soft) | `project:read/update/delete`     |
| `/api/v1/tasks`        | GET, POST                     | `project:read`, `project:create` |
| `/api/v1/tasks/:id`    | GET, PATCH, **DELETE** (soft) | `project:read/update/delete`     |

Detalle (queries, mensajes exactos, máquina de estados, dependencias): `docs/api/projects.md`.

## COLECCIONES

2 nuevas (`docs/database/projects.md`):

- `projects` — `{tenantId, code, name, description?, status, startDate?, endDate?, managerId?, archived}`.
- `tasks` — `{tenantId, projectId, title, description?, status, priority, assigneeId?, dueDate?, dependsOn[], archived}` (colección propia: se lista/filtra independiente, patrón CRM).

## ÍNDICES

8 (todos con `tenantId` primero y justificados por lectura/restricción):

- `projects`: `{tenantId, code}` **unique** · `{tenantId, createdAt:-1}` · `{tenantId, status, createdAt:-1}` · `{tenantId, archived, createdAt:-1}`
- `tasks`: `{tenantId, createdAt:-1}` · `{tenantId, projectId, createdAt:-1}` · `{tenantId, status, createdAt:-1}` · `{tenantId, archived, createdAt:-1}`

## TESTS

**QA gate `npm run qa` EXIT=0**: `typecheck` ✓ · `lint` ✓ · `format:check` ✓ · `test` ✓ · `build` ✓.

- **Suite total: 502 tests PASSED en 61 archivos** (FASE 16: 471/58 → **+31 tests, +3 archivos**; cifra verificada en este QA).
- **FASE 17 (31 tests, todos PASSED)**:
  - `project-rules.test.ts` — **16 unit**: máquina de estados de proyecto (transiciones, sin saltos, terminales sin salida, 5 estados), máquina de tarea (incluye el salto directo `open→done`), `isDependencyBlocking` (activa bloquea; `done`/`cancelled`/archivada no), `validateDependencies` (duplicados con/sin `selfId`, auto-referencia solo con `selfId`, límite de 50), `dependsOnReaches` (directo, cadena de 3, sin camino, ciclo ajeno que debe TERMINAR, vacío), `normalizeProjectCode`/`validateProjectCode`, `isValidDateRange` (null, igual, invertidas), archivado y defaults.
  - `tests/integration/projects.test.ts` — **9**: proyecto (código normalizado/único por tenant/sin tenantId, fechas coherentes + `managerId` FK, 400 invertidas/`Unknown user`/tenantId inyectado), máquina de estados (409 exactos, edición solo no-terminal, `archived` ortogonal, PATCH vacío), **DELETE real = soft-delete** (200/409 + `?archived` y `?status`), tarea (defaults, FKs 404/400, proyecto archivado → 409), dependencias (self/dup 400, desconocida 404, otro proyecto 400, **ciclo 400**, alta con dependencia válida), máquina de tarea + **bloqueo 409 `blockedBy` sin escribir** y desbloqueo al cancelar, filtros (`?projectId`/`?status`/`?archived`, `status=nope` → 400), aislamiento B (404 en GET/PATCH/**DELETE** y en crear tarea sobre proyecto o dependencia de A; listas 1 y 0), auditoría (`project.create`=4, `task.create`=5, `status:completed`, `project.archive`=1, filtro de B → 0).
  - `tests/security/projects-security.test.ts` — **6**: 401 en las 10 rutas sin token/manipulado, 403 con `details.permission` por verbo en AMBOS recursos (incluye `project:delete`), grupo unificado (`project:read` lee proyectos y tareas; `:create`/`:update`/`:delete` separados), token `pv=1` obsoleto → 403 de re-login (+ aserción `PERMISSION_CATALOG_VERSION === 2`: la fase NO bumpó), entrada estricta (tenantId/`code`/`projectId`, id malformado, montaje desconocido → 404, **DELETE real 200/409** sobre fixtures dedicados), cero `tenantId` en respuestas.
- `npm audit` (aparte del gate): **producción 0 vulnerabilidades** (EXIT=0); dev: **2 moderadas preexistentes** (`vitest`/`@vitest/mocker`, fix = `vitest@5` breaking — mismo hallazgo desde FASE 15, no introducido aquí).

## ERRORES

**0 en el QA final** (EXIT=0). Durante el QA de la fase hubo un intento fallido (lint) y una afirmación documental incorrecta; ambos corregidos en la sección siguiente. No quedan errores TS, de lint, de formato, tests fallidos ni vulnerabilidades nuevas.

## CORRECCIONES

1. **Lint (QA intento 1, EXIT=1 → corregido)**: 6 errores `no-unused-vars` — imports de tipos sin usar (`Project` en `project-service.ts`, `Task` en `task-service.ts`, `TaskPriority` en el repositorio, `Project`/`Task` en `schemas/types.ts`) y constante `MISSING_ID` sin usar en el security test. Quitados los imports/constante; ninguna lógica tocada.
2. **Doc de FASE 16 con una afirmación FALSA (corregido, honesty rule)**: `docs/api/manufacturing.md` afirmaba "Parámetro desconocido → 400 (`Invalid request query`); incluye `?tenantId=`". Verificado contra el código: todos los listados CRUD usan `z.object`, que **descarta** parámetros desconocidos (→ 200, sin efecto); solo Reporting usa `z.strictObject` por clave (→ 400, con su test). Ningún test afirmaba 400 para manufacturing. Corregido el doc y verificado con test real en FASE 17 (`?tenantId=evil` → 200, `meta.total` intacto, sin `tenantId` en la respuesta).
3. **Decisiones de diseño documentadas** (no bugs): DELETE publicado porque el catálogo YA tenía `project:delete` desde v1 (a diferencia de manufacturing); ciclo detección solo en escritura de `dependsOn` (el ALTA es imposible que cicle — id fresco); bloqueo de completar con pre-chequeo previo a la escritura (patrón de los 422 de FASE 11/16).

## RIESGOS

- **RISK**: la BFS anti-ciclos carga `dependsOn` de TODAS las tareas del proyecto en memoria (`find` con proyección); crece linealmente con el tamaño del proyecto (fan-in limitado a 50, fan-out NO) — **NOT TESTED** a escala de miles de tareas por proyecto. Atlas real (replica set) `explain()` de los 8 índices **NOT TESTED**.
- **NOT TESTED**: volumen alto de la cola `tasks`; UI de projects en `apps/web`/`apps/mobile` (módulo API-only esta fase); `apps/web`/`apps/mobile`/Atlas real siguen sin probarse (constante desde FASE 1).
- Sin `Idempotency-Key` (reintento de `PATCH {status}` → 409, no idempotente); outbox/jobs no implementados (constante desde FASE 7). Sin transacciones Mongo multi-doc — aquí cada escritura es de UN documento tras sus pre-chequeos (ventana menor que las de FASE 11/16).
- **PARTIAL**: sin índice dedicado sobre `dependsOn[]` (las lecturas van por proyecto, ya cubiertas).
- Dev audit: 2 moderadas preexistentes (`vitest`, fix = upgrade breaking) — no bloquean producción.

## PRÓXIMA FASE

**18 SERVICE**: módulo `service` (`ticket:*` YA estaba en el catálogo desde v1 — verificado en FASE 18 con `git log -S`; **sin bump**, pv=2 — esta línea anunciaba erróneamente un bump y fue corregida), tickets con SLA/prioridad y asignación, máquina de estados de soporte, archivado con `ticket:delete`, filtros de cola; docs + QA + commit por fase.
