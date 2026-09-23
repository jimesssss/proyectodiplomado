# Base de datos — WORKFLOW (FASE 14)

Tres colecciones de la fila de plataforma `workflows · workflowInstances · approvals` (`docs/architecture/database.md` §2) — coinciden 1:1 con el diseño, **sin desviaciones de número de colecciones**. Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `_id ObjectId`. **Sin serie de numeración**: la clave natural `key` única por tenant sustituye al `number` (las definiciones no son documentos numerados; tampoco las instancias ni las solicitudes).

**Decisión de diseño**: el workflow se modela en TRES colecciones separadas (definición / ejecución / solicitud) para no embebidos crecientes: cada instancia es una fila de auditoría de por qué se aprobó algo, y cada solicitud es un renglón de cola paginable con su propio estado. `entityId`/`entityType` son **OPACOS** (ObjectId de cualquier módulo, sin FK): el motor es genérico y no valida pertenencia cruzada (documentado en `docs/api/workflows.md`). El `context` de la instancia es un **snapshot** de los escalares con los que se evaluó la condición (misma filosofía que los snapshots de línea de FASE 9/12: no repintar el histórico).

## Colección `workflows` (definiciones)

| Campo          | Tipo / notas                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                                                                                   |
| `key`          | string, **única por tenant**, normalizada (mayúsculas, espacios → `-`), inmutable                                                                          |
| `name`         | string (1–200)                                                                                                                                             |
| `description?` | string, limpiable con `null`                                                                                                                               |
| `trigger`      | subdoc sin `_id`: `event` (enum del catálogo `events-jobs.md`: `CustomerCreated`…`WorkflowCompleted`), `entityType` (string opaco, p. ej. `sales.invoice`) |
| `condition`    | subdoc sin `_id`: `field` (identificador), `operator` (enum `gt\|gte\|lt\|lte\|eq\|ne\|contains`), `value` (Mixed: `number\|string\|boolean`)              |
| `action`       | subdoc sin `_id`: `type` (enum `request_approval`), `approverRole` (string informativo, sin FK)                                                            |
| `archived`     | boolean (soft-delete; sin `workflow:delete` en el catálogo → ruta DELETE ausente → 404)                                                                    |

- `key`/`trigger`/`condition`/`action` **inmutables en PATCH** (esquema estricto → 400): editar la configuración durante una ejecución en vuelo rompería la trazabilidad de por qué se evaluó.
- `condition.value` va como **Mixed SIN `required`** en el esquema: `false`/`0`/`''` son valores legítimos de comparación y Mongoose rechazaría los falsy con `required:true` — la presencia y el tipo-vs-operador los garantiza Zod en la capa de rutas (superRefine → 400 en la fuente).

## Colección `workflowInstances` (ejecuciones)

| Campo        | Tipo / notas                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `tenantId`   | string (SIEMPRE del JWT)                                                                        |
| `workflowId` | ObjectId → `workflows` (validado en la aplicación, sin FK en BD)                                |
| `entityType` | string opaco (copiado del `trigger` o del payload del `run`)                                    |
| `entityId`   | ObjectId **opaco** del documento gobernado (cualquier módulo; sin FK)                           |
| `context`    | Mixed: record de escalares `{campo: number\|string\|boolean}` copiado en `run` (puede ser `{}`) |
| `state`      | enum `awaiting_approval \| approved \| rejected \| skipped`                                     |

- Máquina: `awaiting_approval → approved\|rejected` (decisión); `approved`/`rejected`/`skipped` terminales. `skipped` **solo nace en `run`** (condición evaluada y no matcheada) — nunca se transiciona HACIA `skipped` desde otro estado.
- **`context` Mixed SIN `required`**: un contexto vacío `{}` es válido en el documento (la condición fallará con `422` al evaluar, que es exactamente lo que se audita).
- Duplicado bloqueado en 2 capas: pre-chequeo de `run` + **índice único parcial** `{tenantId, workflowId, entityId}` con `partialFilterExpression: {state:'awaiting_approval'}` → a lo sumo UNA instancia pendiente por workflow+documento (at-most-once aunque dos `run` concurrentes ganen el pre-chequeo).

