# Base de datos — REPORTING (FASE 15)

Reporting NO crea colecciones propias: es un lector CQRS que agrega con `.aggregate()` sobre **10 colecciones físicas de otros módulos** (fila de plataforma `reporting` en `docs/architecture/database.md` = módulo solo-lectura, **0 escrituras**). Los 10 read models `Reporting*` se declaran en `reporting/infrastructure/schemas/read-models.ts` (esquemas mínimo `tenantId` + campos proyectados).

**Decisión de diseño**: los nombres de modelo son `Reporting*` y NUNCA reutilizan el del módulo dueño (`salesDocuments`, `customers`…): el `getModel` del dueño comprobaría `models[<su nombre>]` y devolvería ESTE schema vacío → corrompería sus escrituras. Cada módulo dueño conserva SU única fábrica de modelos (aislamiento FASE 1); Reporting solo añade índices de consulta sobre las colecciones compartidas sin tocar los `collections.ts` del dueño.

## Colecciones leídas (10)

| Colección física    | Dueño (FASE)    | Uso en reportes                                |
| ------------------- | --------------- | ---------------------------------------------- |
| `salesDocuments`    | sales (9)       | serie/totales/topCustomers, export ventas      |
| `purchaseDocuments` | purchasing (10) | serie/totales/topSuppliers, export compras     |
| `customers`         | crm (8)         | `$lookup` de nombre/código en topCustomers     |
| `suppliers`         | purchasing (10) | `$lookup` de nombre/código en topSuppliers     |
| `products`          | inventory (11)  | snapshot de inventario, low-stock, export      |
| `stock`             | inventory (11)  | saldos (`qty`) para valorización y faltantes   |
| `cashMovements`     | treasury (13)   | flujo de caja y su export (ledger append-only) |
| `treasuryAccounts`  | treasury (13)   | `$lookup` de moneda en flujo de caja           |
| `leads`             | crm (8)         | `leadRate` y `byStatus`                        |
| `opportunities`     | crm (8)         | `winRate`, `byStage`, `byCurrency`, export CRM |

## Índices declarados por Reporting (sobre colecciones compartidas)

| Colección           | Índice                           | Query justificada                                                                                |
| ------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `salesDocuments`    | `{tenantId, kind, issueDate:-1}` | agregaciones/exports por rango `issueDate` (desde FASE 15; el dueño ya tenía los de `createdAt`) |
| `purchaseDocuments` | `{tenantId, kind, issueDate:-1}` | ídem para compras                                                                                |

Los índices de `customers`/`suppliers`/`products`/`leads`/`opportunities`/`cashMovements` creados por sus dueños (FASE 8–13) cubren las agregaciones; `tenantId` SIEMPRE primero (ADR-002).

## Reglas

- **Solo-lectura**: 13 funciones de agregación/export en `report-repository.ts` — todas `.aggregate()`, `tenantId` (del JWT) como PRIMER `$match` de todo pipeline.
- **`$lookup` con sub-pipeline por tenant**: cada join fija `tenantId` literal en SU sub-pipeline (sale del JWT, no del cliente) — verificado en tests de aislamiento cruzado.
- Sin hidratación (nunca `hydrate()`), sin escritura, sin `deleteMany`/`updateMany`.
- Ver `docs/api/reports.md` para las formas de respuesta y los límites de escaneo.

## NOT TESTED / RISK / PARTIAL

- **PARTIAL**: agregación EN VIVO (sin colecciones read-model materializadas ni job de refresh): correcto a volumen actual, RISK de latencia con millones de documentos (Atlas real NOT TESTED).
- **NOT TESTED**: plan de agregación (`explain`) sobre Atlas con los índices de arriba; rotación/partición histórica de `salesDocuments`.
- **RISK**: Reporting escribe índices sobre colecciones de otros módulos (documentado arriba) — si un dueño renombra su colección, los read models deben seguirlo (sin contrato de tipo compartido).
