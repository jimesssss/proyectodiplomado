# Base de datos — SALES (FASE 9)

Colección única del módulo `sales`. Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `archived: boolean` = soft-delete. `timestamps: true` (`createdAt`/`updatedAt`) y `_id` ObjectId.

**Decisión de diseño**: UNA sola colección `salesDocuments` para los 5 tipos de documento (cotización/pedido/envío/factura/devolución) porque comparten forma, ciclo de vida y filtros; el campo `kind` discrimina. Evita duplicar 5 colecciones idénticas y permite consultas cruzadas (`?orderId=`) sin joins. `number` es único POR `(tenantId, kind, number)`.

Adicional: `counters` (dueño: `core/numbering`) para la numeración atómica `PREFIX-YYYY-000001`.

## Colección `salesDocuments`

| Campo                                         | Tipo / notas                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`                                    | string (SIEMPRE del JWT)                                                                                                                                        |
| `kind`                                        | `sales.quote\|sales.order\|sales.delivery\|sales.invoice\|sales.return` (enum en BD + filtro en todo query)                                                     |
| `number`                                      | string, inmutable, serie del servidor (`QT/SO/DL/IV/RT-YYYY-000001`)                                                                                            |
| `customerId`                                  | ObjectId → `customers` (validado en servicio; derivado del pedido en envíos)                                                                                    |
| `status`                                      | string, máquina de estados por `kind` (validada en servicio)                                                                                                    |
| `currency`                                    | ISO-4217 a mayúsculas (default `USD`)                                                                                                                           |
| `issueDate`                                   | Date (default: ahora del servidor)                                                                                                                              |
| `lines[]`                                     | subdoc **sin `_id`**: `description`, `quantity`, `unitPrice`, `taxRate`, `discountPct`, `subtotal`, `tax`, `total` (los 3 últimos SOLO los escribe el servidor) |
| `subtotal/tax/total`                          | number, redondeo comercial a 2 decimales (suman líneas ya redondeadas)                                                                                          |
| `notes?`                                      | string, limpiable con `null`                                                                                                                                    |
| `opportunityId?/quoteId?/orderId?/invoiceId?` | ObjectId, solo los permitidos por `kind` (FK a CRM/sales, validadas en servicio)                                                                                |
| `validUntil?`                                 | Date — exclusive de cotizaciones                                                                                                                                |
| `approvedBy?/approvedAt?`                     | string/Date — exclusive de cotizaciones, SOLO vía `POST /:id/approve`                                                                                           |
| `archived`                                    | boolean (soft-delete)                                                                                                                                           |

- `null` = campo limpiado vía PATCH (solo borradores); `undefined` = nunca escrito.
- `number`, `issueDate`, `lines` y refs son **inmutables fuera de `draft`** (la edición se bloquea en servicio con 409).

## Índices (query → índice, todos con `tenantId` primero)

| Índice                                       | Query justificada                                              |
| -------------------------------------------- | -------------------------------------------------------------- |
| `{tenantId, kind, number}` **unique**        | unicidad de la serie por tenant+tipo (`core/numbering` `$inc`) |
| `{tenantId, kind, createdAt:-1}`             | `GET /sales/<tipo>` (listado paginado desc por tipo)           |
| `{tenantId, kind, status, createdAt:-1}`     | `GET /sales/<tipo>?status=`                                    |
| `{tenantId, kind, customerId, createdAt:-1}` | `GET /sales/<tipo>?customerId=` (documentos de un cliente)     |
| `{tenantId, kind, orderId}`                  | `GET /sales/deliveries?orderId=` y FKs por pedido              |

La unicidad del número es **por tenant y tipo**: el mismo `QT-2026-000001` en dos tenants (o en series distintas) no colisiona (índice compuesto, ADR-002) — verificado en test de aislamiento.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`sales-repository.ts` es el único camino a MongoDB; UNA colección/modelo y UNA fábrica de rutas `createSalesRouter` en core). Único punto de casteo: `payload`/`$set` de create/update (customerId/refs a ObjectId).
- `tenantId` jamás del cliente; `number`/totales jamás del cliente; FKs cruzadas → `404` uniforme (inexistente y ajeno se responden igual).
- `counters` usa `$inc` atómico: dos creaciones simultáneas del MISMO tipo no repiten número (concurrente en Atlas; en memory server single-thread también).

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): el documento y su contador se escriben en operaciones separadas (el contador es atómico; el documento solo usa el número ya reservado). Ver `docs/api/sales.md`.
- **PARTIAL**: sin referential integrity en BD (cascadas/borrado en bloque): el soft-delete conserva enlaces por diseño (coherente con FASE 5/8).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); volumen alto de escrituras sobre `counters`.
- **RISK**: sin índice de texto (búsqueda de ventas en fases de reporting); sin retención/TTL (mismo riesgo que el resto de colecciones de negocio).