## Colección `approvals` (cola de solicitudes)

| Campo                     | Tipo / notas                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `tenantId`                | string (SIEMPRE del JWT)                                                                                           |
| `instanceId`              | ObjectId → `workflowInstances` (la solicitud ES la cola de UNA instancia)                                          |
| `workflowId`              | ObjectId → `workflows` (denormalizado para el filtro `?workflowId=` sin join)                                      |
| `entityType` / `entityId` | copia opaca del contexto del documento (filtros `?entityType=`/`?entityId=`)                                       |
| `approverRole`            | string: snapshot de `action.approverRole` AL EJECUTAR (ediciones posteriores no reescriben solicitudes pendientes) |
| `status`                  | enum `pending \| approved \| rejected`                                                                             |
| `decidedBy?`              | string (`sub` del JWT) o `null` mientras `pending`                                                                 |
| `decidedAt?`              | Date o `null`                                                                                                      |
| `comment?`                | string (≤500) o `null`                                                                                             |

- **Solo el motor crea solicitudes** (no hay `POST /approvals` → 404; ni `PATCH`/`DELETE` → 404): únicamente `GET` + `POST /:id/decision`.
- `status` únicamente cambia vía `transition` **condicionado a `pending`** (dos puertas en la decisión: instancia y solicitud — ver `docs/api/workflows.md`).
- **Máximo UNA solicitud pendiente por instancia**: índice único parcial `{tenantId, instanceId}` con `partialFilterExpression: {status:'pending'}` (la máquina es de 1 paso; tras decidir, la restricción deja de aplicar al documento porque `status` ya no es `pending`).
- `approverRole` es **informativo sin FK**: la cola NO filtra por rol (`GET /approvals` no admite `?approverRole=`) — asignar usuarios reales queda diferido (ver `docs/api/workflows.md` NOT IMPLEMENTED).

Adicional: NO se usa `counters` (sin series); `eventsOutbox`/`jobs`/notificaciones **NO forman parte de esta fila** (diferidas, ver desviaciones abajo).

## Índices (11; query → índice, todos con `tenantId` primero)

| Colección           | Índice                                                                                    | Query justificada                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `workflows`         | `{tenantId, key}` **unique**                                                              | clave natural + `POST` (duplicado → 409)                                                                  |
| `workflows`         | `{tenantId, createdAt:-1}`                                                                | `GET /workflows`                                                                                          |
| `workflows`         | `{tenantId, archived, createdAt:-1}`                                                      | `GET /workflows?archived=`                                                                                |
| `workflowInstances` | `{tenantId, createdAt:-1}`                                                                | orden base de `GET /:id/instances`                                                                        |
| `workflowInstances` | `{tenantId, state, createdAt:-1}`                                                         | `GET /:id/instances?state=`                                                                               |
| `workflowInstances` | `{tenantId, workflowId, createdAt:-1}`                                                    | `GET /workflows/:id/instances` (filtro por definición)                                                    |
| `workflowInstances` | `{tenantId, workflowId, entityId}` **unique** + **partial** `{state:'awaiting_approval'}` | at-most-once: 1 instancia pendiente por workflow+documento (respaldo de carrera del pre-chequeo de `run`) |
| `approvals`         | `{tenantId, createdAt:-1}`                                                                | `GET /approvals`                                                                                          |
| `approvals`         | `{tenantId, status, createdAt:-1}`                                                        | `GET /approvals?status=`                                                                                  |
| `approvals`         | `{tenantId, entityId, entityType}`                                                        | `GET /approvals?entityId=&entityType=` (cola por documento)                                               |
| `approvals`         | `{tenantId, instanceId}` **unique** + **partial** `{status:'pending'}`                    | 1 solicitud pendiente por instancia                                                                       |

