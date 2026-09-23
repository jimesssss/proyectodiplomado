# API — WORKFLOW (`/api/v1/…`) — FASE 14

Estado: implementado. Módulo `apps/api/src/modules/workflow`; colecciones e índices en `docs/database/workflows.md`; bus de eventos en `apps/api/src/core/events/event-bus.ts` (ADR-007).

## Recursos y endpoints

**Montaje único `/workflows`** (convenciones §4, fila 14) con **2 routers sobre el MISMO path (el orden importa)**: primero el motor + cola de aprobaciones, después la fábrica CRUD de definiciones — así `GET /workflows/approvals` no cae en el `GET /:id` del CRUD. **9 endpoints**:

| Recurso / acción               | Ruta                                                       | Permisos                      |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------- |
| definiciones (CRUD sin DELETE) | `POST /workflows`, `GET …`, `GET /:id`, `PATCH /:id`       | `workflow:create/read/update` |
| ejecutar                       | `POST /workflows/:id/run`                                  | `workflow:update`             |
| instancias del workflow        | `GET /workflows/:id/instances`                             | `workflow:read`               |
| cola de aprobaciones           | `GET /workflows/approvals`, `GET /workflows/approvals/:id` | `approval:read`               |
| decidir                        | `POST /workflows/approvals/:id/decision`                   | `approval:approve`            |

- `POST` → `201` (crear/run); `GET/PATCH` → `200` (decisión → `200`). Envelope, paginación (`page`, `limit` ≤100) y códigos: `docs/api/conventions.md`.
- Filtros: definiciones `?archived=true|false`; instancias `?state=awaiting_approval|approved|rejected|skipped`; aprobaciones `?status=pending|approved|rejected`, `?workflowId=`, `?entityType=`, `?entityId=`.
- El catálogo **no define `workflow:delete`** → ruta `DELETE` no publicada (**404 incluso para el owner**); el soft-delete es `PATCH {archived:true}`.
- **Separación explícita** `workflow:*` (configurar/ejecutar) ≠ `approval:*` (leer la cola / decidir): un configurador con `workflow:update` NO decide; un aprobador con `approval:approve` NO reconfigura (verificado en `tests/security/workflow-security.test.ts`).
- Denegación por defecto (ADR-005): sin el permiso exacto → `403` con `details.permission`. `pv` viejo → `403` re-login. **Sin bump de `pv` en FASE 14**: la fase reutiliza `workflow:read/create/update` y `approval:read/approve` ya existentes (el catálogo estaba en v1; hoy `PERMISSION_CATALOG_VERSION = 2` desde la FASE 16 — ver `docs/security/permission-matrix.md`).
- `tenantId` SIEMPRE del JWT; esquemas **estrictos**: `tenantId`/`archived`/`id` (en create), `key`/`trigger`/`condition`/`action` (en PATCH — inmutables), `status`/`instanceId`/`decidedBy`/`tenantId`/`state`/`workflowId` (en run/decisión) u otro campo desconocido → `400`. Respuestas **sin** `tenantId`.

## Definiciones (`/workflows`) — configuración POR DATOS

- Forma: `{key, name, description?, trigger: {event, entityType}, condition: {field, operator, value}, action: {type, approverRole}}`.
- `key` única **POR tenant**, normalizada (mayúsculas, espacios → guiones), validada (2–64 chars `[A-Z0-9._-]`) e **inmutable**: duplicado mismo tenant → `409 Key already exists`; otro tenant con la misma clave → `201` (ADR-002).
- `trigger.event ∈` catálogo inicial de `events-jobs.md` (`CustomerCreated`, `SalesOrderCreated`, `PaymentReceived`, `StockLow`, `InvoiceApproved`, `PurchaseReceived`, `WorkflowCompleted`); `trigger.entityType` es un **string opaco** (p. ej. `sales.invoice`) — el motor no valida FKs cruzadas.
- `condition.operator ∈ {gt, gte, lt, lte, eq, ne, contains}`; el **tipo de `value` debe casar con el operador** (numérico para `gt/gte/lt/lte`, string para `contains`) y se valida **en la FUENTE** (superRefine → `400`) — no en runtime.
- `action.type` solo `'request_approval'`; `approverRole` es **informativo** (snapshot sin FK: la cola NO filtra por rol).
- **Inmutables en PATCH** (`key`/`trigger`/`condition`/`action` → `400`) para no romper instancias en vuelo; editables: `name`, `description` (nullable) y `archived`.
- Archivar con guardias: doble → `409 Workflow is already archived`; doble restaurar → `409 Workflow is not archived`; `PATCH {}` → `400 No valid fields to update`. Sin máquina de estados (una definición no tiene ciclo de vida propio).

## Motor (`POST /workflows/:id/run`)

