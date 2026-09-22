# Reporte de fase — FASE 4: TENANCY

## ESTADO

**PASS**

## RESUMEN

Módulo `tenancy` completo (`domain/application/infrastructure/presentation` + `index.ts`) que aporta la raíz del multi-tenancy (ADR-002):

- **Colección `tenants`**: `_id` = `tenantId` de todo el ERP; `slug` único global, `name`, `status` (`active`/`suspended`); índices `{slug}` unique y `{status,createdAt}`.
- **Dominio puro**: `normalizeSlug` (minúsculas, sin acentos, idempotente), `validateSlug` (3-32), `validateTenantName` (2-120), transiciones `canSuspend`/`canReactivate`.
- **Provisionamiento** `POST /api/v1/tenants` (público): crea tenant + usuario `owner` (roles `["owner"]`) con la política de contraseña de identity; slug derivado del nombre si no viene; compensación (borrado del tenant) si falla el owner — sin transacción real en Mongo standalone (**PARTIAL**, ver RIESGOS).
- **Endpoints autenticados**: `GET/PATCH /current` (siempre el tenant del JWT), `GET /:id` (solo el propio; ajeno/inexistente → 404 uniforme), `GET /` (listado paginado `page/limit/total`, solo `super_admin`), `POST /:id/suspend|reactivate` (solo `super_admin`).
- **Roles provisionales** vía nuevo `requireRole` (`core/auth/require-role.ts`): `owner`, `super_admin` — sustituidos por permisos `recurso:acción` en FASE 6 (ADR-005).
- **Corte de acceso inmediato**: suspender revoca TODAS las sesiones y refresh tokens del tenant (`revokeTenantSessions`, identity) y el login devuelve `403 Tenant suspended` (solo tras verificar credenciales, sin filtrar estado a no autenticados).
- **Sin ciclos**: `tenancy → identity` (vía `index.ts`); el estado del tenant llega a identity **inyectado** desde la composition root (`isTenantActive`), igual que `SessionChecker`.
- **Envelopes**: `ApiMeta` acepta `page/limit/total/nextCursor` y hay `successListResponse` (convenciones §5).

## ARCHIVOS CREADOS

- `apps/api/src/modules/tenancy/domain/entities/tenant.ts`
- `apps/api/src/modules/tenancy/domain/rules/{tenant-rules.ts,tenant-rules.test.ts}`
- `apps/api/src/modules/tenancy/application/tenant-service.ts`
- `apps/api/src/modules/tenancy/infrastructure/schemas/{types.ts,collections.ts}`
- `apps/api/src/modules/tenancy/infrastructure/repositories/tenant-repository.ts`
- `apps/api/src/modules/tenancy/presentation/validators/tenant-validators.ts`
- `apps/api/src/modules/tenancy/presentation/routes/tenant-routes.ts`
- `apps/api/src/modules/tenancy/index.ts`
- `apps/api/src/core/auth/require-role.ts`
- `tests/integration/tenancy.test.ts`, `tests/security/tenancy-security.test.ts`
- `docs/api/tenancy.md`, `docs/database/tenancy.md`
- `docs/architecture/reports/phase-4-tenancy.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/modules/identity/application/auth-service.ts` (`AuthDeps.isTenantActive`, `revokeTenantSessions`, chequeo en login)
- `apps/api/src/modules/identity/infrastructure/repositories/identity-repository.ts` (`revokeTenantSessions`)
- `apps/api/src/modules/identity/presentation/routes/auth-routes.ts` (dep `isTenantActive`)
- `apps/api/src/modules/identity/index.ts` (exporta `revokeTenantSessions`, `validatePasswordPolicy`)
- `apps/api/src/index.ts` (monta `/api/v1/tenants` y cablea `isTenantActive`)
- `apps/api/src/core/http/envelope.ts` (`successListResponse`, `ListPagination`)
- `apps/api/src/core/validation/validate.ts` (query con `Object.defineProperty`: Express 5 expone `req.query` como getter sin setter → asignar lanzaba `TypeError` en ESM)
- `packages/shared-types/src/index.ts` (`ApiMeta` con paginación opcional)
- `tests/integration/identity.test.ts`, `tests/security/identity-security.test.ts` (nueva dep `isTenantActive`)

## APIs

