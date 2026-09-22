# Reporte de fase — FASE 7: AUDIT

## ESTADO

**PASS**

## RESUMEN

Auditoría append-only según ADR-006, con escritura crítica bloqueante:

- **`core/audit`** (único dueño de la colección `auditLogs`):
  - `recordAudit(input)` — INSERT síncrono y **bloqueante** (si falla, falla la petición: mejor 500 que una acción sin traza).
  - `auditFromRequest(req, event)` — atajo de ruta: contexto (tenant, usuario, sesión, requestId, ip, user-agent) sale **siempre del JWT/request**, nunca del cliente.
  - `listAuditLogs(tenantId, query)` — lectura paginada **siempre filtrada por tenant**.
  - Superficie **append-only verificada por test unitario**: solo existen esas 3 funciones; cualquier `update/delete/patch/remove` futuro rompe el test.
- **Módulo `audit`** (presentation/application/domain): `GET /api/v1/audit` con `requirePermission('audit:read')`, paginación (`page`/`limit`/`meta.total`) y filtros opcionales `action`/`entityType`/`entityId` con formato canónico validado (Zod). Sin rutas de mutación → POST/PATCH/DELETE responden 404.
- **Colección `auditLogs`**: `{tenantId, userId, sessionId, action, entityType, entityId, requestId, timestamp, previousValue(null), newValue, metadata{ip,userAgent,reason}}`; `tenantId: ""` permitido solo para intentos de login sin email conocido (visibles solo leyendo la BD). Índices: `{tenantId,timestamp:-1}` y `{tenantId,action,timestamp:-1}`.
- **Acciones auditadas** (17): auth (`login`, `login.failed` con razón, `refresh`, `refresh.reuse`, `logout`, `change_password`, `change_password.failed`), tenancy (`provision`, `rename`, `suspend`, `reactivate`), RBAC (`role.create/update/delete`, `user.create/update`), organización (`org.create/update/archive` con `entityType` = tipo de unidad).
- **Decisiones de contexto**: `tenant.suspend`/`tenant.reactivate` se escriben **en el tenant afectado** (el actor queda en `userId`); `tenant.provision` en el tenant creado; el resto en el tenant del actor (del JWT).
- **Docs**: `docs/api/audit.md`, `docs/database/audit.md`, matriz de permisos y `security.md` actualizados con `audit:read`.

## ARCHIVOS CREADOS

- `apps/api/src/core/audit/{audit-log.ts,audit.ts,audit.test.ts}`
- `apps/api/src/modules/audit/{index.ts,domain/entities/audit-entry.ts,application/audit-service.ts,presentation/validators/audit-validators.ts,presentation/routes/audit-routes.ts}`
- `tests/integration/audit.test.ts`, `tests/security/audit-security.test.ts`
- `docs/api/audit.md`, `docs/database/audit.md`
- `docs/architecture/reports/phase-7-audit.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/modules/identity/application/auth-service.ts` (`login` audita éxito/fallos con `reason`; `refresh` recibe `RefreshContext` y audita rotación + reutilización)
- `apps/api/src/modules/identity/presentation/routes/auth-routes.ts` (logout, change-password ± fallo; pasa `requestId` a login/refresh)
- `apps/api/src/modules/tenancy/presentation/routes/tenant-routes.ts` (provision/rename/suspend/reactivate)
- `apps/api/src/modules/organization/presentation/routes/org-routes.ts` (create/update/archive)
- `apps/api/src/modules/identity/presentation/routes/{user-routes.ts,role-routes.ts}` (create/update/delete)
- `apps/api/src/index.ts` (monta `/api/v1/audit`)
- `docs/security/permission-matrix.md`, `docs/architecture/security.md`

## APIs

- `GET /api/v1/audit` (1 endpoint nuevo, `audit:read`).

## COLECCIONES

- `auditLogs` (nueva; escrita solo por `core/audit`).

## ÍNDICES

- `{ tenantId: 1, timestamp: -1 }` — listado del tenant más reciente primero.
- `{ tenantId: 1, action: 1, timestamp: -1 }` — filtro por acción (query de `?action=`).

Ambos justificados por las dos únicas queries de lectura (`GET /audit` y `?action=`); `entityType`/`entityId` se resuelven como filtros sobre el prefijo de tenant.

## TESTS (ejecución real)

