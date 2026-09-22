# Reporte de fase — FASE 10: PURCHASING

## ESTADO

**PASS**

## RESUMEN

Módulo `purchasing` completo (domain/application/infrastructure/presentation) resolviendo la pregunta que abrió la FASE 9 y cubriendo TODAS las colecciones de `database.md` y TODOS los permisos de compras del catálogo:

- **Decisión — proveedores**: el maestro `suppliers` vive DENTRO del módulo `purchasing` (datos maestros de compra; los clientes siguen en CRM) y se expone en `/suppliers` (raíz, simetría con `/customers`). Código único por tenant, normalizado (mayúsculas/espacios→guiones) e inmutable — mismo patrón que `customers.code`.
- **6 recursos / 29 endpoints**: `/suppliers` (5) + `/purchasing/{requests,orders,receipts,invoices,returns}` (5+5+4+5+5) sobre `createCrudRouter` de core. Se implementan también `/purchasing/returns` (previsto en `database.md` y con permiso `purchase.return:*` en el catálogo; la fila §4 de convenciones se actualizó) — **decisión documentada**.
- **Extracción a core**: el cálculo de líneas/impuestos (`roundMoney`, `computeLine`, `computeTotals`, `normalizeLines`, límites) se movió de Sales a `core/domain/line-totals.ts` (+test): UN único dueño de la fórmula compartida por Sales y Purchasing; `sales-rules.ts` lo re-exporta (superficie de Sales intacta, 28 tests verdes tras el cambio).
- **`goods.receipt` sin `:delete`**: el catálogo NO define `goods.receipt:delete` → `permissions.delete` en `CrudResourceSpec` ahora es **opcional**; la ruta DELETE de receipts no se publica (owner incluido → 404) y el archivado es `PATCH {archived:true}` con `goods.receipt:update`. Documentado en matriz y API docs.
- **UNA colección, 5 tipos** (decisión repetida de FASE 9): `purchaseDocuments` con `kind` + maestro `suppliers`; índice `{tenantId, kind, number}` **unique** y numeración atómica `RQ/PO/GR/PI/RET-YYYY-000001` por tenant+tipo+año (`core/numbering`).
- **Estados**: solicitud `draft→submitted→approved|rejected` (aprobación vía `PATCH` con `purchase.request:update` — el catálogo NO tiene `:approve` en compras, decisión documentada), orden `draft→confirmed→completed`, recepción `draft→received→posted` (listo para el stock de FASE 11), factura `draft→issued→paid`, devolución `draft→received→refunded` (+`cancelled`); salto/repetido → 409; **solo borradores editables** (409).
- **Mismas reglas de FASE 9**: importes calculados SOLO por el servidor (descuento antes del impuesto, redondeo 2 decimales), `number` inmutable y del servidor, FKs del mismo tenant → **404 uniforme**, la recepción **deriva `supplierId` de la orden** (body no lo admite → 400), `kind` aísla documentos (404 cruzado), `DELETE` = soft-delete con doble → 409.
- **Auditoría conectada**: `supplier.*` y `<kind>.create/.update/.archive/.restore` con `reason` en `metadata.reason`; verificado por tenant.
- **Docs**: `docs/api/purchasing.md`, `docs/database/purchasing.md` (índices justificados + desviación `purchaseReturns` documentada), matriz de permisos (+6 rutas) y convenciones (fila 10 ampliada) actualizadas.

## ARCHIVOS CREADOS

