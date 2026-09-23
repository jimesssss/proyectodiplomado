# Base de datos — PROJECTS (FASE 17)

2 colecciones nuevas, propias de Projects (dueño FASE 17): `projects` (maestro con clave natural + máquina de estados) y `tasks` (hijo de proyecto con grafo de dependencias). Las tareas viven en **colección propia** (no embebida): se listan y filtran de forma independiente (`?projectId`, `?status` — patrón contacts/activities de CRM, ADR-003). Schema en `projects/infrastructure/schemas/collections.ts`.

## Colección `projects`

| Campo          | Tipo / notas                                                                        |
| -------------- | ----------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                            |
| `code`         | string, **única por tenant** (normalizada: mayúsculas, espacios → `-`) e inmutable  |
| `name`         | string (1–120)                                                                      |
| `description?` | string ≤ 500 \| null (blanco → null)                                                |
| `status`       | enum `planning \| active \| on_hold \| completed \| cancelled` (inicial `planning`) |
| `startDate?`   | Date \| null                                                                        |
| `endDate?`     | Date \| null (si ambas: fin ≥ inicio, validado en servicio)                         |
| `managerId?`   | ObjectId → `users` \| null (FK del mismo tenant)                                    |
| `archived`     | boolean (soft-delete con `project:delete`)                                          |

## Colección `tasks`

| Campo          | Tipo / notas                                                                        |
| -------------- | ----------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                            |
| `projectId`    | ObjectId → `projects` (fijo al crear; NO admite PATCH)                              |
| `title`        | string (1–120)                                                                      |
| `description?` | string ≤ 500 \| null                                                                |
| `status`       | enum `open \| in_progress \| done \| cancelled` (inicial `open`)                    |
| `priority`     | enum `low \| normal \| high` (default `normal`)                                     |
| `assigneeId?`  | ObjectId → `users` \| null (FK del mismo tenant)                                    |
| `dueDate?`     | Date \| null                                                                        |
| `dependsOn`    | ObjectId[] → `tasks` del **MISMO proyecto**, **grafo acíclico** (máx. 50 por tarea) |
| `archived`     | boolean (soft-delete con `project:delete`)                                          |

## Índices

| Colección  | Índice                                | Query justificada                                                                 |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| `projects` | `{tenantId, code}` **unique**         | clave natural: `POST` duplicado en el mismo tenant → 409 (otros tenants intactos) |
| `projects` | `{tenantId, createdAt:-1}`            | `GET /projects` (listado por defecto, desc)                                       |
| `projects` | `{tenantId, status, createdAt:-1}`    | `GET /projects?status=` (cola por estado)                                         |
| `projects` | `{tenantId, archived, createdAt:-1}`  | `GET /projects?archived=`                                                         |
| `tasks`    | `{tenantId, createdAt:-1}`            | `GET /tasks` (cola global por defecto, desc)                                      |
| `tasks`    | `{tenantId, projectId, createdAt:-1}` | `GET /tasks?projectId=` (tareas de UN proyecto)                                   |
| `tasks`    | `{tenantId, status, createdAt:-1}`    | `GET /tasks?status=` (p. ej. la de "por hacer")                                   |
| `tasks`    | `{tenantId, archived, createdAt:-1}`  | `GET /tasks?archived=`                                                            |

`tenantId` SIEMPRE primero (ADR-002); cada índice justificado por una lectura o restricción de unicidad (sin índices "por si acaso").

## Reglas de escritura

- Único camino a Mongo: `projects/infrastructure/repositories/project-repository.ts` (2 modelos propios `ProjectsProject`/`ProjectsTask` — nunca reutilizan el nombre del modelo de otro módulo). Toda operación filtra por `tenantId`.
- **FKs de usuario** (`managerId`/`assigneeId`): resueltas contra Identity vía `findUserInTenant` (API pública `identity/index.ts`) → desconocido/ajeno → `400 Unknown user`; Projects → Identity, nunca al revés.
- **Dependencias**: cada escritura de `dependsOn` valida estructura (self/duplicados), existencia + MISMO proyecto de cada id y recorre (BFS, `dependsOnReaches`) las aristas guardadas del proyecto desde las nuevas dependencias; si alcanza la tarea → `400 Circular dependency detected`. **Invariante: el grafo por proyecto es acíclico por construcción** (toda escritura pasa por esa BFS).
- **Completar tarea**: pre-chequeo de bloqueo (dependencias con estado ∉ {`done`,`cancelled`} y no archivadas) → `409` con `details.blockedBy` ANTES de escribir el estado.
- Duplicado de clave natural (`tenantId,code`) → `E11000` traducido a `409` en el repositorio.
- **Sin transacciones multi-documento**: no hay flujos multi-colección con invariante fuerte (la BFS + pre-chequeo ocurren antes de cada única escritura).

## NOT TESTED / RISK / PARTIAL

- **RISK**: la BFS de ciclos carga las dependencias del proyecto en memoria (`find` proyectando `dependsOn`); crece linealmente con las tareas del proyecto (máx. 50 dependencias por tarea LIMITA la fan-in, no el tamaño del proyecto) — NOT TESTED a escala de miles de tareas por proyecto.
- **NOT TESTED**: `explain()` de los 8 índices sobre Atlas; volumen alto de la cola `tasks`.
- **PARTIAL**: no hay índices dedicados sobre `dependsOn[]` (búsqueda de dependencias es por proyecto, ya cubierta).
