# Reporte de fase — FASE 16: MANUFACTURING

## ESTADO

**COMPLETADA** (QA verificado antes del commit; ver sección TESTS).

## RESUMEN

Módulo `manufacturing` montado bajo `/api/v1/manufacturing` (convenciones §4 fila 16, **8 endpoints** sobre **2 montajes**: `/manufacturing/boms` y `/manufacturing/orders`):

- **Catálogo de permisos v2** (`packages/permissions`): grupos nuevos `bom: [read, create, update]` y `production.order: [read, create, update]` — **SIN `:delete`** en ambos → ninguna ruta DELETE se publica (peticiones → 404); archivar es `PATCH {archived}` y las órdenes además se **cancelan** (`PATCH {status}`) — trazabilidad de producción. `PERMISSION_CATALOG_VERSION = 1 → 2`: todos los tokens existentes requieren **re-login** (comportamiento previsto por ADR-005; documentado en la matriz de permisos).
- **BOM** con clave natural `code` (normalizada mayúsculas/espacios→`-`, `2-32 [A-Z0-9._-]`, **única por tenant** vía índice unique → 409, **inmutable**: `code` no está en el PATCH → 400). `lines` = componentes **POR UNIDAD** (1–200, `quantity > 0`); el producto terminado no puede ser componente de su propia BOM ni duplicarse → 400 con `details.issues[]`. FKs de producto vía API pública de Inventory: 404 uniforme / 409 `Product is archived`.
- **Órdenes de producción** `MO-YYYY-000001`: numeración server-side (`core/numbering` `$inc`) **al final del create** — los intentos fallidos (FK/líneas) NO consumen números. Alta con **XOR** `bomId`/`lines` (ambos/ninguno → 400 con mensaje exacto); con `bomId` se copia un **snapshot POR UNIDAD** de la BOM (validada: mismo tenant 404, no archivada 409, salida coincidente 409). **Máquina de estados** `draft → [in_progress, cancelled]`, `in_progress → [completed, cancelled]`, terminales sin salida (saltos/repetidos → 409 `Invalid status transition` / `Status is already the requested one`) vía `PATCH {status}` con `production.order:update`. Solo los `draft` editan campos de negocio (`409 Only draft documents can be edited`); `lines`/`bomId`/`number` inmutables.
- **Completar mueve stock** (patrón transferencia FASE 11): ① **pre-chequeo** de TODOS los componentes (`lines × quantity`, 6 decimales) → si no alcanza **`422 DOMAIN_ERROR` `Insufficient stock` con `details {productId, warehouseId, available, required}` sin escribir nada**; ② flip a `completed` (estado terminal = guarda de at-most-once); ③ movimientos `production_out` (−) por componente y `production_in` (+) del producto terminado con `sourceType: 'production.order'`, `sourceId` y `reason: "Production order <number>"`. Cancelar NO mueve stock.
- **Inventory extiende sus enums dueños**: `MOVEMENT_TYPES` += `production_in`/`production_out`; `MovementSourceType` += `production.order`; `MANUAL_MOVEMENT_TYPES` intacto (el cliente sigue sin poder forjar tipos de sistema → 400).
- **Cross-module solo por `inventory/index.ts`**: `assertProductActive`, `assertWarehouseActive`, `listBalances`, `recordMovement` (Manufacturing importa ese `index.ts`, nunca schemas/repositorios/colecciones de Inventory).
- **Auditoría**: acciones `bom.*` y `production.order.*` con entidad canónica; las transiciones quedan en `metadata.reason = "status:<valor>"` (p. ej. `status:completed`).
- Sin eventos/jobs nuevos ni `Idempotency-Key`; el módulo es API-only (sin UI en web/mobile esta fase).

## ARCHIVOS

**26 + este reporte = 27** (`git diff --stat HEAD`: 26 archivos, **+2910/−45**):