- `apps/api/src/core/domain/{line-totals.ts,line-totals.test.ts}` (extraído de Sales)
- `apps/api/src/modules/purchasing/domain/entities/{purchase-document.ts,supplier.ts}`
- `apps/api/src/modules/purchasing/domain/rules/{purchase-rules.ts,purchase-rules.test.ts}`
- `apps/api/src/modules/purchasing/infrastructure/{schemas/{types.ts,collections.ts},repositories/purchase-repository.ts}`
- `apps/api/src/modules/purchasing/application/{purchase,supplier}-service.ts`
- `apps/api/src/modules/purchasing/presentation/{validators/purchase-validators.ts,routes/purchase-routes.ts}`
- `apps/api/src/modules/purchasing/index.ts`
- `tests/integration/purchasing.test.ts`, `tests/security/purchasing-security.test.ts`
- `docs/api/purchasing.md`, `docs/database/purchasing.md`, `docs/architecture/reports/phase-10-purchasing.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/core/http/crud-router.ts` (`permissions.delete` opcional → DELETE condicional)
- `apps/api/src/modules/sales/domain/rules/{sales-rules.ts,sales-rules.test.ts}` (matemática movida a core; tests movidos a `line-totals.test.ts`)
- `apps/api/src/index.ts` (monta `...createPurchasingRouters(...)` — 6 mounts)
- `docs/security/permission-matrix.md` (6 rutas nuevas, receipts sin DELETE), `docs/api/conventions.md` (fila FASE 10 con `/suppliers` y `/purchasing/returns`)

## APIs

- `POST/GET/PATCH/DELETE` + `GET /:id` sobre `/suppliers`, `/purchasing/requests`, `/purchasing/orders`, `/purchasing/invoices`, `/purchasing/returns` (25) + `POST/GET/PATCH` + `GET /:id` sobre `/purchasing/receipts` (4, sin DELETE) → **29 endpoints nuevos**.

## COLECCIONES

- `suppliers`, `purchaseDocuments` (2 nuevas; escritas solo por `purchase-repository`) + `counters` compartida (series nuevas RQ/PO/GR/PI/RET).

## ÍNDICES

`purchaseDocuments`: `{tenantId, kind, number}` **unique** (serie atómica), `{tenantId, kind, createdAt:-1}` (listado), `{tenantId, kind, status, createdAt:-1}` (`?status=`), `{tenantId, kind, supplierId, createdAt:-1}` (`?supplierId=`), `{tenantId, kind, orderId}` (`?orderId=`/FKs). `suppliers`: `{tenantId, code}` **unique**, `{tenantId, createdAt:-1}`, `{tenantId, archived, createdAt:-1}`. Todos justificados en `docs/database/purchasing.md`.

## TESTS (ejecución real)

```
npm run qa → EXIT=0
typecheck → 0 errores · lint (eslint .) → 0 · format:check (prettier) → OK
npm audit → 0 vulnerabilidades
vitest → 39 archivos · 294 tests PASSED (0 fallidos)
```

Nuevos de FASE 10 (32; neto +26 tras mover 6 tests matemáticos de `sales-rules.test.ts` a core):

- **unit** `purchase-rules.test.ts` (8): las 5 máquinas de estados (caminos válidos, saltos, terminales/cancelled), archivado, normalización de código de proveedor y moneda; **`line-totals.test.ts` (7)** movido de Sales (roundMoney, computeLine con/sin descuento-impuesto, totales = suma redondeada, normalizeLines).
- **integration** `purchasing.test.ts` (9): proveedor con código/email/taxId/dirección normalizados, sin `tenantId`; duplicado mismo tenant → 409 vs mismo código en B → 201; `PATCH code` → 400; solicitud `RQ-YYYY-000001` con totales del servidor (200/42/242), ciclo `submitted→approved` por PATCH, mismo estado → 409, `approved` terminal (edición → 409), salto `draft→approved` → 409 y segunda serie `RQ-000002`; orden `PO-*` propia, FKs `requestId`/`supplierId` desconocidas → 404, salto → 409, `kind` aísla (404), B sin proveedor propio → 400 y serie B `RQ-000001` independiente; recepción exige orden (400), deriva proveedor (200), `PATCH supplierId` → 400, **DELETE → 404 (ruta ausente)**, archivar/restore por PATCH, `received→posted`, salto → 409 y `?orderId=` filtra; factura `issued→paid` con bloqueo (409), reversa (409), DELETE + doble → 409; devolución rama lineal (salto 409) con FK de factura; recálculo de líneas con descuento + campos calculados → 400 + líneas vacías/cantidad 0/`{}` → 400; **aislamiento** (GET/PATCH/DELETE/FK/listado de B sobre A → 404); auditoría (`purchase.request.create`, `status:approved` en `metadata.reason`, `supplier.invoice.archive`, B sin trazas de A).
- **security** `purchasing-security.test.ts` (8): 401 en los 6 listados + create + token manipulado; **403 con `details.permission` exacto en 9 casos**; receipts sin `:delete` → DELETE responde **404 para owner y lector** (ruta no publicada, no 403); `pv` viejo → 403 (`/auth/me` operativo); inyección de `tenantId`/`number`/`status`/`kind`/`total`/`archived` → 400; importes inválidos (qty 0/negativa, precio negativo, impuesto/descuento >100, líneas vacías) → 400 (nunca 500); ids/queries inválidos → 400; respuestas sin `tenantId`/`passwordHash`/`$argon2id`.
- Regresión: los 268 tests previos siguen verdes (Sales 12+8, CRM, identity, audit, etc. — 6 de sus tests de matemática ahora viven en `core/domain/line-totals.test.ts`); total final 294 tests en 39 archivos.

