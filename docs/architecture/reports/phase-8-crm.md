# Reporte de fase — FASE 8: CRM

## ESTADO

**PASS**

## RESUMEN

Módulo `crm` completo (domain/application/infrastructure/presentation) con los 5 recursos del plan, siguiendo los patrones de ADR-001/002/003 y las convenciones de fases previas:

- **5 recursos × 5 endpoints = 25 rutas + `/search`**: `customers`, `contacts`, `leads`, `opportunities`, `activities`. CRUD genérico con UNA fábrica (`createCrmRouter(deps, spec)`) que centraliza auth, `requirePermission` por recurso (`<recurso>:read|create|update|delete`), validación Zod estricta, envelope y auditoría (FASE 7) — misma filosofía que `createOrgRouter`, aplicada a 5 colecciones distintas.
- **Repositorio UNO**: `crm-repository.ts` con UNA fábrica genérica parametrizada por documento (create/find/list con filtros/update `$set` con `returnDocument:'after'/search`) + registro explícito de los 5 modelos; único punto de casteo documentado. Único camino a MongoDB del módulo.
- **Dominio puro** (`crm-rules.ts` + test unitario): normalización de código/email/moneda/dirección, sanitizado y **escaping de regex** para búsqueda, y las dos máquinas de estados — `LEAD_TRANSITIONS` (`new→contacted→qualified→converted`, `lost` desde abierto; terminales) y `OPPORTUNITY_TRANSITIONS` (`prospecting→qualification→proposal→negotiation→won|lost`; terminales).
- **Reglas de negocio**: código de cliente único por tenant e inmutable; FKs (`customerId`, `leadId`, `opportunityId`) del MISMO tenant → **404 uniforme**; un solo contacto principal por cliente (degradación automática); convertir lead exige cliente (400) y no se puede desvincular (409); `lost` exige `lostReason` (400) y no se admite suelto; actividad con al menos un enlace (create y patch); `completedAt` lo fija el servidor (`completedAt` en body → 400); `assignedTo` debe ser usuario del tenant (400, como roles).
- **Soft-delete uniforme**: `DELETE` = `archived: true`, doble archive → 409, `PATCH {archived}` con transiciones validadas, `archived=true|false` como filtro de listado.
- **`GET /search`** (convenciones §4): búsqueda literal (regex escapada — sin ReDoS), SIEMPRE por tenant, con `<recurso>:read` **por tipo** (sin permiso → el tipo no aparece; `pv` viejo → 403 re-login), `types` validado y `limit` por tipo.
- **Auditoría conectada**: `<recurso>.create/.update/.archive/.restore` con `reason` (`status:…`/`stage:…`/`archived:…`) en `metadata.reason`; `tenantId` del actor (JWT).
- **Docs**: `docs/api/crm.md`, `docs/database/crm.md` (índices justificados por query), matriz de permisos y convenciones actualizadas.

## ARCHIVOS CREADOS

- `apps/api/src/modules/crm/domain/entities/{customer,contact,lead,opportunity,activity}.ts`
- `apps/api/src/modules/crm/domain/rules/{crm-rules.ts,crm-rules.test.ts}`
- `apps/api/src/modules/crm/infrastructure/schemas/{types.ts,collections.ts}`
- `apps/api/src/modules/crm/infrastructure/repositories/crm-repository.ts`
- `apps/api/src/modules/crm/application/{customer,contact,lead,opportunity,activity}-service.ts`
- `apps/api/src/modules/crm/presentation/validators/crm-validators.ts`
- `apps/api/src/modules/crm/presentation/routes/{crm-routes.ts,search-routes.ts}`
- `apps/api/src/modules/crm/index.ts`
- `tests/integration/crm.test.ts`, `tests/security/crm-security.test.ts`
- `docs/api/crm.md`, `docs/database/crm.md`, `docs/architecture/reports/phase-8-crm.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/index.ts` (monta `...createCrmRouters(...)` — los 5 recursos + `/api/v1/search`)
- `apps/api/src/modules/identity/index.ts` (exporta `findUserInTenant` para validar `assignedTo`)
- `docs/security/permission-matrix.md` (7 rutas nuevas), `docs/api/conventions.md` (`/search` marcada como implementada)

## APIs

- `POST/GET/PATCH/DELETE` sobre `/customers`, `/contacts`, `/leads`, `/opportunities`, `/activities` (+ `GET /:id`) y `GET /search` → **26 endpoints nuevos**.

## COLECCIONES

- `customers`, `contacts`, `leads`, `opportunities`, `activities` (5 nuevas; escritas solo por `crm-repository`).

## ÍNDICES

Por tenant + fecha de listado en las 5 (`{tenantId, createdAt:-1}`) y los específicos de cada query de filtro: `{tenantId, code}` unique (clave natural de customer), `{tenantId, customerId, createdAt}` (timeline de contactos/activities ×3 por entidad enlazada), `{tenantId, status, createdAt}` (`GET /leads?status=`), `{tenantId, stage, createdAt}` (`GET /opportunities?stage=`). Todos justificados en `docs/database/crm.md`.

## TESTS (ejecución real)

```
typecheck (api + shared-types + permissions + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 31 archivos · 233 tests PASSED (0 fallidos)
build (tsc -b workspaces) → exit 0
```