- **Nuevo módulo (12)**: `apps/api/src/modules/manufacturing/` — `index.ts`, `domain/entities/{bom,production-order}.ts`, `domain/rules/{manufacturing-rules.ts + manufacturing-rules.test.ts}`, `application/{bom-service,production-order-service}.ts`, `infrastructure/schemas/{types,collections}.ts`, `infrastructure/repositories/manufacturing-repository.ts`, `presentation/validators/manufacturing-validators.ts`, `presentation/routes/manufacturing-routes.ts` (specs con `createCrudRouter` y SIN operación `delete`).
- **Modificados (10)**: `packages/permissions/src/index.ts` (grupos + `PERMISSION_CATALOG_VERSION = 2`), `apps/api/src/modules/inventory/domain/entities/stock.ts` (2 tipos nuevos + fuente), `apps/api/src/index.ts` (composition root: `createManufacturingRouters`), `tests/integration/rbac.test.ts` (2 asunciones `pv → 1` hechas dinámicas con `PERMISSION_CATALOG_VERSION`), docs: `api/conventions.md` (fila 16), `security/permission-matrix.md` (3 rutas + tabla "Cambios del catálogo" v1→v2), `architecture/database.md` (fila `boms`/`productionOrders`), `api/inventory.md` y `database/inventory.md` (tipos de sistema), `api/workflows.md` (mención literal `= 1` corregida a histórico).
- **Tests nuevos (2)**: `tests/integration/manufacturing.test.ts` (11), `tests/security/manufacturing-security.test.ts` (6).
- **Docs nuevos (2)**: `docs/api/manufacturing.md`, `docs/database/manufacturing.md`.
- **Reporte (1)**: este archivo.

## APIs

8 endpoints nuevos (GET/POST/GET:id/PATCH:id por recurso; **0 DELETE**):

| Ruta                               | Métodos    | Permiso                        |
| ---------------------------------- | ---------- | ------------------------------ |
| `/api/v1/manufacturing/boms`       | GET, POST  | `bom:read`, `bom:create`       |
| `/api/v1/manufacturing/boms/:id`   | GET, PATCH | `bom:read`, `bom:update`       |
| `/api/v1/manufacturing/orders`     | GET, POST  | `production.order:read/create` |
| `/api/v1/manufacturing/orders/:id` | GET, PATCH | `production.order:read/update` |

Detalle (queries strict, mensajes exactos, FKs): `docs/api/manufacturing.md`.

## COLECCIONES

2 nuevas (`docs/database/manufacturing.md`):

- `boms` — `{tenantId, code, name, productId, lines[{productId, quantity}], archived}`.
- `productionOrders` — `{tenantId, number, productId, quantity, warehouseId, bomId|null, lines, status, notes?, archived}`.

## ÍNDICES

7 (todos con `tenantId` primero y justificados por lectura/restricción):

- `boms`: `{tenantId, code}` **unique** · `{tenantId, createdAt:-1}` · `{tenantId, archived, createdAt:-1}`
- `productionOrders`: `{tenantId, number}` **unique** · `{tenantId, createdAt:-1}` · `{tenantId, status, createdAt:-1}` · `{tenantId, archived, createdAt:-1}`

## TESTS

**QA gate `npm run qa` EXIT=0**: `typecheck` ✓ · `lint` ✓ · `format:check` ✓ · `test` ✓ · `build` ✓.

- **Suite total: 471 tests PASSED en 58 archivos** (FASE 15: 439/55 → **+32 tests, +3 archivos**; cifra verificada en este QA, corregida respecto a la proyección).
- **FASE 16 (32 tests, todos PASSED)**:
  - `manufacturing-rules.test.ts` — **15 unit**: máquina de estados (transiciones, saltos, terminales), edición solo en draft, archivado doble, `normalizeBomCode`, `validateBomCode`, reglas de líneas (≥1, no finita/≤0, duplicados), `roundQuantity`, requisitos × unidades.
  - `tests/integration/manufacturing.test.ts` — **11**: BOM (normalización/unicidad por tenant/sin tenantId, FKs 404/409, líneas 400, `code` inmutable, archivar/restaurar, sin DELETE), órdenes (snapshot por unidad, `MO-2026-000001` secuencial sin huecos por intentos fallidos, XOR/FKs 400/404/409, tenantId estricto), máquina de estados (409s exactos), completar (saldos `10−1.25=8.75` y `+5`, movimientos con `sourceType/sourceId/reason`, at-most-once sin duplicados), 422 insuficiente **sin escribir** (estado queda `in_progress`, ledger intacto), cancelar sin mover stock, escala `× quantity` final (`0.1×4=0.4`), filtros `?status/?archived`, aislamiento B (0 movimientos, 404 en recursos A, BOM propia legible), auditoría (`metadata.reason='status:completed'`, 0 entradas de A en B).
  - `tests/security/manufacturing-security.test.ts` — **6**: 401 en las 8 rutas sin token/manipulado, 403 con `details.permission` por recurso, separación `bom` ≠ `production.order` y leer ≠ actualizar, token `pv=1` (obsoleto) → 403 de re-login en ambos recursos + `/auth/me` 200, entrada estricta (XOR, `code`/`lines` inmutables, ids inválidos → 400, ruta desconocida y DELETE → 404), cero `tenantId` en respuestas.
