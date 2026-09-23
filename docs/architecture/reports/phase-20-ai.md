# Reporte de fase — FASE 20 · AI (tools de lectura + registro de gobernanza)

Fecha: 2026-09-23 · Commits previos: `760cf5e` (FASE 19) · QA gate: `npm run qa`

## ESTADO

**COMPLETADA** — QA EXIT=0 (typecheck, lint, format:check, test, build) en los **intentos 3 y 4** (el 4 = cierre tras añadir este reporte; ambos con 585/585). Intento 1: EXIT=1 por un fallo REAL de lint (import `Model` sin usar en `ai-repository.ts`) → corregido. Intento 2: EXIT=1 con **7 fallos en cascada en `tests/integration/hr.test.ts`** (colas de la cascada: `attA1Id` vacío → 200 en listado en vez de 404, auditoría `total 0`); el archivo pasó **aislado 10/10** y la suite completa pasó al reintentar (`npm run test` → EXIT=0 y QA → EXIT=0) — el **detonante no está identificado** (el primer fallo se perdió en el truncado del output); posible contención de recursos bajo carga paralela con 71 archivos + mongodb-memory-server. Registrado como RIESGO (flakiness observado UNA vez). `npm audit --omit=dev` → **0 vulnerabilidades** (dev: 2 moderadas preexistentes de vitest, sin regresar).

## RESUMEN

- Módulo `apps/api/src/modules/ai` (domain/application/infrastructure/presentation + `index.ts`): **1 colección** (`aiInteractions`), **1 montaje** `/api/v1/ai` con **rutas PROPIAS** (no CRUD): **4 endpoints** — `GET /tools`, `GET /interactions`, `GET /interactions/:id`, `POST /interactions`. **Sin PATCH/DELETE publicados** (404): el registro de gobernanza es **inmutable**.
- **Permisos SIN bump**: la única clave de las 4 rutas, `ai:use`, entró en el catálogo inicial de FASE 6 (`d5d8753`, verificado con `git log -S`) → **pv sigue en 2, sin re-login**; además las tools exigen permisos YA existentes → **cero altas de catálogo**.
- **3 tools de LECTURA** (ADR-008), registradas en `application/tool-registry.ts` con contrato Zod + `requiredPermissions` declarados:
  1. `crm.search` — `requiredPermissions: []`; filtra **por tipo dentro** con `<recurso>:read` (misma semántica que `GET /search`; sin permiso CRM → `results: []` en 201).
  2. `reports.sales_kpis` — `['report:read', 'sales.invoice:read', 'customer:read']` derivados de `REPORT_UNDERLYING_PERMISSIONS.sales` (compilación + test de sincronía); mismas reglas de rango (`checkDateRange`: `from ≤ to`, 366d/120m) y **resultado objeto-idéntico** a `GET /reports/sales` (aserción de paridad en test).
  3. `hr.salaries` — `['hr.salary:read']` (lectura sensible: Mismo permiso que `GET /salaries`, regla ADR-008).
- **Capa de permisos de la tool** dentro del handler (el permiso depende del body, no de la ruta): faltante → `403 Missing permission` con el **primer** faltante de la cadena (AND), mismo formato que `requirePermission`; evalúa ANTES del contrato Zod.
- **Registro `aiInteractions`**: interacción = intento con contrato **VÁLIDO** — tool desconocida (`400 Unknown tool`), permiso faltante (`403`) y args inválidos (`400 Invalid tool arguments`) **NO** se registran (verificado: total intacto); ejecución OK → `completed` con `result`; ejecución fallida → `failed` + el error original se **re-propaga** (el registro jamás lo enmascara). `prompt` redactado (controles fuera, blancos → `null`, ≤2000 con `…`) y `error` ≤300.
- **Path determinista a `failed`**: `crm.search` con `q:'   '` (len 3) **pasa** el contrato (min 2) → `sanitizeSearchTerm` rechaza dentro → `400 Invalid search term` + registro `failed` (test).
- **`auditLog` intacto**: los tools de lectura NO escriben en auditoría (el ADR ata el auditLog a la "acción final" = escrituras futuras) — verificado `GET /audit?entityType=ai_interaction` → `total 0` mientras otras entidades sí registran (`total ≥ 2`).
- **Refactor CRM (reutilización sin duplicar)**: la lógica de `GET /search` se extrajo de `search-routes.ts` a `crm/application/search-service.ts` (`searchCrm(tenantId, options, permissions)`); ruta y tool comparten UNA implementación — test: `GET /search?...` y el `result` de la tool devuelven objetos **iguales**. Sin cambios de ruta ni mensajes.
- **Aislamiento**: tenant B no ve datos (`results: []`, `total: 0` de nómina) ni interacciones de A (`404` uniforme); `?tenantId=` y body `tenantId` descartados (STRIP/strictObject).

