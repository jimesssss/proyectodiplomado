# Reporte de fase — FASE 19 · HR (empleados, asistencia y nómina básica)

Fecha: 2026-09-23 · Commits previos: `952c666` (FASE 18) · QA gate: `npm run qa`

## ESTADO

**COMPLETADA** — QA EXIT=0 (typecheck, lint, format:check, test, build) en el **intento 2** (el 1 tuvo un fallo REAL: el campo `email` validaba `.email()` ANTES del `.trim()` → el fixture con espacios daba 400 y arrastraba el resto de tests con ids vacíos → 404). Corregido encadenando `.trim()` antes de `.email()`. `npm audit --omit=dev` → **0 vulnerabilidades** (dev: 2 moderadas preexistentes de vitest, sin regresar).

## RESUMEN

- Módulo `apps/api/src/modules/hr` (domain/application/infrastructure/presentation + `index.ts`): **3 colecciones** (`employees`, `attendance`, `salaries`), **3 montajes** `/api/v1/employees` + `/api/v1/attendance` + `/api/v1/salaries`, **13 endpoints**.
- **Permisos SIN bump**: `employee:*`, `attendance:*` y `hr.salary:*` entraron en el catálogo en FASE 6 (commit `d5d8753`, verificado con `git log -S` para los 3 grupos) → **pv sigue en 2, sin re-login**.
- **DELETE diferenciado por catálogo**: empleados **SÍ** tienen `employee:delete` → DELETE publicado = soft-delete (patrón CRM/product); asistencia y nómina **NO** tienen `:delete` → rutas DELETE **no publicadas (404)** y se archivan con `PATCH {archived}` (patrón bom/production.order/goods.receipt de FASE 16).
- **Empleado**: clave natural `code` normalizada/validada en servidor e **inmutable**, **única por tenant** (409 `Code already exists`); `email` **único por tenant** en minúsculas (409 `Email already exists`); máquina laboral `active ↔ inactive → terminated` — `terminated` **terminal** congela los campos de negocio (409 `Only non-terminal employees can be edited`); FK `userId` → `findUserInTenant` → 400 `Unknown user`; `department` = texto (**PARTIAL**: FK a Organization no implementada).
- **Asistencia**: UN registro por empleado por **DÍA** (fecha truncada a medianoche UTC, 409 si se repite), horas `HH:MM` con `checkOut ≥ checkIn` (la pareja EFECTIVA se revalida en cada PATCH → 400 `checkIn is required when checkOut is set` / `checkOut must be on or after checkIn`), **`status` `open|closed` derivado** de `checkOut` (no persistido, patrón `dueAt` FASE 18), filtros `?employeeId=&from=&to=` con coherencia `from > to` → 400; `employeeId`/`date` inmutables.
- **Nómina básica**: UN renglón por empleado por **PERÍODO `YYYY-MM`** (409 `Salary record already exists for this period`), importes con `roundMoney` (2 decimales) y **`netAmount` derivado** (`roundMoney(base + bonus − deduction)`, recalculado en cada lectura), `employeeId`/`period` inmutables, neto negativo permitido (anticipo — documentado).
- **FK de empleado**: inexistente/ajeno → **404 uniforme** (patrón projects); **archivado** → **409 `Employee is archived`** al crear asistencia/nómina (paralelo a `Project is archived` de FASE 17).
- Empleado archivado NO bloquea la edición de registros existentes de asistencia/nómina (solo el alta).

## ARCHIVOS

- **Nuevo módulo (14)**: `apps/api/src/modules/hr/{index.ts, domain/entities/{employee,attendance,salary}.ts, domain/rules/{hr-rules.ts, hr-rules.test.ts}, infrastructure/schemas/{types.ts, collections.ts}, infrastructure/repositories/hr-repository.ts, application/{employee,attendance,salary}-service.ts, presentation/validators/hr-validators.ts, presentation/routes/hr-routes.ts}`.
- **Composition root**: `apps/api/src/index.ts` (monta `createHrRouters`).
- **Tests (2)**: `tests/integration/hr.test.ts`, `tests/security/hr-security.test.ts`.
- **Docs (5)**: nuevos `docs/api/hr.md`, `docs/database/hr.md`; modificados `docs/api/conventions.md` (fila 19), `docs/security/permission-matrix.md` (4 rutas + nota sin-bump FASE 19), `docs/architecture/database.md` (fila `employees`·`attendance`·`salaries`).

## APIs

13 endpoints: `GET/POST/GET:id/PATCH:id/DELETE:id /api/v1/employees` (`employee:*`); `GET/POST/GET:id/PATCH:id /api/v1/attendance` (`attendance:*`, sin DELETE → 404); `GET/POST/GET:id/PATCH:id /api/v1/salaries` (`hr.salary:*`, sin DELETE → 404).

