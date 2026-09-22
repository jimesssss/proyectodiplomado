# Reporte de fase — FASE 6: PERMISSIONS (RBAC)

## ESTADO

**PASS**

## RESUMEN

Autorización RBAC completa según ADR-005, con catálogo compartido y denegación por defecto:

- **Paquete compartido `@erp/permissions`** (`packages/permissions`): catálogo canónico `recurso[:sub]:acción` (~150 claves de las 20 fases), `PERMISSION_CATALOG_VERSION = 1`, `isPermission`, roles embutidos `owner`/`super_admin` y `PLATFORM_PERMISSIONS` (`tenant:read/suspend/reactivate` solo `super_admin`; `owner` = todos los de negocio y tenant, menos plataforma).
- **JWT con `pv`**: `signAccessToken`/`verifyAccessToken` llevan el claim `pv` (versión del catálogo). Tokens sin `pv` → `0` (desactualizados).
- **`requirePermission(permiso)`** (`core/auth/require-permission.ts`): opera SOLO sobre `permissions` del JWT; `pv` desigual → `403 "Permissions catalog outdated. Sign in again."`; sin permiso → `403 "Missing permission"` con `details.permission`. **`requireRole` eliminado** (código muerto sustituido).
- **Login/refresh resuelven permisos** (`resolvePermissions`): roles embutidos → permisos del catálogo; roles del tenant → unión de `roles.permissions[]` (validadas al escribir con `isPermission`).
- **`/roles` CRUD** tenant-scoped: `POST/GET/GET :id/PATCH/DELETE` con `permissions[]` validadas contra el catálogo (desconocida → 400), `key` única por tenant (409), clave reservada (`owner`/`super_admin`) → 400, borrado en uso → 409, listado paginado, `tenantId` nunca en la respuesta.
- **`/users` CRUD** tenant-scoped: `GET /`, `GET /:id`, `POST /` (política de contraseña, roles validados como existentes en el tenant → `400 Unknown role`, email único por tenant → 409), `PATCH /:id` (`displayName/status/roles`). **Sin DELETE**: deshabilitado (`status: disabled`) para integridad. Cambio de roles/estado → **revocación de todas las sesiones** (re-login obligatorio).
- **`/permissions`** (solo lectura, solo autenticado): catálogo + versión + grupos, constante en código (no es colección).
- **Rutas migradas a permisos**: tenancy (`tenant:update/read/suspend/reactivate`) y organization (`org:read`/`org:write` en los 6 recursos × 5 verbos).
- **Documentación obligatoria**: `docs/security/permission-matrix.md` con matrices **VENDEDOR** y **ALMACÉN** (ejemplos de ADR-005) + tabla de rutas protegidas; `docs/api/users-roles.md`; actualizados `tenancy.md`, `organization.md`, `identity.md`, `conventions.md`, `security.md`, `database/identity.md`.
- **Endpoints nuevos**: `/users` (4), `/roles` (5), `/permissions` (1) = **10 endpoints**; 30 rutas de organización + 7 de tenancy ahora con `requirePermission`.

## ARCHIVOS CREADOS

- `packages/permissions/{package.json,tsconfig.json,src/index.ts,src/index.test.ts}`
- `apps/api/src/core/auth/require-permission.ts`
- `apps/api/src/modules/identity/domain/entities/role.ts`
- `apps/api/src/modules/identity/domain/rules/{rbac-rules.ts,rbac-rules.test.ts}`
- `apps/api/src/modules/identity/application/rbac-service.ts`
- `apps/api/src/modules/identity/presentation/validators/rbac-validators.ts`
- `apps/api/src/modules/identity/presentation/routes/{user-routes.ts,role-routes.ts,permission-routes.ts}`
- `tests/integration/rbac.test.ts`, `tests/security/rbac-security.test.ts`
- `docs/security/permission-matrix.md`, `docs/api/users-roles.md`
- `docs/architecture/reports/phase-6-permissions.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/core/auth/{jwt.ts,middleware.ts}` (claim `pv`, `AuthUser.permVersion`)
- `apps/api/src/core/auth/auth.test.ts` (input con `permVersion`, aserción `claims.pv`)
- `apps/api/src/modules/identity/application/auth-service.ts` (permisos resueltos en login/refresh)
- `apps/api/src/modules/identity/infrastructure/{schemas/types.ts,schemas/collections.ts,repositories/identity-repository.ts}` (`RoleDoc.permissions`, CRUD users/roles, 11000 → 409)
- `apps/api/src/modules/identity/index.ts`, `apps/api/src/index.ts` (monta `/users`, `/roles`, `/permissions`)
- `apps/api/src/modules/tenancy/presentation/routes/tenant-routes.ts`, `apps/api/src/modules/organization/presentation/routes/org-routes.ts` (permisos)
- `tsconfig.json`, `apps/api/tsconfig.json` (referencias al proyecto `packages/permissions`)
- `tests/security/organization-security.test.ts` (lectura también exige `org:read` → 403)
- Docs: `api/tenancy.md`, `api/organization.md`, `api/identity.md`, `api/conventions.md`, `architecture/security.md`, `database/identity.md`
- **ELIMINADO**: `apps/api/src/core/auth/require-role.ts` (sustituido por `requirePermission`; sin usos)