```
typecheck (api + shared-types + permissions + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 28 archivos · 196 tests PASSED (0 fallidos)
build (tsc -b workspaces) → exit 0
```

Nuevos de FASE 7:

- **unit** `core/audit/audit.test.ts` (2): superficie exacta `[auditFromRequest, listAuditLogs, recordAudit]` y ninguna exportación con nombre mutador (`update|delete|patch|remove|truncate|drop`).
- **integration** `audit.test.ts` (10): provision+login trazados ordenados por `timestamp` ↓ con `requestId`/`sessionId`/`userId`; login fallido con `reason: invalid_credentials` dentro del tenant; change-password fallido audita `UNAUTHENTICATED`; refresh audita rotación y la **reutilización** del token viejo (`token_reuse`); logout con `sessionId`; RBAC/organización generan `role.create`, `user.create`, `user.update`, `org.create/update/archive` y el filtro `entityId` devuelve exactamente 3; paginación sin repetir y `total` estable; **las lecturas no escriben** (append-only en la práctica); otro tenant no ve estas entradas (`entityId` ajeno → 0); suspensión de un tercero queda trazada **en el tenant afectado** y no en el del actor (tras re-login del owner suspendido).
- **security** `audit-security.test.ts` (6): 401 anónimo y token manipulado; 403 sin `audit:read` con `details.permission`; 400 en 5 queries inválidas (`limit=5000`, `page=0`, `action=Bad Action!`, `action=$where`, `entityType=X`); POST/PATCH/DELETE `/audit` → 404 (sin mutación expuesta); filtro `entityId` propio devuelve solo lo propio; respuestas sin contraseñas ni `$argon2id`/`passwordHash`.
- Regresión completa: los 180 tests previos siguen verdes (la auditoría añade INSERTs en login/refresh/RBAC/org sin romper nada; bug real detectado y corregido abajo).

## ERRORES ENCONTRADOS

1. **`tenantId: ""` rechazado por Mongoose**: `required: true` en String rechaza la cadena vacía → todo login con email inexistente devolvía **500 en vez de 401** (test de identidad FASE 3 lo detectó al instante). Corregido con validador propio que exige tipo `string` pero admite `""`.
2. **Traza de `tenant.suspend` en el tenant equivocado**: se escribía con el tenant del actor; el test de aislamiento lo detectó. Ahora suspend/reactivate se escriben en el tenant afectado (actor conservado en `userId`).
3. Type error inicial en `audit.test.ts` (type predicate incompatible con la firma real de las funciones) → reescrito con bucle simple.

## CORRECCIONES

- `AuditRecordInput`/`AuditQuery`/`AuditEvent` con `| undefined` explícito en opcionales (`exactOptionalPropertyTypes: true`).
- Import de `AuditRecord` con la profundidad correcta desde `modules/audit/domain`.
- El test de seguridad de auditoría verifica también que **no existen** rutas de mutación (404), no solo que no se pueda alterar vía query.

## RIESGOS

- **PARTIAL**: sin transacción real — si el INSERT de la traza falla tras la mutación, queda acción-hecha-sin-auditar (migrar a `session.withTransaction` en Atlas con replica set).
- **PARTIAL**: `previousValue` siempre `null` (las rutas registran el estado resultante); poblarlo exige lectura previa en cada mutación.
- **PARTIAL**: intentos de login con email inexistente quedan con `tenantId: ""` → invisibles en cualquier listado por tenant (solo BD directa / consola de plataforma futura).
- **NOT TESTED**: retención/TTL de la colección; Atlas real; auditoría de accesos a datos de negocio (exportaciones) — no existen aún; rate-limit por IP.
- **RISK**: volumen de `auditLogs` crece sin política de rotación (índices bien cubren las queries actuales; revisar al conectar Atlas).

## PRÓXIMA FASE

**FASE 8 — CRM**: módulo `customers` con `/customers`, `/contacts`, `/leads`, `/opportunities`, `/activities` (domain/application/infrastructure/presentation), permisos `customer:*`, `contact:*`, `lead:*`, `opportunity:*`, `activity:*` ya en el catálogo, aislamiento por tenant, códigos/direcciones normalizadas, estados con transiciones validadas (lead → calificado/contactado…, oportunidad → ganada/perdida con motivo), paginación `page/limit/total`, auditoría de altas/cambios y suites integration + security (403 sin permiso, 404 cross-tenant, campos extra → 400).