Forma: `{entityType, entityId, context?}` — `entityId` es un ObjectId **opaco** (documento de cualquier módulo; sin validación FK, genérico). `context` es un record de **escalares** (`number|string|boolean`, hasta 500 chars por valor).

Orden de ejecución (sin transacciones Mongo — ventanas abajo):

1. **Pre-chequeos SOLO-lectura**: definición inexistente/ajena → `404`; `archived` → `409 Workflow is archived`; `entityType ≠ trigger.entityType` → `409 Trigger does not match the document type` con `details {expected, received}`.
2. **Evaluación de la condición ANTES de mirar estado de entidades** (patrón de dos fases de FASE 13): campo ausente en el `context` → **`422 DOMAIN_ERROR 'Condition field missing in context'` con `details {field}`**; tipo real incompatible con el operador → **`422 'Condition field type does not match the operator'` con `details {field, operator}`** — el motor **NUNCA asume `false`** ante un contexto no evaluable.
3. **Duplicado**: existe otra instancia `awaiting_approval` del MISMO workflow sobre el MISMO documento → `409 Approval is already pending for this document` (pre-chequeo + índice único parcial como respaldo de carrera → at-most-once).
4. **Match → `201` con instancia `awaiting_approval` + solicitud `pending`** (dos escrituras): la solicitud copia el `approverRole` de la definición al ejecutar (ediciones posteriores no reescriben solicitudes ya creadas). **No match → `201` con instancia `skipped` SIN solicitud** (evaluado, no aplica): auditable vía `workflow.instance.create` con `reason: state:skipped`.

Máquinas (reglas puras en `domain/rules/workflow-rules.ts`):

- **Instancia**: `awaiting_approval → approved|rejected` (decisión, terminal); `approved`/`rejected`/`skipped` **terminales**. `skipped` solo nace en `run`; re-ejecutar el workflow sobre el documento **sí está permitido** cuando no hay instancia pendiente (una instancia por cada evaluación).
- **Aprobación**: `pending → approved|rejected` (terminales). No hay creación pública de solicitudes ni `PATCH`/`DELETE` sobre ellas → esas rutas **404** (solo `GET` + `POST …/decision`).

### Decisión (`POST /workflows/approvals/:id/decision`)

Forma: `{decision: 'approved'|'rejected', comment?}` (≤500 chars). `decidedBy`/`decidedAt`/`status` SOLO-del-servidor (`decidedBy` = JWT `sub`) → inyección → `400`.

Orden de la decisión (dos escrituras condicionadas, sin transacciones):

1. **Instancia `transition` condicionada a `awaiting_approval`** — puerta canónica at-most-once. Si perdió (otra decisión ya ganó): mismo resultado → responde `409 Status is already the requested one` en el paso 2; resultado distinto → `409 Invalid status transition` **sin tocar la solicitud ni emitir**.
2. **Solicitud `transition` condicionada a `pending`** — segunda puerta (carreras con la MISMA decisión: la perdedora → `409 Status is already the requested one` y **no emite**).
3. **`WorkflowCompleted` vía bus tipado** (`{workflowInstanceId, outcome}`) tras el commit — **exactamente UN evento por decisión** (solo emite quien supera el paso 2). El bus aísla fallos de handler: un handler en error se captura y loguea sin romper la respuesta.

Mismo estado → `409 Status is already the requested one`; salto inválido → `409 Invalid status transition`; solicitud inexistente/ajena → `404`.

### Ventanas documentadas (sin transacciones Mongo)

- `run` = 2 escrituras (instancia → solicitud): un fallo entre ambas deja una instancia `awaiting_approval` SIN solicitud (curable solo en BD; el pre-chequeo la bloqueará con `409` — riesgo aceptado y documentado).
- Decisión = instancia → solicitud → evento: un fallo tras la instancia y antes de la solicitud deja instancia decidida + solicitud `pending`; **reintentar la MISMA decisión la cura** (ambas transiciones convergen al resultado deseado), patrón diseñado para autorecuperarse.

## Instancias (`GET /workflows/:id/instances`)

- Lista paginada de las ejecuciones de UNA definición (inexistente/ajena → `404`); `?state=` filtra por estado. No hay endpoint de detalle individual (la lista las cubre; `GET /workflows/instances/:id` —sin prefijo de workflow— no está publicado → `404`).
- `context` viaja como `Readonly` (snapshot copiado en `run`): la respuesta lo expone para que el cliente vea CON QUÉ datos se evaluó la condición.

## Cola de aprobaciones (`GET /workflows/approvals[/:id]`)

- `approval:read` para listar/detalle; `approval:approve` SOLO para `POST …/decision` (leer ≠ decidir, verificado en tests).
- Filtros combinables (`status`, `workflowId`, `entityType`, `entityId`); detalle con id inválido → `400`, inexistente/ajeno → `404`.

## Evento `WorkflowCompleted` (ADR-007)