- `npm audit` (aparte del gate): **producción 0 vulnerabilidades** (EXIT=0); dev: **2 moderadas preexistentes** (`vitest`/`@vitest/mocker`, fix = `vitest@5` breaking — mismo hallazgo que FASE 15, no introducido aquí).

## ERRORES

**0 en el QA final** (EXIT=0). Durante el QA de la fase se encontraron y corrigieron los fallos de la sección siguiente; no quedan errores TS, de lint, de formato, tests fallidos ni vulnerabilidades nuevas.

## CORRECCIONES

1. **Bug real de producto (crítico)**: `createBom` no añadía `productId` al payload → mongoose `ValidationError: Path 'productId' is required` → **500 en toda creación de BOM**. Detectado por los tests nuevos (integración y seguridad cayeron en cascada con 500), aislado con un test temporal de llamada directa al servicio (borrado tras el diagnóstico). Corregido en `bom-service.ts` (`payload.productId = input.productId`).
2. **Diseño mejorado durante la fase**: `nextDocumentNumber` movido al **final** de `createProductionOrder`: los intentos fallidos (FK 404, 409, líneas inválidas) ya no consumen números de la serie → `MO-*` sin huecos por validaciones (verificado: `…000001`, `…000002` consecutivos a pesar de ~10 intentos fallidos intermedios).
3. **Lint (QA intento 1, EXIT=1 → corregido)**: import del tipo `Bom` sin usar en `bom-service.ts` (quitado); `bomBId` asignada sin usar en el integration test (reutilizada: tenant B lee su propia BOM → 200 en el test de aislamiento).
4. **Bugs del harness de test (no del producto)**: la cadena de fixtures omitía el nivel raíz `organizations` → `company` requería `parentId` → 400 en `beforeAll`; el loop de 403 olvidó la cabecera `Authorization` con `readerToken` (daba 401, esperado 403); 2 expectativas unit incorrectas (`normalizeBomCode` colapsa `\s+` → un solo guion; `validateBomCode` se aplica sobre el código ya normalizado, mayúsculas). Corregidos los tests, no el comportamiento (ambos coinciden con el patrón de `supplier`).

## RIESGOS

- **RISK**: sin transacciones Mongo multi-documento: un crash entre el flip a `completed` y los movimientos dejaría la orden completada sin ledger (misma ventana de transferencias/recepciones, FASE 11); el pre-chequeo elimina los fallos de negocio previsibles y el estado terminal es guarda at-most-once. Atlas real (replica set) **NOT TESTED**.
- **NOT TESTED**: `explain()` de los 7 índices sobre Atlas; volumen alto de la cola `productionOrders`; UI de manufacturing en `apps/web`/`apps/mobile` (módulo API-only esta fase).
- **RISK operativo**: `pv 1 → 2` → **re-login obligatorio** de todos los usuarios al desplegar (esperado por ADR-005; documentado en `docs/security/permission-matrix.md`).
- Sin `Idempotency-Key`: la transición repetida responde 409 (no reintentable con PUT idempotente); outbox/jobs no implementados (constante desde FASE 7).
- Dev audit: 2 moderadas preexistentes (`vitest`, fix = upgrade breaking) — no bloquean producción.

## PRÓXIMA FASE

**17 PROJECTS**: módulo `projects` (`project:*` en el catálogo), tareas con dependencias, asignaciones a empleados (usa usuarios), archivado sin DELETE, filtros de cola; docs + QA + commit por fase.