`POST /api/v1/tenants` · `GET /api/v1/tenants/current` · `PATCH /api/v1/tenants/current` · `GET /api/v1/tenants` · `GET /api/v1/tenants/:id` · `POST /api/v1/tenants/:id/suspend` · `POST /api/v1/tenants/:id/reactivate`

## COLECCIONES

`tenants` (nueva; raíz del multi-tenancy) — `users/sessions/refreshTokens` conectadas vía `tenantId`

## ÍNDICES

- tenants: `{slug}` **unique**; `{status, createdAt}` (listado admin)

## TESTS (ejecución real)

```
typecheck (api + shared-types + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 18 archivos · 112 tests PASSED (0 fallidos)
build (tsc -b workspaces) → exit 0
```

Nuevos de FASE 4:

- **unit** `tenant-rules.test.ts` (8): normalización/idelimpotencia de slug, longitud y patrón, nombre, transiciones.
- **integration** `tenancy.test.ts` (12): alta 201 con slug normalizado, login del owner + `/current`, slug duplicado 409, password débil 400 **sin** crear tenant, tenant B, aislamiento 404 uniforme (ajeno vs inexistente, mismo `message`), `PATCH /current` con slug inmutable, listado 403→200 paginado con `meta.total`, 403 sin rol, suspensión → login 403 + token previo 401 (corte inmediato) + resto de tenants operativo, doble suspensión 409, reactivación restaura login, reactivar activo 409.
- **security** `tenancy-security.test.ts` (10): 401 sin token en los 5 endpoints, token manipulado/esquema inválido, `tenantId` en body → 400 (strict), campos extra en `PATCH` → 400, id con formato inválido → 400 (no 500), cross-tenant 404 sin revelar existencia, 403 sin `super_admin` en suspend/reactivate/list, query `limit>100` → 400 para super_admin, respuestas sin hash/contraseña.

## ERRORES ENCONTRADOS

1. `exactOptionalPropertyTypes`: pasar el body de Zod directo a `ProvisionTenantInput` (`slug?: string` vs `slug?: string | undefined`) → reconstrucción condicional del argumento.
2. `req.query as z.infer<…>` no compila (`ParsedQs` no solapa) → cast por `unknown` tras el `defineProperty`.
3. Express 5: `req.query` es getter sin setter → la asignación de `validate()` habría lanzado `TypeError` en ESM (detectado al validar query por primera vez; corregido con `Object.defineProperty`).
4. mongoose 9: `findOneAndUpdate(..., { new: true })` deprecado → `returnDocument: 'after'`.

## CORRECCIONES

- `validate.ts` ahora reemplaza `req.query` de forma compatible con Express 5 (cubierto por el nuevo test de query inválida).
- `successListResponse` para listados (convenciones §5) en lugar de meter paginación en `data`.
- 404 de tenant ajeno calculado explícitamente (`NotFoundError`) en vez de simular un id inexistente.
- Deuda de FASE 3 cerrada: `changePassword(userId, …)` sin import dinámico ni `User` fabricado en las rutas.

## RIESGOS

- **RISK**: `POST /api/v1/tenants` es público sin rate-limit por IP (bootstrap de alta) → abuso posible; mitigación declarada, **no implementada**.
- **PARTIAL**: provisioning sin transacción (Mongo standalone en test) → compensación por borrado; con Atlas (replica set) migrar a `withTransaction` está **NOT TESTED**.
- **PARTIAL/RISK**: `isTenantActive` solo bloquea tenants **existentes** en `suspended`; un `tenantId` sin documento (datos legacy/de prueba) no bloquea — endurecer cuando FASE 5 haga el tenant requisito de creación de usuarios.
- **PARTIAL**: roles `owner`/`super_admin` provisionales (sin catálogo RBAC hasta FASE 6); `super_admin` se siembra directamente en BD (no hay CRUD de usuarios/roles).
- **NOT TESTED**: contra MongoDB Atlas real (sin credenciales en este entorno); audit de suspensión/renombre (llega con FASE 7); suspensiones concurrentes (dos `suspend` simultáneos → el estado final no está bloqueado por índice).

## PRÓXIMA FASE

**FASE 5 — ORGANIZATION**: colecciones `organizations/companies/branches/departments/warehouses/cost-centers` jerarquizadas bajo el tenant, CRUD con `tenantId` solo del JWT y pruebas de aislamiento cruzado por entidad.
