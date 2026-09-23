# API — AI (`/api/v1/ai`) — FASE 20

Estado: implementado. Módulo `apps/api/src/modules/ai` (ADR-008); colección e índices en `docs/database/ai.md`. Catálogo de permisos **SIN CAMBIOS**: `ai:use` entró en el catálogo inicial de FASE 6 (commit `d5d8753`, verificado con `git log -S` → `pv` sigue en **2**, sin re-login — ver `docs/security/permission-matrix.md`).

## Arquitectura (ADR-008)

```
Usuario → AI Agent → Permission Layer (permisos RBAC del usuario + tenantId del JWT)
        → Tool autorizada (contrato Zod) → ERP → resultado
```

- **Nunca acceso directo a MongoDB**: la IA solo invoca tools REGISTRADAS con contrato de entrada/salida (Zod) y `requiredPermissions` declarados; el tenant SIEMPRE es el del JWT.
- **FASE 20 = tools de LECTURA primero** (búsqueda, KPIs, nómina), como pide el ADR. Las de escritura (IA propone → usuario confirma → ERP ejecuta → audit log) quedan para fases futuras.
- **PARTIAL**: el orquestador LLM (elegir la tool a partir de texto libre) **NO** está integrado — sin proveedor/claves/red. La API entrega el contrato que consumirá (`tool` + `args` + `prompt` opcional); el registro de gobernanza y la capa de permisos SÍ están implementados y probados.

## Endpoints (4 — montaje único `AI_ROUTE_PATH = /api/v1/ai`)

| Acción                          | Ruta                       | Permiso de ruta                                                                   |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| catálogo de tools (sin datos)   | `GET /ai/tools`            | `ai:use`                                                                          |
| historial de interacciones      | `GET /ai/interactions`     | `ai:use`                                                                          |
| detalle de UNA interacción      | `GET /ai/interactions/:id` | `ai:use`                                                                          |
| ejecutar UNA tool + registrarla | `POST /ai/interactions`    | `ai:use` **+ `requiredPermissions` de la tool** (capa ADR-008 dentro del handler) |

- **Sin `PATCH` ni `DELETE` publicados** (peticiones → **404**): el registro de gobernanza es **inmutable** (el catálogo solo tiene `ai:use`, sin `:update`/`:delete`). Cadena por ruta: auth → `requirePermission('ai:use')` (incluye chequeo de `pv`) → Zod estricto → handler.
- El permiso de la tool depende del **body**, no de la ruta → se evalúa en `runAiTool` con el MISMO formato que `requirePermission`: faltante → `403 Missing permission` + `details.permission` = **primer** permiso faltante de la cadena (AND).

## Las 3 tools de lectura (registro `application/tool-registry.ts`)

| Tool                 | `requiredPermissions`                                  | Contrato `args` (strictObject)                                          | Ejecuta                                              |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `crm.search`         | `[]` (filtra **por tipo dentro**: `<recurso>:read`)    | `q` 2-100, `types?` (coma), `limit?` 1-50                               | `searchCrm` — **la MISMA función** que `GET /search` |
| `reports.sales_kpis` | `report:read` + `sales.invoice:read` + `customer:read` | `from`/`to` `YYYY-MM-DD` de calendario, `groupBy` day\|month, `status?` | `getSalesReport` (reporting)                         |
| `hr.salaries`        | `hr.salary:read` (lectura **sensible**, ADR-008)       | `period?` `YYYY-MM`, `page?`, `limit?` 1-100                            | `listSalaries` (hr)                                  |

- **`crm.search`**: refactor FASE 20 extrajo la lógica de `GET /search` a `crm/application/search-service.ts`; ruta y tool comparten UNA implementación (verificado: `GET /search?q=…` y el `result` de la tool devuelven objetos **iguales** en test). Cada tipo aparece SOLO con su `<recurso>:read` (denegación por defecto, sin 403 global — idéntico a la ruta). Ejecutar sin NINGÚN permiso CRM devuelve `results: []` (201).
- **`reports.sales_kpis`**: la cadena de permisos se deriva de `REPORT_UNDERLYING_PERMISSIONS.sales` (sincronizada con `GET /reports/sales` por compilación + test) y las fechas/rango usan `isValidReportDate` + `checkDateRange` del propio reporting: `from > to` → `400 Invalid tool arguments` con `from must not be after to` (mismo mensaje que la ruta). El resultado del tool es **objeto-idéntico** al de `GET /reports/sales` (aserción de paridad en test).
- **`hr.salaries`**: ejemplifica la regla del ADR "las lecturas sensibles (nómina) exigen el MISMO permiso que la consulta manual" (`hr.salary:read`).