## ARCHIVOS

- **Nuevo módulo AI (12)**: `apps/api/src/modules/ai/{index.ts, domain/entities/ai-interaction.ts, domain/rules/{ai-rules.ts, ai-rules.test.ts}, application/{tool-registry.ts, tool-registry.test.ts, ai-service.ts, ai-validators.ts}, infrastructure/schemas/{types.ts, collections.ts}, infrastructure/repositories/ai-repository.ts, presentation/{validators/ai-validators.ts, routes/ai-routes.ts}}` — repositorio **solo `create` + lecturas** (inmutable garantizado en la capa de datos).
- **Refactor CRM (3)**: nuevo `crm/application/search-service.ts`; `crm/presentation/routes/search-routes.ts` adelgazado; exports en `crm/index.ts`.
- **Reporting (1)**: `reporting/index.ts` ampliado (`getSalesReport`, `REPORT_UNDERLYING_PERMISSIONS`, `checkDateRange`, `isValidReportDate`, tipos) para que la tool consuma la MISMA superficie que la ruta.
- **Composition root**: `apps/api/src/index.ts` (monta `createAiRouters`).
- **Tests (2)**: `tests/integration/ai.test.ts`, `tests/security/ai-security.test.ts`.
- **Docs (6)**: nuevos `docs/api/ai.md`, `docs/database/ai.md`; modificados `docs/api/conventions.md` (fila 20 sustituyendo el placeholder + nota en `/search`), `docs/security/permission-matrix.md` (7 filas + nota sin-bump FASE 20), `docs/architecture/database.md` (fila `aiInteractions`), este reporte.

## APIs

4 endpoints: `GET /api/v1/ai/tools` · `GET /api/v1/ai/interactions` · `GET /api/v1/ai/interactions/:id` · `POST /api/v1/ai/interactions` — todos con `requirePermission('ai:use')` (incluye chequeo de `pv`); el POST añade la capa `requiredPermissions` de la tool elegida. Sin PATCH/DELETE → 404.

## COLECCIONES

`aiInteractions` (1 nueva).

## ÍNDICES

**3**: `{tenantId, createdAt:-1}` (listado) · `{tenantId, tool, createdAt:-1}` (`?tool=`) · `{tenantId, status, createdAt:-1}` (`?status=`). Sin claves únicas (append-only), `tenantId` primero (ADR-002).

## TESTS

- **Total suite: 585 PASSED / 71 archivos** (base FASE 19: 554/67 → **+31**, +4 archivos).
- **Nuevos FASE 20: 31** — unit `ai-rules.test.ts` **7** (orden `completed/failed`, `stripControls` por code-point conservando tab/nl/cr, `redactPrompt` null/vacios/controles/truncado 2000, `truncate` con longitud exacta sin cambios, `redactError`); unit `tool-registry.test.ts` **9** (catálogo EXACTO de 3 tools, cadenas de permisos de las 3, contratos: `q` min 2, fechas calendario, `groupBy`, `period`); integración `ai.test.ts` **9** (catálogo; `crm.search` con datos + paridad con `/search`; historial/filtros/detalle/STRIP; `failed` determinista; violaciones NO registran; paridad EXACTA con `GET /reports/sales` + `from>to`; `hr.salaries` con datos; aislamiento A/B + `?tenantId=`; auditoría intacta); seguridad `ai-security.test.ts` **6** (401×4 rutas + token manipulado; 403 `ai:use` en las 4 con `details.permission`; capa de permisos `report:read`/`sales.invoice:read`/`hr.salary:read` + `crm.search` 201 con solo `ai:use` + total 1; pv obsoleta con `toBe(2)` + `/auth/me` 200; entrada estricta/tool desconocida/mal id/PATCH-DELETE 404/`/agents` 404; sin `tenantId`).
- `npm run qa` → **EXIT=0** (intentos 3 y 4).