Nuevos de FASE 8 (37):

- **unit** `crm-rules.test.ts` (15): normalización idempotente de código, nombres/asuntos, email/moneda, escaping de regex (incluye `c++ (x)`), archivado y AMBAS máquinas de estados (caminos válidos, saltos rechazados, terminales sin salida).
- **integration** `crm.test.ts` (14): cliente 201 con código/email/dirección normalizados y sin `tenantId` en la respuesta; duplicado mismo tenant 409 e código inválido 400; patch editable vs `code` inmutable y `{}` → 400; contactos con FK y un-solo-principal (degradación verificada en listado); lead completo (salto 409, mismo estado 409, convertir sin cliente 400, convertido con cliente, desvincular 409, terminal 409); `assignedTo` desconocido 400 / válido 201 / FK de cliente ajeno 404; filtro `?status=`; oportunidad solo-etapas-abiertas al crear (won→400), camino hasta `won`, terminal, `lostReason` obligatorio/suelto→400, FK ajena→404; actividad sin enlace→400, FK desconocida→404, `completedAt` servidor (body→400), re-enlace y sin-enlaces→400, `?customerId=`; soft-delete (archive, doble 409, listados `archived=`, restore); **aislamiento** (GET/PATCH/DELETE/FK de A desde B → 404, mismo `code` reutilizable en B, listado B sin ids de A); auditoría (`customer.create` por entityId, `status:contacted` en `metadata.reason`, `customer.archive/.restore`, y que B NO ve trazas de A); `/search` (encuentra por nombre con `subtitle=code`, `types=lead` filtra, `q<2`→400, metacaracteres→200, tipo desconocido→400).
- **security** `crm-security.test.ts` (8): 401 anónimo en los 5 listados + create + token manipulado; **403 con `details.permission` exacto en 10 casos** (GET/POST/PATCH/DELETE de los 5 recursos con usuario sin roles); `pv` viejo → 403 en CRUD y en `/search` con `/auth/me` aún operativo; `tenantId` inyectado → 400 (customers/leads); campos desconocidos top-level, anidados (`address.zip`) y computados (`completedAt`) → 400; ids/query con formato inválido → 400 (nunca 500); `/search` sin token 401, `q<2` 400, tipo desconocido 400 y lector sin permisos → 200 con `results: []` (denegación por tipo); listado sin `tenantId`/`passwordHash`/`$argon2id`.
- Regresión completa: los 196 tests previos siguen verdes.

## ERRORES ENCONTRADOS

1. **Rutas de test sin prefijo** (`/search`, `/audit` escritas sin `/api/v1`) → 404: detectados por los tests, corregidos en los propios tests (bug de prueba, no de producto).
2. **Expectativas de test erróneas** en normalización (`Ejemplo` → `ejemplo`, no `example`) y lectura de `reason` en la raíz de la entrada en vez de dentro de `metadata.reason`: corregidas contrastando con la API real de auditoría.
3. **Prettier + `no-unexpected-multiline`**: al partir la cadena `request(app)[method]` dejó `[` en línea nueva (ambigüedad ASI) → intermedio `const call = …`.
4. **Type/lint de diseño**: import sin uso en `activity-service` y export redundante en el repositorio, eliminados antes de ejecutar QA (typecheck/lint en verde a la primera tras ello).

## CORRECCIONES

- `types.ts` con `| null` explícito en campos limpiables vía PATCH (`exactOptionalPropertyTypes`).
- `normalizeEmail`/`normalizeCurrency`/`sanitizeSearchTerm` como funciones puras con test (el escaping de regex vive en dominio, no en la ruta).
- Query booleana con `z.enum(['true','false']).transform(...)` — **no** `z.coerce.boolean()` (que convertiría `'false'` → `true`).

## RIESGOS

- **PARTIAL**: desviación de `database.md` — no existen `customerTags` ni colección de timeline derivada (`activities` es la línea); documentado en `docs/api/crm.md` y `docs/database/crm.md`.
- **PARTIAL**: `/search` incluye `archived` y usa regex sin anclar (limitado a 50/tipo): con colecciones grandes migrar a índice `$text`/Atlas Search.
- **PARTIAL**: sin cascadas de archivado (archivar cliente deja contactos/oposiciones enlazados, por diseño como FASE 5); sin ABAC (ownership/monto) — `Policy.evaluate` sigue sin implementar.
- **NOT TESTED**: `apps/web`/`apps/mobile` consumiendo CRM (no existen); Atlas real; volumen alto de búsquedas.
- **RISK**: `activities` crece sin archivado automático; paginación por offset (cursor `nextCursor` pendiente, convenio §5).

## PRÓXIMA FASE

**FASE 9 — SALES**: módulo `sales` con `/sales/quotes`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/returns`; permisos `sales.*` ya en el catálogo; FKs a `customers` (reutilizar superficie pública de CRM) y `opportunities` opcional; estados con transiciones validadas y aprobaciones (`sales.quote:approve`); numeración secuencial por tipo y tenant; totales/impuestos con redondeo decimal documentado; auditoría de creación/cambio y suites integration + security (403 sin permiso, 404 cross-tenant, campos extra → 400, importes negativos → 400).