## APIs

- `GET|POST /api/v1/users`, `GET|PATCH /api/v1/users/:id`
- `GET|POST /api/v1/roles`, `GET|PATCH|DELETE /api/v1/roles/:id`
- `GET /api/v1/permissions`
- Guardas nuevas en `/tenants` y en los 6 recursos de organización.

## COLECCIONES

- `roles` (+ campo `permissions: string[]`, default `[]`, ya cubierto por el índice `{tenantId,key}` unique).
- `users` sin cambios de esquema (uso intensificado: paginado por `{tenantId,status}`, updates de `roles/status`).

## ÍNDICES

Sin índices nuevos (los existentes cubren los nuevos filtros: `roles {tenantId,key}` unique; `users {tenantId,email}` unique y `{tenantId,status}`).

## TESTS (ejecución real)

```
typecheck (api + shared-types + permissions + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 25 archivos · 178 tests PASSED (0 fallidos)
build (tsc -b workspaces) → exit 0
```

Nuevos de FASE 6:

- **unit** `packages/permissions` (9): forma canónica de todas las claves, sin duplicados, ejemplos obligatorios de ADR-005, `isPermission` fuera de catálogo, versión > 0, claves de las matrices VENDEDOR/ALMACÉN, `owner` sin permisos de plataforma y `super_admin` con ellos.
- **unit** `rbac-rules` (7): formato/reserva de `key` de rol, validación y deduplicación de permisos, desconocidos → issues, lista vacía válida.
- **integration** `rbac.test.ts` (13): `pv` + permisos de `owner` en el JWT; catálogo en `GET /permissions`; rol con permisos deduplicadas + claves reservadas/desconocidas → 400 + duplicado → 409; usuario con JWT de permisos exactos; denegación por defecto (`org:read` ok / `org:write` 403 con `details.permission`); `owner` sin `tenant:read` → 403; listado de usuarios paginado y aislado por tenant; rol desconocido → 400; cambio de roles revoca sesiones (401 → re-login con permisos nuevos); edición de permisos de rol → token stale 403 y re-login 201; usuario deshabilitado no loguea y sesiones mueren; borrado de rol en uso 409 / libre 200 / cruces 404 uniformes; usuario de otro tenant 404 en lectura y escritura.
- **security** `rbac-security.test.ts` (10): 401 en 6 rutas sin token; 403 sin permisos (user:create/role:create/user:read); token con `pv` obsoleto → 403 de re-autenticación (y ruta solo-autenticada sigue 200); `tenantId` inyectado → 400; ids inválidos → 400; política de contraseña → 400; email duplicado → 409; PATCH vacío/con campos extra → 400; respuestas sin `passwordHash`/password/`tenantId` de roles; token manipulado → 401.
- Regresión completa: los 155 tests previos siguen verdes tras migrar tenancy/organization de `requireRole` a `requirePermission` (3 suites ajustadas en expectativas de permisos).

## ERRORES ENCONTRADOS

1. `createUser` propagaba el error 11000 de Mongo (duplicado `(tenantId,email)`) → 500; ahora mapeado a `409 CONFLICT` (test nuevo lo cubre).
2. `RoleDoc` carecía de `permissions[]` (diseño FASE 3 incompleto): añadido con default `[]`.
3. En el primer redactado de `organization-security` se introdujo una llamada `.delete(...)` inválida en el test; corregida antes de ejecutar (la suite corre limpia).

## CORRECCIONES

- `requireRole` y su archivo eliminados (sin usos tras la migración); docs de FASE 4/5 actualizados para no mentir sobre el estado (ya no hay "roles provisionales").
- Test de `organization-security` ajustado a denegación por defecto: la LECTURA también exige `org:read` (ADR-005) — antes esperaba 200 con roles vacíos.
- `PublicUser` sí expone `tenantId` (es el del propio tenant del solicitante, contrato de login): el test de fugas se acota a `passwordHash`/password y al `tenantId` de `roles` (que sí se omite).

## RIESGOS

- **PARTIAL**: ABAC (`Policy.evaluate`) diseñado, no implementado (la capa `AllowByPermissionPolicy` no existe aún).
- **PARTIAL**: editar permisos de un rol no revoca sesiones de sus usuarios (stale hasta re-login; documentado y testeado — decisión revisable con event bus en FASE 14+).
- **NOT TESTED**: contra Atlas real; MFA; reset de contraseña por email; invalidación de refresh tokens cuando cambian permisos (solo access tokens).
- **RISK**: revocación de sesiones al editar un usuario es "todo o nada" (sin elegir sesión); aceptable mientras no haya administración de sesiones activas.
- **NOT TESTED**: UI de administración (apps/web y apps/mobile siguen sin verificar — RISK heredado).

## PRÓXIMA FASE

**FASE 7 — AUDIT**: `core/audit` con escritura append-only síncrona y bloqueante en acciones críticas (auth, provisioning, roles/usuarios, unidades organizativas), colección `auditLogs` con `{tenantId,userId,sessionId,action,entityType,entityId,requestId,timestamp,previousValue,newValue,metadata}`, endpoint `GET /audit` con `audit:read` y paginación, tests de append-only (sin update/delete desde la app) y aislamiento por tenant.
