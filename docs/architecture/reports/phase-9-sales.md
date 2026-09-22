# Reporte de fase — FASE 9: SALES

## ESTADO

**PASS**

## RESUMEN

Módulo `sales` completo (domain/application/infrastructure/presentation) con los 5 documentos de venta del plan, sobre los ADR-001/002/003/005 y la infraestructura extraída en esta fase:

- **Extracción a core**: la fábrica CRUD que en FASE 8 vivía en CRM se movió a `apps/api/src/core/http/crud-router.ts` (`createCrudRouter` + `CrudResourceSpec`); CRM quedó refactorizado encima (typecheck/lint/tests verdes tras el cambio) y SALES la reutiliza — UNA fábrica compartida para todos los módulos desde aquí.
- **Numeración atómica en core**: `core/numbering` con colección `counters` e `$inc` — serie `PREFIX-YYYY-000001` por **tenant + tipo + año UTC** (`QT/SO/DL/IV/RT`), `number` inmutable y rechazado si viene del cliente (400).
- **1 colección, 5 tipos**: `salesDocuments` con campo `kind` (misma forma y ciclo de vida — decisión de diseño documentada en `docs/database/sales.md`); repositorio único con filtro `tenantId + kind`.
- **Líneas e importes**: `description/quantity/unitPrice/taxRate/discountPct`; el servidor calcula por línea y totales (descuento **antes** del impuesto, redondeo comercial a 2 decimales por línea, totales = suma de líneas ya redondeadas) — dominio puro en `sales-rules.ts` con test unitario; campos calculados en el body → 400.
- **Estados**: cotización `draft→sent→approved|rejected` (+`cancelled`), pedido `draft→confirmed→fulfilled`, envío `draft→shipped→received`, factura `draft→issued→paid`, devolución `draft→received→refunded` (+`cancelled`); salto/repetido → 409; **solo borradores editables** más allá de `status`/`archived` (409 `Only draft documents can be edited`).
- **Aprobación con permiso propio**: `POST /sales/quotes/:id/approve` exige `sales.quote:approve` y estado `sent` (otros → 409); registra `approvedBy`/`approvedAt` y auditoría `sales.quote.approve`; un `PATCH {status:'approved'}` → 400 (fuera del enum de PATCH) — actualizar ≠ aprobar (verificado con un vendedor que puede editar pero no aprobar).
- **FKs por superficie pública**: cliente y oportunidad reutilizan `getCustomer`/`getOpportunity` de CRM; pedidos/envíos/facturas/devoluciones se referencian entre sí con `getSale` del propio módulo; FK inexistente o de otro tenant → **404 uniforme**; el envío **deriva `customerId` del pedido** (el body no lo admite → 400). `kind` aísla: un id de cotización en `/sales/orders/:id` → 404.
- **Auditoría conectada**: `sales.<tipo>.create/.update/.archive/.restore` (+`sales.quote.approve`) con `reason` en `metadata.reason`; `GET /audit` por tenant.
- **Docs**: `docs/api/sales.md`, `docs/database/sales.md` (índices justificados), matriz de permisos (+6 rutas) y convenciones (numeración server-side) actualizadas.

## ARCHIVOS CREADOS

- `apps/api/src/core/http/crud-router.ts` (fábrica CRUD extraída de CRM)
- `apps/api/src/core/numbering/{numbering.ts,numbering.test.ts}`
- `apps/api/src/modules/sales/domain/{entities/sale-document.ts,rules/{sales-rules.ts,sales-rules.test.ts}}`
- `apps/api/src/modules/sales/infrastructure/{schemas/{types.ts,collections.ts},repositories/sales-repository.ts}`
- `apps/api/src/modules/sales/application/sale-service.ts`
- `apps/api/src/modules/sales/presentation/{validators/sale-validators.ts,routes/sale-routes.ts}`
- `apps/api/src/modules/sales/index.ts`
- `tests/integration/sales.test.ts`, `tests/security/sales-security.test.ts`
- `docs/api/sales.md`, `docs/database/sales.md`, `docs/architecture/reports/phase-9-sales.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/modules/crm/presentation/routes/crm-routes.ts` (refactorizado sobre `createCrudRouter`)
- `apps/api/src/index.ts` (monta `...createSalesRouters(...)` — los 5 tipos bajo `/api/v1/sales/…`)
- `vitest.config.ts` (`testTimeout`/`hookTimeout` — suites de integración con argon2 + memory server en paralelo)
- `docs/security/permission-matrix.md` (6 rutas nuevas, `sales.quote:approve` separado), `docs/api/conventions.md` (fila FASE 9 con approve + numeración server-side en §6)

## APIs