## COLECCIONES

`employees`, `attendance`, `salaries` (3 nuevas).

## ÍNDICES

**12**: `employees` {tenantId, code} unique, {tenantId, email} unique, {tenantId, createdAt:-1}, {tenantId, archived, createdAt:-1}, {tenantId, status, createdAt:-1} · `attendance` {tenantId, employeeId, date} unique, {tenantId, date:-1}, {tenantId, archived, date:-1} · `salaries` {tenantId, employeeId, period} unique, {tenantId, createdAt:-1}, {tenantId, period, createdAt:-1}, {tenantId, archived, createdAt:-1}.

## TESTS

- **Total suite: 554 PASSED / 67 archivos** (base FASE 18: 526/64 → **+28**, +3 archivos).
- **Nuevos FASE 19: 28** — unit `hr-rules.test.ts` **12** (máquina+terminal, código/email normalizados y validados, límites, `HH:MM`, orden salida≥entrada, día UTC, período `YYYY-MM`, `computeNetPay` con redondeo); integración `hr.test.ts` **10** (alta/defaults/recortes/validaciones; clave natural únicas por tenant + code inmutable; máquina con `terminated` congelado; soft-delete+filtros; asistencia día único+FK+horas+`Employee is archived`; fichajes/abrir/inmutables/sin DELETE/rangos; nómina única+neto derivado+validaciones; PATCH neto recalculado/sin DELETE; aislamiento A/B; auditoría con `reason status:terminated`); seguridad `hr-security.test.ts` **6** (401 en 13 rutas + token manipulado, 403 matrix con `details.permission` por verbo, leer no implica escribir, pv obsoleta con aserción `PERMISSION_CATALOG_VERSION === 2` + re-login NO exigido, entrada estricta + DELETE diferenciado 404/200/409, sin `tenantId`).
- `npm run qa` → **EXIT=0**.

## ERRORES

- **Intento 1 de QA: EXIT=1** — CASCADA de un único fallo real: `emailField = z.string().min(3).max(254).email(...)` validaba el formato **antes** de recortar → `' Ana.Torres@Example.COM '` (con espacios del fixture) → `400 Invalid email` en el alta → `employeeA1Id` quedaba vacío → los 9 tests posteriores fallaban con 404 en `/api/v1/employees/`. **NO** fue error de lint ni de reglas de dominio.
- Typecheck: EXIT=0 desde el primer pase (módulo completo). Un import erróneo (`entities/index-entities.js`, inexistente) se detectó y corrigió ANTES del primer typecheck.
- La aserción de email en minúsculas/`code` normalizado pasó tras la corrección (la normalización del servicio ya era correcta).

## CORRECCIONES

1. **`hr-validators.emailField`**: `.trim()` encadenado ANTES de `.email()` (mismo orden ya verificado para `.trim().min(1)` en zod 4.6.5): el formato valida sobre el recortado y el servicio pasa a minúsculas. Documentado en el propio validador.
2. (Herencia de FASE 18, ya commiteada): fix de `error-handler` (mongoose → 400/409) y `numbering` (retry E11000) beneficiaron esta fase sin cambios nuevos.

## RIESGOS

- **PARTIAL**: `department` como texto — FK a departamentos de Organization NO implementada (la superficie pública de Organization no expone búsqueda por kind) y sin filtro `?department=`.
- **PARTIAL**: nómina básica **sin integración contable** (no genera asientos, no usa `fiscalPeriods`) y **sin moneda** (importes con 2 decimales, moneda implícita); `netAmount` negativo permitido sin topes salariales.
- **PARTIAL**: asistencia en hora **local sin zona** (`HH:MM`), sin calendario laboral/turnos/horas extra/vacaciones; unicidad incluye archivados (archivar no libera el día/período — decisión documentada).
- **NOT TESTED**: `explain()` de los 12 índices sobre Atlas; volumen alto de asistencia; `apps/web`/`apps/mobile`/Atlas real.
- **RISK vigentes (sin regresar)**: sin transacciones Mongo multi-documento, sin `Idempotency-Key`, outbox/jobs no implementados, paginación offset; dev audit 2 moderadas preexistentes (vitest).

## PRÓXIMA FASE

**20 AI** (`ai:use` — en el catálogo desde v1, `git log -S` = `d5d8753` → sin bump, pv sigue en 2): último módulo funcional; tras ella, cerrar el monolito (o seguir con las fases de plataforma/cliente según el PROMPT MAESTRO) con docs + tests + QA + commit por fase.
