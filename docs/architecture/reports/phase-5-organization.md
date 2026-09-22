# Reporte de fase — FASE 5: ORGANIZATION

## ESTADO

**PASS**

## RESUMEN

Módulo `organization` con la jerarquía `Tenant → Organization → Company → Branch → Department/Warehouse` + `CostCenter`:

- **6 colecciones** (`organizations`, `companies`, `branches`, `departments`, `warehouses`, `costCenters`) con documento estándar `{_id, tenantId, code, name, status, createdAt, updatedAt, <parentId>}`.
- **Sin duplicación**: UNO `buildSchema(collection, parentField)` para los 6 schemas, UN repositorio genérico parametrizado por tipo (`createKindRepo`) con registro explícito de modelos, UN router CRUD parametrizado (`createOrgRouter(deps, kind)`) montado en 6 rutas desde la composition root.
- **Reglas de dominio puras** (`org-rules`): `normalizeCode` (mayúsculas/guiones, idempotente), `validateCode` (2-24), `validateOrgName` (1-120), `requiresParent`, transiciones `canArchive`/`canRestore`.
- **Integridad jerárquica**: el `parentId` debe existir **en el mismo tenant** (ajeno/inexistente → `404 Parent not found`, uniforme); la raíz rechaza `parentId` (400) y los tipos con padre lo exigen (400).
- **Unicidad por tenant**: `code` unique `(tenantId, code)` — mismo código en dos tenants permitido (comprobado).
- **Soft-delete**: `DELETE` archiva (`status: archived`), doble archivado → 409, `PATCH status` valida transiciones.
- **Aislamiento**: toda operación recibe `tenantId` del JWT (nunca del body; Zod `strict` rechaza extras con 400); lectura cruzada `404` uniforme.
- **Autorización provisional**: lectura para cualquier autenticado del tenant; escritura con `requireRole('owner','super_admin')` hasta RBAC (FASE 6).
- **Endpoints**: 6 recursos × 5 verbos = **30 endpoints**.

## ARCHIVOS CREADOS

- `apps/api/src/modules/organization/domain/entities/org-unit.ts`
- `apps/api/src/modules/organization/domain/rules/{org-rules.ts,org-rules.test.ts}`
- `apps/api/src/modules/organization/application/org-service.ts`
- `apps/api/src/modules/organization/infrastructure/schemas/{types.ts,collections.ts}`
- `apps/api/src/modules/organization/infrastructure/repositories/org-repository.ts`
- `apps/api/src/modules/organization/presentation/validators/org-validators.ts`
- `apps/api/src/modules/organization/presentation/routes/org-routes.ts`
- `apps/api/src/modules/organization/index.ts`
- `tests/integration/organization.test.ts`, `tests/security/organization-security.test.ts`
- `docs/api/organization.md`, `docs/database/organization.md`
- `docs/architecture/reports/phase-5-organization.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/index.ts` (monta las 6 rutas de organización)

## APIs

`/api/v1/organizations` · `/companies` · `/branches` · `/departments` · `/warehouses` · `/cost-centers`
— cada uno con `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.

## COLECCIONES

`organizations` · `companies` · `branches` · `departments` · `warehouses` · `costCenters`
(`locations` queda fuera de alcance de esta fase — inventario de diseño de `database.md`).

## ÍNDICES

Por colección: `{tenantId, code}` **unique** · `{tenantId, status, createdAt}` · `{tenantId, <parentId>}`

## TESTS (ejecución real)

```
typecheck (api + shared-types + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 21 archivos · 140 tests PASSED (0 fallidos)
build (tsc -b workspaces) → exit 0
```

Nuevos de FASE 5:

- **unit** `org-rules.test.ts` (8): normalización/idempotencia de código, longitud/patrón, nombre, jerarquía, transiciones.
- **integration** `organization.test.ts` (12): raíz sin padre, cadena company→branch→department/warehouse/costCenter, código duplicado 409, mismo código en otro tenant 201, padre requerido/inválido 400, raíz con padre 400, padre de otro tenant 404, lectura cruzada 404 uniforme, listado paginado por tenant (el total de B no incluye items de A), PATCH rename + estado igual 409, DELETE archiva/no-repite/404 por tipo incorrecto, restauración archivado→activo.
- **security** `organization-security.test.ts` (9): 401 en 6 verbos/paths, 403 escritura sin rol + 200 lectura, `tenantId` en body → 400, campos extra en PATCH → 400, id con formato inválido → 400, id de otro tenant → 404, código inválido → 400 con issues, query `limit=5000` → 400, token manipulado → 401.

## ERRORES ENCONTRADOS

1. `new Schema(Record<string, unknown>)` no tipaba en mongoose 9 → casteo único a `SchemaDefinition` en el builder (punto único, comentado).
2. En rutas se evitó el patrón `req.user?.tenantId ?? ''` (tenant vacío en cascada): helper `currentUser()` que **falla** si `requireAuth` no pobló el usuario.

## CORRECCIONES

- `buildSchema` sin parámetro `kind` muerto (`void kind` eliminado antes del primer commit).
- Test de `DELETE` corregido para usar el recurso correcto (verificando además el 404 por tipo de colección).

## RIESGOS

- **PARTIAL**: roles provisionales `owner`/`super_admin` (RBAC real en FASE 6); permisos de escritura no granulares.
- **NOT TESTED**: contra Atlas real; auditoría de cambios (FASE 7); regla "no archivar padre con hijos vivos" **no implementada** (archivado por unidad, decisión documentada).
- **RISK**: `locations` (inventario de diseño) sin implementar — pendiente de definición de alcance.
- **NOT TESTED**: borrado físico / purga de unidades archivadas (retención pendiente).

## PRÓXIMA FASE

**FASE 6 — PERMISSIONS (RBAC)**: catálogo de permisos `recurso:acción` en código, roles tenant-scoped (CRUD `/roles`), CRUD `/users` con asignación de roles, `requirePermission` sustituyendo a `requireRole`, y tests de 403 por permiso faltante + aislamiento de roles/usuarios por tenant.