- Bus **in-process tipado** en `core/events/event-bus.ts` con el catálogo inicial de `events-jobs.md` (7 eventos; emitir algo no declarado no compila). FASE 14 **solo emite `WorkflowCompleted`** al decidir (no en `skipped` ni en `run`): el resto de emisores (FASE 8–13) no emiten — su cableado requiere outbox.
- `emit` es awaited después del commit; los handlers se invocan en orden de registro y **un fallo se aisla** (no rompe la respuesta; se loguea con nivel `error`).
- **`eventsOutbox`/`jobs` NO implementados** (diferido): transporte `in-process` con entrega solo en memoria (si el proceso muere entre commit y handler, el evento se pierde — `deferred`/outbox de ADR-007 queda pendiente). Los handlers deben ser **idempotentes por `eventId`**.

## Auditoría (FASE 7)

- **Definiciones**: `workflow.create`; `workflow.update` (`reason: archived:true`); `workflow.restore` (`reason: archived:false`).
- **Instancias**: `workflow.instance.create` (`reason: awaiting_approval:*`→`state:awaiting_approval` / `state:skipped`).
- **Decisiones**: `approval.decide` (`reason: decision:approved` / `decision:rejected`, `previousValue {status:'pending'}` → `newValue` con el estado decidido).

## Errores

| Caso                                                                                                                                                                                                                                                                                             | HTTP | Código             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------------------ |
| Sin token / inválido / sesión revocada                                                                                                                                                                                                                                                           | 401  | `UNAUTHENTICATED`  |
| Sin `<recurso>:permiso` / `pv` viejo                                                                                                                                                                                                                                                             | 403  | `FORBIDDEN`        |
| Body/params/query inválidos (enums, ids, `No valid fields to update`, `value`-vs-operador, `key` inválida; `tenantId`/`archived`/`key`/`trigger`/`condition`/`action`/`status`/`instanceId`/`decidedBy`/`state`/`workflowId`)                                                                    | 400  | `VALIDATION_ERROR` |
| Definición/solicitud/instancia inexistente o de otro tenant (uniforme)                                                                                                                                                                                                                           | 404  | `NOT_FOUND`        |
| `Condition field missing in context` (`details {field}`); `Condition field type does not match the operator` (`details {field, operator}`)                                                                                                                                                       | 422  | `DOMAIN_ERROR`     |
| `Key already exists`; `Workflow is archived`; `Trigger does not match the document type` (`details {expected, received}`); `Approval is already pending for this document`; `Status is already the requested one`; `Invalid status transition`; `Workflow is already archived`/`is not archived` | 409  | `CONFLICT`         |
| `DELETE` de definiciones; `PATCH`/`DELETE` de solicitudes; `GET /workflows/instances/:id` (rutas no publicadas)                                                                                                                                                                                  | 404  | `NOT_FOUND`        |

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): (a) `run` son 2 escrituras (ventana de instancia `awaiting` sin solicitud documentada arriba); (b) la decisión encadena 2 transiciones + evento — la ventana intermedia es **autocurable por reintento** pero no probada con caídas reales; (c) sin FK real en BD (`entityId`/`workflowId`/`instanceId` validados solo en la aplicación, opacos por diseño).
- **PARTIAL**: bus **in-process sin outbox** (`eventsOutbox`/`jobs`/modo `deferred` de ADR-007 NO implementados): si el proceso muere tras el commit de la decisión y antes del handler, el `WorkflowCompleted` se pierde (los otros 6 eventos del catálogo no se emiten aún — sus módulos no lo cablean); sin `Idempotency-Key` (un reintento de red en `POST run` con contexto no-match crea otra instancia `skipped` — inofensivo pero conteable).
- **NOT IMPLEMENTED** (diferido y documentado): **disparadores automáticos por `trigger.event`** — FASE 14 implementa la evaluación bajo demanda (`POST /run`); conectar los eventos de otros módulos a `runWorkflow` exige outbox (los emisores FASE 8–13 no emiten) y would-risk-loop (`WorkflowCompleted` → `runWorkflow`); **selección/escalado de aprobadores** (hoy snapshot informativo del rol, sin asignación de usuarios ni historial de rutas multi-aprobador); acciones distintas de `request_approval` (el catálogo no define permisos ni efectos adicionales); webhooks/salidas externas.
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; concurrencia NO ejercitada (dos `decision` simultáneas con distinto resultado, carrera `run` vs `run` sobre el mismo documento — la protección es el índice único parcial, no ejercitado en paralelo).
- **RISK**: paginación por offset; sin índice de texto ni búsqueda `q` en definiciones; una solicitud pendiente bloquea re-ejecuciones del mismo documento hasta decidir (no hay endpoint de cancelación — habría que decidir para liberar); `approverRole` no se valida contra los roles reales del tenant (opaco sin FK, por diseño); vulnerabilidades dev preexistentes de `vitest` (`npm audit` ejecutado aparte — ver reporte de fase).
