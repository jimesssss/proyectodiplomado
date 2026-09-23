# Reporte de fase — FASE 14: WORKFLOW

## ESTADO

**COMPLETADA** (QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `workflow` montado bajo `/api/v1/workflows` (convenciones §4 fila 14, **9 endpoints**) + **bus de eventos tipado en core** (prerequisito ADR-007 que FASE 2 dejó PARTIAL):

- **Definiciones** `/workflows` (`workflow`: read/create/update, **sin `:delete`**): configuración POR DATOS `{key, name, trigger{event,entityType}, condition{field,operator,value}, action{type,approverRole}}`; `key` única POR tenant normalizada e **inmutable** (duplicado → `409 Key already exists`, otro tenant → `201`); `key`/`trigger`/`condition`/`action` **inmutables en PATCH** (→ `400`) para no romper instancias en vuelo; el **tipo de `value` vs operador se valida en la FUENTE** (superRefine → `400`); archivar/restaurar con guardias `409` (`PATCH {archived}`; ruta `DELETE` ausente → `404`).
- **Motor** `POST /workflows/:id/run` (`workflow:update`): evaluación bajo demanda de la condición sobre `{entityType, entityId, context}` con `entityId` **opaco** (ObjectId de cualquier módulo, sin FK). Pre-chequeos 404/409 (archivada; `trigger.entityType` ≠ payload → `409` con `details {expected, received}`); **condición no evaluable → `422 DOMAIN_ERROR`** (campo ausente → `'Condition field missing in context'`; tipo incompatible → `'…does not match the operator'` — **nunca asume `false`**); duplicado pendiente → `409` (pre-chequeo + **índice único parcial** `{tenantId, workflowId, entityId}` sobre `awaiting_approval` = at-most-once); **match → instancia `awaiting_approval` + solicitud `pending`** (2 escrituras, snapshot del `approverRole`); **no match → instancia `skipped` SIN solicitud** (evaluado, no aplica; auditable y NO bloquea re-ejecuciones).
- **Máquinas** (reglas puras): instancia `awaiting_approval → approved|rejected` (terminales + `skipped` terminal); solicitud `pending → approved|rejected`. `skipped` solo nace en `run`. **Sin creación/PATCH/DELETE de solicitudes** (solo el motor crea → rutas 404).
- **Aprobaciones** `GET /approvals[/:id]` (`approval:read`) + `POST /approvals/:id/decision` (**`approval:approve`** — separación explícita leer ≠ decidir). La decisión encadena **dos puertas condicionadas SIN transacciones**: instancia `transition` (puerta canónica; perdedora distinta → `409 Invalid status transition`, perdedora misma → sigue al paso 2) → solicitud `transition` (perdedora misma → `409 Status is already the requested one`, **sin emitir**); `decidedBy` = JWT `sub`. **Ventana intermedia autocurable por reintento** (diseño verificado: reintentar la MISMA decisión converge). `previousValue {status:'pending'}` persistido en auditoría.
- **Bus de eventos** `core/events/event-bus.ts` (nuevo, prerequisito honesto de esta fase): `ERPEventMap` con los **7 eventos del contrato** de `events-jobs.md` (emitir algo no declarado NO compila), envelope `{eventId: uuid, name, payload, occurredAt}`, handlers en orden de registro con **fallo AISLADO** (capturado + logueado, nunca rompe la respuesta), `emit` awaited tras el commit → **`WorkflowCompleted` exactamente UNO por decisión** (solo emite quien supera la 2ª puerta; no en `skipped`).
- **Diferidos documentados** (con honestidad): `eventsOutbox`/`jobs`/modo `deferred` de ADR-007 **NO implementados** (transporte solo-in-proceso: pérdida si el proceso muere tras el commit — ventana documentada); los otros 6 eventos **no se emiten** (los módulos FASE 8–13 no lo cablean); **disparadores automáticos por `trigger.event`** diferidos a outbox (conectar hoy → `WorkflowCompleted`→`runWorkflow` se looparía); selección/escalado de aprobadores (`approverRole` informativo sin FK), acciones ≠ `request_approval`, endpoint de cancelación de pendientes.

## ARCHIVOS

- `apps/api/src/core/events/` (event-bus.ts + event-bus.test.ts, nuevos).
- `apps/api/src/modules/workflow/` (domain/entities ×3 + rules + test, infrastructure/schemas ×2 + repository, application ×3, presentation/routes + validators, `index.ts`).
- `apps/api/src/index.ts` (+ montaje de `createWorkflowRouters`, 2 routers).
- Tests: `tests/integration/workflow.test.ts` (nuevo), `tests/security/workflow-security.test.ts` (nuevo), `apps/api/src/modules/workflow/domain/rules/workflow-rules.test.ts` (nuevo).
- Docs: `docs/api/workflows.md`, `docs/database/workflows.md` (nuevos), `docs/security/permission-matrix.md` (+5 rutas), `docs/api/conventions.md` (fila 14 desglosada), este reporte.

## APIs

9 endpoints nuevos (detallados en `docs/api/workflows.md`):

- `POST/GET /workflows`, `GET/PATCH /workflows/:id` (4, sin DELETE).
- `POST /workflows/:id/run` (1).
- `GET /workflows/:id/instances` (1).
- `GET /workflows/approvals`, `GET /workflows/approvals/:id` (2).
- `POST /workflows/approvals/:id/decision` (1).

Sin cambios en endpoints de otros módulos. Orden de montaje crítico: el router del motor va ANTES que el CRUD (para que `GET /workflows/approvals` no caiga en `GET /:id`).

## COLECCIONES

`workflows`, `workflowInstances`, `approvals` — **coinciden 1:1 con la fila de plataforma de `database.md`** (sin desviaciones de número). Sin serie de numeración (la `key` natural única por tenant sustituye al `number`).

**Diferidos documentados** (`docs/database/workflows.md`): `eventsOutbox`/`jobs`/notificaciones **SIGUEN DIFERIDAS** (Core quedó PARTIAL sin outbox — ADR-007); `approverRole` sin FK a `roles` (decidir no valida el rol del aprobador — solo `approval:approve`); acciones de workflow más allá de `request_approval`.

## ÍNDICES

11 índices con `tenantId` primero, todos con query justificada en `docs/database/workflows.md`: `workflows` (unique `key`, list, `?archived`), `workflowInstances` (list, `?state`, `?workflowId` + **unique parcial** `{tenantId, workflowId, entityId}` sobre `awaiting_approval` = respaldo at-most-once del duplicado), `approvals` (list, `?status`, `{tenantId, entityId, entityType}` + **unique parcial** `{tenantId, instanceId}` sobre `pending` = 1 solicitud pendiente por instancia).

## TESTS

- **QA real**: `npm run qa` (typecheck + lint + format:check + vitest + build) → **EXIT=0**; vitest **401 tests PASSED (52 archivos)**, typecheck 0, lint 0, prettier OK, build OK.
- **`npm audit` (ejecutado aparte — el script `qa` NO lo incluye)**: producción `npm audit --omit=dev` → **0 vulnerabilidades (EXIT=0)**; **`npm audit` completo → 2 vulnerabilidades MODERADAS preexistentes** en la cadena dev `vitest`/`@vitest/mocker` (fix = breaking `vitest@5`; FASE 14 NO modifica `package.json`/lockfile, verificado en `git diff`).
- Nuevos de FASE 14 (36):
  - **unit** `workflow-rules.test.ts` (13): máquinas instancia (`awaiting→approved|rejected`, terminales, `skipped` inalcanzable desde otros estados) y aprobación (`pending→approved|rejected`, terminales); `canArchive/Restore`; `normalizeKey/validateKey` (giones, 2–64, no-guion inicial); `evaluateCondition` con TODOS los operadores (numéricos match/no-match, `eq/ne` en 3 tipos, `contains`), campo ausente → `missing` (incluye el caso `constructor` vía `hasOwn` — sin falsos positivos de prototipo), tipo incompatible → `mismatch`; catálogos (7 disparadores, 7 operadores, 2 decisiones); `toPublic*` de los 3 tipos **sin `tenantId`** y snapshot del contexto.
  - **unit** `event-bus.test.ts` (6): envelope (`eventId` uuid, `name`, `payload`, `occurredAt`); emit SIN handlers resuelve; NO cruza eventos; handlers en orden de registro + `off()` remueve; **fallo de UNO aísla**: `onError(error, event)` recibe ambos y el SIGUIENTE handler corre; superficie de la instancia singleton.
  - **integration** `workflow.test.ts` (9): definiciones (key normalizada `big approval`→`BIG-APPROVAL`, duplicado mismo tenant → 409, otro tenant → 201, `key` inválida → 400 con regla del dominio, `value`/`event`/`field`/`action` inválidos → 400, inyecciones `tenantId`/`archived` → 400, 4 inmutables en PATCH → 400, nombre+`description:null` editables, `PATCH {}` → 400, DELETE/PUT → 404, ciclo archivar/restaurar con dobles → 409 y filtros `?archived`); run con match (instancia `awaiting` + solicitud `pending` con snapshot `gerente`, cola por `entityId`, duplicado → 409, auditoría `state:awaiting_approval`); guardas (trigger ≠ tipo → 409 con `details`, archivada → 409, desconocida → 404, id inválido → 400, NADA escrito); condición (ausente → **422 con `details {field}`**, tipo → **422 con `details {field, operator}`**, no-match → `skipped` SIN solicitud, re-run de `skipped` permitido ×2, auditoría `state:skipped`); decisión approve (máquina, `decidedBy`=JWT `sub`, `decidedAt`, comentario, **evento `WorkflowCompleted` UNO con payload exacto**, segundo intento → 409 `'Status is already the requested one'`, cruzado → 409 `'Invalid status transition'`, decisión `bogus` → 400, id desconocido → 404); decisión reject (re-ejecución con match tras `skipped` crea la 2ª solicitud, rechazo emite SU evento, terminales en ambos); listados (instancias `?state` = 4 totales y 0 pendientes, aprobaciones `?status/?workflowId/?entityId/?entityType`, 404/400); aislamiento (B: 404 en los 4 puntos + `run`/`decisión` cruzados → 404, listas SOLO lo propio, motor de B independiente); auditoría (`workflow.create`, `workflow.update` `archived:true`, `workflow.restore` `archived:false`, `workflow.instance.create`, `approval.decide` `decision:approved` con **`previousValue.status='pending'`**, sin fugas A→B).
  - **security** `workflow-security.test.ts` (8): 401 en las 8 superficies (2 listas, 2 detalles, create, run, decisión, patch) + token manipulado; 403 con `details.permission` en **8 casos** (los 8 endpoints); **separación `workflow:*` ≠ `approval:*`** (configurador crea/lista/ejecuta pero la cola y decidir → 403 `approval:read`/`approval:approve`; aprobador lee y decide PERO no lee ni parchea `workflow:*` → 403 `workflow:read`/`workflow:update` — y decide exitosamente SIN ser el owner); `pv` obsoleto → 403 re-login (y `/auth/me` sigue operativo); inyecciones (4 en create, 5 inmutables+server-only en PATCH, 4 en run, 4 en decisión) → 400 todos; inválidos (event/operator/`value`-vs-operador/`key` de dominio/`decision`/filtros/`page=0`/entityId/contexto anidado) → 400 y guardas de dominio (archivada → 409, ausente → **422**, doble decisión → 409 efecto-único, 404 desconocidos) **nunca 500**; ids/queries inválidos → 400 y **rutas ausentes → 404** (DELETE/PUT de definiciones; PATCH/DELETE/POST/PUT de solicitudes; `PATCH /:id/run`; `DELETE /:id/instances`; sub-ruta de detalle de instancia); 5 respuestas sin `tenantId`/secretos.
- Regresión: los **365 tests previos siguen verdes** (48 archivos).

## ERRORES

`npm run typecheck` → 0; `npm run lint` → 0 (tras correcciones listadas abajo); `format:check` → 0 (prettier aplicado); QA completo EXIT=0.

## CORRECCIONES

Durante el desarrollo de la fase (antes del QA final):

1. **3 imports sin uso** (`workflow-service.ts` `Workflow`, `schemas/types.ts` `Approval`, `workflow-routes.ts` `PublicApproval`) → eliminados (lint 0).
2. **Comentario `eslint-disable` sobrante** en `workflow-rules.ts` (`eq/ne`): el guard ya garantiza los tipos y el directive no aplica → quitado (habría sido flagged por `reportUnusedDisableDirectives`).
3. **Test unitario sobre-especificado propio** (`workflow-rules.test.ts`): assert de identidad de copia defensiva en `toPublicWorkflowInstance().context` — el patrón del código (y de `toPublicWorkflow` con `trigger`) devuelve referencias con tipos `Readonly`; se reemplazó por la aserción relevante (snapshot correcto + ausencia de `tenantId`). **No era un bug del código**: primera ejecución 12/13, tras el fix 13/13 y QA completo verdes (determinista, no flaky).
4. **Prettier**: 13 archivos (los nuevos + 4 docs editados) sin formatear en el primer `format:check` → `npm run format` y QA relanzado EXIT=0.

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): (a) `run` = 2 escrituras (ventana de instancia `awaiting` SIN solicitud — curable solo en BD, el pre-chequeo la bloquea con 409); (b) decisión = 2 transiciones + evento (ventana intermedia autocurable por reintento, no probada con caídas reales); (c) sin FK real en BD (`entityId`/`workflowId`/`instanceId` opacos y validados solo en la aplicación — por diseño genérico).
- **PARTIAL**: bus **in-process SIN outbox** (`eventsOutbox`/`jobs`/`deferred` de ADR-007 NO implementados): el `WorkflowCompleted` se pierde si el proceso muere tras el commit y antes del handler (hoy sin suscriptores externos); los otros 6 eventos del contrato están declarados pero NO emitidos (los módulos FASE 8–13 no lo cablean); handlers idempotentes por `eventId` queda como requisito de futuros suscriptores; sin `Idempotency-Key`.
- **NOT IMPLEMENTED** (diferido y documentado): **disparadores automáticos por `trigger.event`** (la evaluación HOY es bajo demanda vía `POST /run`; conectar eventos → `run` exige outbox y riesgo de loop `WorkflowCompleted`→`run`); **selección/escalado de aprobadores** (`approverRole` informativo sin FK; decidir no valida el rol; una solicitud pendiente bloquea re-ejecuciones del documento y **no hay endpoint de cancelación** — hay que decidir para liberar); acciones ≠ `request_approval`; webhooks.
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; concurrencia NO ejercitada (dos `decision` simultáneas con resultados cruzados — la protección es la doble transición condicionada, no ejercitada en paralelo; dos `run` simultáneos sobre el mismo documento — respaldados por el índice único parcial, no ejercitado en paralelo).
- **RISK**: paginación por offset; sin índice de texto ni búsqueda `q`; `workflowInstances`/`approvals` sin poda/retención; vulnerabilidades **moderadas dev preexistentes** de `vitest` (arriba).

## PRÓXIMA FASE

**FASE 15 — REPORTING**: rutas `/reports` (convenciones fila 15). El catálogo **SÍ define** el grupo `report: ['report:read', 'report:export']` (verificado en `packages/permissions/src/index.ts`) → sin bump de `pv`; alcance por confirmar contra `reporting-ai-integrations.md`/`database.md` antes de escribir (regla de la fase: revisar permisos/colecciones primero).