## ERRORES ENCONTRADOS

1. **Ruta de import con un nivel de más** (`../../../core/domain` desde `sales/domain/rules` → 4 niveles) → corregido a `../../../../core`.
2. **`noUncheckedIndexedAccess`** en el test nuevo de `line-totals` (`lines[0].subtotal`) → optional chaining `lines[0]?.`.
3. **Query de auditoría con `entityId=` vacío** en mi test de integración → 400 (bug de prueba, no de producto): eliminado el parámetro vacío.
4. **Diseño de `delete` en la fábrica**: primer intento con un campo `deletePermission` paralelo a `permissions` (redundante) → simplificado a `permissions.delete` opcional con DELETE condicional.

## CORRECCIONES

- `PURCHASE_TRANSITIONS` tipado como `Partial<Record<…>>` por tipo (mismo patrón corregido en FASE 9).
- Adaptadores muertos descartados en `sales-rules.ts`: los tipos de core (`DocumentLine`) son estructuralmente idénticos a `SaleLine`/`PurchaseLine` — sin conversión necesaria.
- Permisos de compras como `Record<PurchaseKind, Permission>` literales (comprobación en compile-time contra el catálogo, sin casts de template literal).

## RIESGOS

- **PARTIAL**: sin transacciones Mongo (standalone): documento y contador en operaciones separadas (el contador es atómico vía `$inc`); sin `Idempotency-Key` (convenciones §6).
- **PARTIAL**: recepciones `posted` NO mueven stock hasta FASE 11 (NOT TESTED hasta entonces); sin conversión automática solicitud→orden/factura (manual vía `requestId`/`orderId`); aprobación de solicitudes sin permiso dedicado (cualquiera con `purchase.request:update` aprueba — coherente con el catálogo actual).
- **PARTIAL**: sin cascadas (archivar proveedor no afecta documentos enlazados); sin `/search` de proveedores; paginación por offset (cursor pendiente).
- **NOT TESTED**: `apps/web`/`apps/mobile`; Atlas real; cargas concurrentes sobre `counters`.
- **RISK**: `suppliers`/`purchaseDocuments` crecen sin TTL; ABAC (`Policy.evaluate`) sigue sin implementar.

## PRÓXIMA FASE

**FASE 11 — INVENTORY**: módulo `inventory` con `/inventory/products`, `/inventory/stock`, `/inventory/movements`, `/inventory/transfers`, `/inventory/counts`; permisos `product`, `stock.movement`, `stock.transfer` (con `stock.count:approve` — revisar si requiere endpoint propio como `sales.quote:approve`), `stock.count`; ledger de stock inmutable (`stockMovements`) que consume recepciones `posted` de FASE 10 y facturas de venta de FASE 9; invariante de stock ≥ 0 (o bloqueo configurable), integración con `core/numbering` si hay documentos; auditoría + integration/security tests (403/404 cross-tenant/campos extra→400).