## ERRORES

- **Intento 1 de QA: EXIT=1** — lint: `'Model' is defined but never used` en `ai-repository.ts:1` (import de tipos sobrante). Corregido quitándolo del import.
- **Intento 2 de QA: EXIT=1** — **7 tests de `tests/integration/hr.test.ts` fallaron en cascada** (archivo VERDE en FASE 19 y en esta fase: aislado 10/10, y suite completa 585/585 al reintentar ×2). Colas visibles: `attA1Id` vacío → `GET /attendance/` con ID vacío devuelve 200 (listado) en vez de 404; auditoría `attendance.create` `total 0` (creación previa no ocurrida). **Detonante NO identificado** (el primer fallo se perdió en el truncado del output); hipótesis sin confirmar: contención de recursos bajo carga (71 archivos en paralelo, mongodb-memory-server + argon2). **NO** se tocó el archivo HR ni las reglas de HR.
- Typecheck: EXIT=0 desde el segundo pase (1 error TS2307 de path en `tool-registry.test.ts` corregido ANTES del QA; 3 × TS2532 `noUncheckedIndexedAccess` en el test de integración corregidos con `?.`).
- Fallo REAL de aserción en unit: `truncate('abcdef', 6)` esperaba `'abcde…'` pero la semántica (coherente con `redactPrompt`) es "si cabe (incluso en longitud exacta) → sin cambios" → corregió el TEST, no la regla.

## CORRECCIONES

1. **Lint `ai-repository.ts`**: eliminado el import `type Model` sin uso.
2. **`tool-registry.test.ts`**: path de import `'../../../reporting/index.js'` → `'../../reporting/index.js'` (un nivel de más; el módulo y su test usan rutas distintas).
3. **`ai-rules.test.ts`**: aserción de `truncate` ajustada a la semántica real (`<= max` → sin cambios, igual que `PROMPT_MAX`); añadido caso de longitud exacta.
4. **`ai.test.ts`**: acceso indexado defensivo (`tools[i]?.requiredPermissions`) por `noUncheckedIndexedAccess`.

## RIESGOS

- **PARTIAL**: **sin orquestador LLM** (proveedor de IA no integrado: sin claves/red) — la capa que elige la tool desde texto libre NO existe; contrato de ejecución, permisos y registro SÍ probados. Orquestador NOT TESTED.
- **PARTIAL**: "cartera vencida" (ejemplo del ADR-008) **NO** entregable: el dominio no modela vencimientos de CxC (solo `dueDate` de tareas projects) — sustituida por KPIs de ventas.
- **PARTIAL**: sin cuota/rate-limit **por tenant** en `/ai` (solo el rate limit global de autenticación por clave de login); sin TTL/retención en `aiInteractions` → crecimiento monótono (jobs no implementados).
- **PARTIAL**: redacción del `prompt` solo a nivel de formato (sin detección de PII).
- **RISK (nuevo, observado)**: **flakiness de suite bajo carga** — `hr.test.ts` falló 7 tests en 1 de las 4 ejecuciones del QA completo de esta fase, sin reproducirse aislado ni en los 3 reintentos; detonante no identificado. Si reincide, instrumentar (guardar log completo de cada corrida) antes de atribuirlo a regresión.
- **NOT TESTED**: `explain()` de los 3 índices sobre Atlas; proveedores LLM reales; tools de escritura (futuras); `apps/web`/`apps/mobile`/Atlas real.
- **RISK vigentes (sin regresar)**: sin transacciones Mongo, sin `Idempotency-Key`, outbox/jobs no implementados, paginación offset; dev audit 2 moderadas preexistentes (vitest); `department` sin FK; nómina sin contable/moneda; asistencia sin tz/calendario.

## PRÓXIMA FASE

**Cierre de monolito / fases de plataforma y cliente** según el PROMPT MAESTRO (FASE 20 era el último módulo funcional). `ai:use` y todos los permisos de las tools ya estaban en el catálogo → **pv sigue en 2**, sin re-login pendiente. Deuda documentada para escrituras futuras: confirmación humana + auditLog a la acción final + correlación con `aiInteractions`.