## Registro de interacciones (`aiInteractions`)

`POST /ai/interactions` — body `strictObject` `{ tool, args?, prompt? }` (`args` default `{}`; clave desconocida como `tenantId` → `400`). Cadena de decisión:

| Situación                                    | Respuesta                    | ¿Se registra? |
| -------------------------------------------- | ---------------------------- | ------------- |
| tool desconocida                             | `400 Unknown tool`           | NO            |
| falta algún `requiredPermission` de la tool  | `403 Missing permission`     | NO            |
| `args` inválidos (contrato Zod)              | `400 Invalid tool arguments` | NO            |
| ejecución OK                                 | `201` + registro `completed` | SÍ (`result`) |
| la tool lanza error (regla subyacente, etc.) | error original re-producido  | SÍ (`failed`) |

- **Interacción = intento de ejecución con contrato VÁLIDO** (interpretación documentada de "toda interacción guarda `aiInteractions`": las violaciones de permiso/contrato se rechazan ANTES de invocar la tool — verificado: el total del historial queda intacto).
- El registro `failed` **jamás enmascara** el error original (best-effort: si fallar el INSERT, se propaga el error de la tool).
- Campos: `requestId` (correlación con `meta.requestId` del envelope), `userId`, `tool`, `args` (ya parseados), `result` o `error`, `latencyMs`, `prompt` **redactado** (controles fuera, blancos → `null`, ≤2000 con `…` — redacción de FORMATO, no de PII: PARTIAL).
- **`auditLog`**: los tools de lectura NO escriben en auditoría — el ADR ata el auditLog a la "acción final" (escrituras futuras). Verificado: `GET /audit?entityType=ai_interaction` → `total 0` mientras otras entidades sí registran.
- 404 uniforme al detalle de un registro inexistente o de otro tenant.

## Query (listado)

`GET /ai/interactions` usa `z.object` (STRIP): `page?` ≥1 (def 1), `limit?` 1-100 (def 20), `tool?`, `status?` (`completed|failed`); parámetro desconocido (incluido `?tenantId=`) DESCARTADO sin error — el filtro de tenant SIEMPRE sale del JWT. Orden `createdAt` desc (desempate `_id`), `meta {page, limit, total}`. Valor inválido de un parámetro conocido → `400 Invalid request query`.

## Auditoría y correlación

Cada registro correlaciona `requestId` + `userId` + tool/args/resultado (y `error` cuando falla). Las tools de lectura son el registro de gobernanza POR SÍ MISMOS; el `auditLog` queda para la acción final de las tools de escritura (futuras). FK hacia Identity: `userId` es el `sub` del JWT (sin lectura adicional).

## NOT TESTED / RISK / PARTIAL

- **PARTIAL**: **sin orquestador LLM** (proveedor de IA no integrado: sin claves/red) — la capa que decide la tool desde texto libre NO existe; el contrato de ejecución, permisos y registro SÍ.
- **PARTIAL**: "cartera vencida" (ejemplo del ADR-008) **NO** entregada: el dominio no modela vencimientos de CxC (solo `dueDate` de tareas de projects) — sustituida por KPIs de ventas.
- **PARTIAL**: sin cuota/rate-limit **por tenant** en tools de IA (solo existe el rate limit global de autenticación) → un usuario con `ai:use` puede ejecutar sin límite.
- **PARTIAL**: redacción del prompt solo a nivel de formato (sin detección de PII); sin correlación todavía con `auditLog` de acciones (no hay escrituras).
- **NOT TESTED**: proveedores LLM reales; tools de escritura (futuras); `apps/web`/`apps/mobile`/Atlas real; `explain()` de los 3 índices.
- **RISK vigentes (sin regresar)**: sin transacciones Mongo, sin `Idempotency-Key`, outbox/jobs no implementados (sin TTL de `aiInteractions` → crecimiento monótono), paginación offset.
