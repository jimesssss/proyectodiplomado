# Reporte de fase — FASE 18 · SERVICE (tickets de soporte)

Fecha: 2026-09-23 · Commits previos: `799ce09` (FASE 17) · QA gate: `npm run qa`

## ESTADO

**COMPLETADA** — QA EXIT=0 (typecheck, lint, format:check, test, build) en el intento 2 (el 1 tuvo 1 error lint). `npm audit --omit=dev` → **0 vulnerabilidades** (dev: 2 moderadas preexistentes de vitest, sin regresar).

## RESUMEN

- Módulo `apps/api/src/modules/service` (domain/application/infrastructure/presentation + `index.ts`): **1 colección** (`tickets`), **1 montaje** `/api/v1/tickets`, **5 endpoints** (GET/POST/GET:id/PATCH:id/**DELETE:id**).
- **Ticket numerado por el servidor**: serie `ticket` de `core/numbering` → `TK-YYYY-000001`, única por tenant (`$inc` atómico; carrera de upsert con reintento único — corrección de core, ver más abajo).
- **Máquina de estados de soporte CON reapertura**: `open → in_progress → resolved → closed`, con `cancelled`; `resolved` NO es terminal (`resolved → in_progress` reabre y **limpia la nota**; `resolved → closed` cierra); `closed`/`cancelled` terminales → negocio congelado (`409 Only non-terminal tickets can be edited`).
- **`→ resolved` exige `resolution` NO vacía en el MISMO patch** (`400 Resolution is required to resolve a ticket`, sin escritura); la nota al cerrar persiste.
- **SLA derivado `dueAt`** (no almacenado, solo en la proyección pública): `createdAt + horas[prioridad]` — urgent 4 h, high 8 h, normal 24 h, low 72 h; cambiar prioridad desplaza el vencimiento.
- **FK `assigneeId`** → `findUserInTenant` → `400 Unknown user` (patrón CRM; Service → Identity, nunca al revés).
- **DELETE publicado = soft-delete** con `ticket:delete` (marca `archived`; doble → `409 Ticket is already archived`; restaurar audita `ticket.restore`).
- **Permisos `ticket:*` SIN bump**: `ticket:read/create/update/delete` entró en el catálogo en FASE 6 (commit `d5d8753`, verificado con `git log -S`) → **pv sigue en 2, sin re-login**. El pronóstico de FASE 17 ("grupo nuevo → bump 2→3") era FALSO y quedó corregido (ver CORRECCIONES).
- **Correcciones de core aplicadas en esta fase** (defectos latentes reales detectados al diseñar el módulo):
  1. `error-handler.normalizeError` ahora traduce `ValidationError`/`CastError` de mongoose → `400` y `MongoServerError` `11000` → `409` (antes: **500 INTERNAL_ERROR**). Un `name`/`subject`/`title` de solo espacios llegaba a `required` de mongoose → 500.
  2. Validadores de **projects** con `.trim()` en `name`/`title` (create y patch): blanco → `400` (verificado el orden de zod 4: `.trim()` corre ANTES del `min`) + 3 aserciones de regresión en `tests/integration/projects.test.ts`.
  3. `nextDocumentNumber` reintenta **una vez** ante `E11000` de carrera de upsert (dos altas concurrentes en la misma serie/año) — beneficia a todas las series numeradas (sales/purchasing/inventory/treasury/manufacturing/service).

## ARCHIVOS

- **Nuevo módulo (9)**: `apps/api/src/modules/service/{index.ts, domain/entities/ticket.ts, domain/rules/ticket-rules.ts, domain/rules/ticket-rules.test.ts, application/ticket-service.ts, infrastructure/schemas/types.ts, infrastructure/schemas/collections.ts, infrastructure/repositories/ticket-repository.ts, presentation/validators/ticket-validators.ts, presentation/routes/ticket-routes.ts}` (10 contando cada archivo).
- **Composition root**: `apps/api/src/index.ts` (monta `createServiceRouters`).
- **Core (2)**: `apps/api/src/core/http/error-handler.ts` (+ `error-handler.test.ts`), `apps/api/src/core/numbering/numbering.ts`.
- **Corrección projects (2)**: `.../projects/presentation/validators/project-validators.ts`, `tests/integration/projects.test.ts` (3 regresiones).
- **Tests (2)**: `tests/integration/tickets.test.ts`, `tests/security/tickets-security.test.ts`.
- **Docs (6)**: nuevos `docs/api/tickets.md`, `docs/database/tickets.md`; modificados `docs/api/conventions.md` (fila 18), `docs/security/permission-matrix.md` (2 rutas + nota sin-bump FASE 18), `docs/architecture/database.md` (fila `tickets`), `docs/architecture/reports/phase-17-projects.md` (corrección del pronóstico falso).

## APIs

5 endpoints bajo `/api/v1/tickets`: listar (`ticket:read`, filtros `status/priority/assigneeId/archived/page/limit`), crear (`ticket:create`), detalle (`ticket:read`), editar/transición/archivar (`ticket:update`), borrar = soft-delete (`ticket:delete`).

## COLECCIONES

`tickets` (1 nueva).

## ÍNDICES

**5**: `{tenantId, number}` unique, `{tenantId, createdAt:-1}`, `{tenantId, status, createdAt:-1}`, `{tenantId, archived, createdAt:-1}`, `{tenantId, assigneeId, createdAt:-1}`.

## TESTS

- **Total suite: 526 PASSED / 64 archivos** (base FASE 17: 502/61 → **+24**, +3 archivos).
- **Nuevos FASE 18: 24** — unit `ticket-rules.test.ts` **8**; unit `error-handler.test.ts` **+3** (mongoose → 400/409); integración `tickets.test.ts` **7** (alta/defaults/SLA, numeración por tenant + concurrentes distintos, máquina + resolución/reapertura/terminales, ediciones/FK, DELETE+filtros+query desconocida, aislamiento A/B, auditoría); seguridad `tickets-security.test.ts` **6** (401×5, 403 matrix con `details.permission`, leer≠escribir, pv obsoleta con aserción `PERMISSION_CATALOG_VERSION === 2`, entrada estricta + DELETE real 200/409, sin `tenantId`).
- **Regresiones añadidas a tests existentes**: 3 aserciones en `projects.test.ts` (nombre/título en blanco → 400, no 500).
- `npm run qa` intento 2 → **EXIT=0**.

## ERRORES

- Intento 1 de QA: **EXIT=1** — 1 error lint (`'ticketBId' is assigned a value but never used` en `tickets.test.ts`).
- Fallo intermedio de ejecución (antes del QA): el security test "sin `tenantId`" fallaba porque el **subject** del fixture decía literalmente `'Sin tenantId'` (el `toContain` matcheaba el contenido, no un filtro) — bug del TEST, corregido a `'Nuevo ticket'`.
- Las 4 aserciones nuevas de projects fallaron en un pase intermedio porque el `.trim()` del PATCH no se había aplicado (solo entró el del create) → corregido en los 2 PATCH (`name`/`title`).

## CORRECCIONES

1. **Core `error-handler`**: mongoose `ValidationError`/`CastError` → `400` con `details.issues` y `code 11000` → `409` (antes 500). Cubierto con 3 tests unitarios.
2. **Projects validadores**: `.trim()` en `name`/`title` (create y patch) — blanco → `400` estándar; 3 regresiones en integración.
3. **Core `numbering`**: reintento único ante carrera de upsert `E11000`.
4. **Doc falso de FASE 17 corregido**: `phase-17-projects.md` anunciaba "`ticket:*` grupo nuevo → bump pv 2→3 y re-login"; era FALSO (`git log -S` = commit `d5d8753`, FASE 6). Corregido en el propio reporte y anotado en `permission-matrix.md`.

## RIESGOS

- **PARTIAL**: SLA en horas de reloj (sin calendario laboral/feriados, sin escalado ni cálculo de `overdue`).
- **PARTIAL**: sin threads/comentarios de ticket (documento único); sin FK a customer (ticket interna del tenant).
- **PARTIAL**: PATCH con texto de solo espacios en módulos anteriores a FASE 18: el create ahora es 400 (fix de core) pero el PATCH de esos módulos no tiene `.trim()` → podría guardar `''` (calidad de dato, sin 500). Projects y Service sí lo cierran.
- **NOT TESTED**: reintunto `E11000` de numeración (defensivo, carrera difícil de provocar de forma determinista); `explain()` de los 5 índices sobre Atlas; volumen alto de colas; `apps/web`/`apps/mobile`/Atlas real.
- **RISK vigentes (sin regresar)**: sin transacciones Mongo multi-documento, sin `Idempotency-Key`, outbox/jobs no implementados, paginación offset; dev audit 2 moderadas preexistentes (vitest).

## PRÓXIMA FASE

**19 HR** (`employee:*`, `attendance:*`, `hr.salary:*` — todos en el catálogo desde v1 → verificar con `git log -S`; si no hubo bump, pv sigue en 2): módulo `hr` con empleados, asistencia y nómina básica, docs + tests (unit/integración/aislamiento/seguridad) + QA + commit. Después: **20 AI** (`ai:use`).