- `POST/GET/PATCH/DELETE` + `GET /:id` sobre `/sales/quotes`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/returns` (25) + `POST /sales/quotes/:id/approve` → **26 endpoints nuevos**.

## COLECCIONES

- `salesDocuments` (nueva, única del módulo, con `kind`) + `counters` (numeración atómica, dueño `core/numbering`).

## ÍNDICES

Por tenant + tipo + fecha de listado (`{tenantId, kind, createdAt:-1}`) y filtros: `{tenantId, kind, number}` **unique** (serie atómica), `{tenantId, kind, status, createdAt:-1}` (`?status=`), `{tenantId, kind, customerId, createdAt:-1}` (`?customerId=`), `{tenantId, kind, orderId}` (`?orderId=`/FKs). Todos justificados en `docs/database/sales.md`.

## TESTS (ejecución real)

```
npm run qa → EXIT=0
typecheck → 0 errores · lint (eslint .) → 0 · format:check (prettier) → OK
npm audit → 0 vulnerabilidades
vitest → 35 archivos · 268 tests PASSED (0 fallidos)
```

Nuevos de FASE 9 (35):

- **unit** `sales-rules.test.ts` + `numbering.test.ts` (15): redondeo comercial, líneas con descuento-antes-de-impuesto, totales = suma de líneas redondeadas, las 5 máquinas de estados (caminos válidos, saltos, terminales) y series independientes por tipo.
- **integration** `sales.test.ts` (12): creación con numeración `QT-YYYY-000001`, totales del servidor y sin `tenantId`; serie independiente por tenant (B empieza en 000001); recálculo de líneas en PATCH + rechazo de importes del cliente (400); ciclo `sent→approved` SOLO vía endpoint (PATCH→400, draft→409, doble approve→409, edición tras aprobar→409, terminal→409) con `approvedBy`/`approvedAt`; FKs de oportunidad/cliente/quoteId/validUntil (404/400); numeración `SO/DL/IV/RT` independiente, salto→409, `kind` aísla (404); envío deriva cliente del pedido y rechaza `customerId` (400); factura `issued→paid` con bloqueo de edición (409) y reversa (409); devolución rama lineal (salto 409); soft-delete (archive, doble 409, `?archived=true`, restore); **aislamiento** (GET/PATCH/DELETE/FK/listado de B sobre documentos de A → 404/aislado); auditoría (`sales.quote.create`, `status:issued` en `metadata.reason`, `sales.quote.approve` y B sin trazas de A).
- **security** `sales-security.test.ts` (8): 401 anónimo en los 5 listados + create + approve + token manipulado; **403 con `details.permission` exacto en 7 casos** (lectura/escritura por tipo y `sales.quote:approve`); **separación update vs approve** (vendedor edita 200, aprueba 403); `pv` viejo → 403 (`/auth/me` operativo); inyección de `tenantId`/`number`/`status`/`total`/`approvedBy` y campos calculados de línea → 400; importes inválidos (qty 0/negativa, precio negativo, impuesto/descuento >100, líneas vacías, descripción vacía) → 400 (nunca 500); ids/queries inválidos → 400; respuestas sin `tenantId`/`passwordHash`/`$argon2id`.
- Regresión: CRM (22) y el resto de suites siguen verdes — 268 tests en total (233 previos + 35 nuevos), todos en la corrida final del QA.

## ERRORES ENCONTRADOS

1. **Montajes sin prefijo** (`/api/v1/quotes` en vez de `/api/v1/sales/quotes`) → todas las rutas 404: detectado por los tests de integración (12/12 fallando) y corregido en `sale-routes.ts`.
2. **`Record<SaleStatus,…>` sobre tablas parciales** en `SALE_TRANSITIONS` (cada tipo solo declara SUS estados) → tipado a `Partial<Record<…>>` con fallback en `canTransition`.
3. **`readonly` vs mutable**: `normalizeLines` devuelve `readonly SaleLine[]` y el servicio lo asignaba a `SaleLine[]` → copia explícita `[...]`.
4. **Rutas de import en profundidad incorrectas** (`../../../core` en un archivo 4 niveles más adentro) → `../../../../core`.
5. **Expectativa aritmética errónea en mi test**: `10.01 + 20.01 = 30.02` (no `30.01`, que sería la suma cruda sin redondear) — corregido el test, no el producto.
6. **Lint de imports sin uso** (`SALE_REQUIRES_CUSTOMER`, `SALE_PREFIX`) y **interface vacía extendida** (`SalesRouterDeps`) → eliminados/cambiados a alias de tipo.
7. **Test de identity con timeout en suite completa**: `change-password…` superó los 5000ms por defecto (5137ms) con 35 archivos en paralelo (fallos consecutivos en 3 corridas del QA; en solitario 13/13 verdes) → `testTimeout: 15_000`/`hookTimeout: 30_000` en `vitest.config.ts` con comentario; los fallos por aserción siguen siendo inmediatos.

## CORRECCIONES

- `type` alias para `SalesRouterDeps` (evita `no-empty-interface`) y exports mínimos en `index.ts` (superficie pública única del módulo).
- Helpers de test con `body: object` (supertest rechaza `unknown` en `.send`).
- `currentUser` exportado desde `core/http/crud-router.ts` (la ruta de approve lo reutiliza sin duplicar).

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): documento y contador se escriben en operaciones separadas (el contador es atómico vía `$inc`); sin `Idempotency-Key` (convenciones §6).
- **PARTIAL**: sin índice de texto ni `/search` de ventas (búsqueda global sigue siendo CRM); paginación por offset (cursor pendiente).
- **PARTIAL**: sin conversión automática cotización→pedido/factura (hoy manual vía `quoteId`/`orderId`); sin cascadas entre documentos enlazados.
- **NOT TESTED**: `apps/web`/`apps/mobile` consumiendo sales (no existen); Atlas real; cargas concurrentes sobre `counters`.
- **RISK**: `counters` y `salesDocuments` crecen sin TTL; ABAC (`Policy.evaluate`) sigue sin implementar.

## PRÓXIMA FASE

**FASE 10 — PURCHASING**: módulo `purchasing` con `/purchasing/requests`, `/purchasing/orders`, `/purchasing/receipts`, `/purchasing/invoices`; reutilizar `createCrudRouter` + `core/numbering` (series `PR/RG/PO/PI`); FKs a `suppliers` (¿módulo propio o extensión de CRM? decidir y documentar), estados con transiciones validadas, importes con las mismas reglas de redondeo de FASE 9, auditoría e integration+security tests (403/404 cross-tenant/campos extra→400/importes negativos→400).