La unicidad de `key` es **por tenant**: la misma clave en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en tests de aislamiento (`workflow.test.ts`: B crea `BIG-APPROVAL` con A ya creada).

## Desviaciones documentadas de `database.md` / `events-jobs.md`

- **Fila de plataforma exacta**: las 3 colecciones `workflows · workflowInstances · approvals` de `database.md` §2 se implementan tal cual; la misma fila de `database.md`/`events-jobs.md` menciona además `eventsOutbox`, `jobs` y notificaciones — **SIGUEN DIFERIDAS** (la FASE 1 Core quedó PARTIAL sin outbox; ADR-007 lo pospuso). FASE 14 monta SOLO el bus **in-process** (`core/events/event-bus.ts`): sin `eventsOutbox`, la entrega es en memoria y se pierde si el proceso muere tras el commit (ventana documentada en `docs/api/workflows.md`).
- **Emisores de otros módulos**: los 7 eventos del contrato (`CustomerCreated`…`WorkflowCompleted`) están **declarados** en el mapa tipado, pero FASE 14 **solo emite `WorkflowCompleted`** (al decidir). Los módulos FASE 8–13 no emiten — cablearlos exige outbox (si no, cada `run` sería solo-en-proceso).
- **Disparadores automáticos**: `trigger.event` queda como configuración declarada; la evaluación HOY es bajo demanda (`POST /:id/run`). Conectar eventos → `runWorkflow` automáticamente (incluido `WorkflowCompleted` → otro `run`, riesgo de loop) queda diferido al outbox.
- **Sin selección/escalado de aprobadores**: `approverRole` es un string sin FK a `roles` (que sí existe en identity); decidir no valida que el aprobador pertenezca a ese rol (solo `approval:approve`). Modelar asignaciones por usuario/historial multi-aprobador exigiría rediseñar la máquina (1 paso → N pasos) — fuera del alcance.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`workflow-repository.ts` es el único camino a MongoDB). Único punto de casteo: payload/`$set` de create/update y ObjectId en filtros.
- `tenantId` jamás del cliente; `key`/`trigger`/`condition`/`action` jamás en PATCH y `status`/`decidedBy`/`instanceId` jamás en el body de decisión (esquemas estrictos → 400); FKs/opacos cruzados → `404` uniforme; definición archivada → `409` al ejecutar.
- Las transiciones de instancia/solicitud son **at-most-once por construcción**: `findOneAndUpdate` con `state`/`status` esperado en el filtro (sin `$set` ciego sobre el documento entero).

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): (a) `run` = instancia + solicitud (ventana de instancia `awaiting` sin solicitud); (b) decisión = instancia + solicitud + evento (ventana intermedia autocurable por reintento, no probada con caídas); (c) sin FK real en BD (`entityId`/`workflowId`/`instanceId` validados en la aplicación; sin cascadas — outbox ADR-007).
- **PARTIAL**: sin `eventsOutbox` → el `WorkflowCompleted` se emite in-process tras el commit (pérdida si el proceso muere en esa ventana); handlers idempotentes por `eventId` queda como REQUISITO de futuros suscriptores (hoy no hay suscriptores externos).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev — los `partialFilterExpression` usan la misma sintaxis); volumen alto en `workflowInstances`/`approvals` (crecen sin poda); concurrencia NO ejercitada (dos `run` simultáneos sobre el mismo documento — protegidos por el índice único parcial, no ejercitado en paralelo; dos `decision` con resultados cruzados).
- **RISK**: `workflowInstances`/`approvals` sin retención/poda (historial crece indefinidamente); paginación por offset; `approverRole` sin validación de existencia (opaco); sin índice de texto en `workflows.name`/`key` (búsqueda `q` fuera del alcance).
