# Base de datos — PURCHASING (FASE 10)

Dos colecciones del módulo `purchasing`. Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `archived: boolean` = soft-delete. `timestamps: true` (`createdAt`/`updatedAt`) y `_id ObjectId`.

**Decisión de diseño**: igual que SALES (FASE 9), UNA sola colección `purchaseDocuments` para los 5 tipos de compra porque comparten forma, ciclo de vida y filtros; el campo `kind` discrimina. `suppliers` es el maestro (código único por tenant). Adicional: `counters` (dueño: `core/numbering`) para la numeración atómica `PREFIX-YYYY-000001`.

## Colección `suppliers`

| Campo      | Tipo / notas                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `tenantId` | string (SIEMPRE del JWT)                                                                                             |
| `code`     | string, **única por tenant**, normalizada (mayúsculas, espacios → `-`), inmutable                                    |
| `name`     | string (1–120)                                                                                                       |
| `email?`   | string, a minúsculas                                                                                                 |
| `phone?`   | string                                                                                                               |
| `taxId?`   | string a mayúsculas                                                                                                  |
| `address?` | subdoc **sin `_id`**: `street?/city?/region?/postalCode?/country?` (ISO-3166 alpha-2 en mayúsculas); `null` si vacía |
| `archived` | boolean (soft-delete)                                                                                                |

## Colección `purchaseDocuments`

| Campo                            | Tipo / notas                                                                                                                                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`                       | string (SIEMPRE del JWT)                                                                                                                                                                                                                       |
| `kind`                           | `purchase.request\|purchase.order\|goods.receipt\|supplier.invoice\|purchase.return` (enum en BD + filtro en todo query)                                                                                                                       |
| `number`                         | string, inmutable, serie del servidor (`RQ/PO/GR/PI/RET-YYYY-000001`)                                                                                                                                                                          |
| `supplierId`                     | ObjectId → `suppliers` (validado en servicio; derivado de la orden en recepciones)                                                                                                                                                             |
| `status`                         | string, máquina de estados por `kind` (validada en servicio)                                                                                                                                                                                   |
| `currency`                       | ISO-4217 a mayúsculas (default `USD`)                                                                                                                                                                                                          |
| `issueDate`                      | Date (default: ahora del servidor)                                                                                                                                                                                                             |
| `lines[]`                        | subdoc **sin `_id`**: `description`, `quantity`, `unitPrice`, `taxRate`, `discountPct`, `subtotal`, `tax`, `total` (los 3 últimos SOLO los escribe el servidor) + `productId` (`ObjectId → products`, solo en recepciones; `null` en el resto) |
| `subtotal/tax/total`             | number, redondeo comercial a 2 decimales (suman líneas ya redondeadas)                                                                                                                                                                         |
| `notes?`                         | string, limpiable con `null`                                                                                                                                                                                                                   |
| `requestId?/orderId?/invoiceId?` | ObjectId, solo los permitidos por `kind` (FK purchases, validadas en servicio)                                                                                                                                                                 |
| `warehouseId?`                   | ObjectId → `warehouses` (Organization). **Solo `goods.receipt`** (FK validada en servicio); `null` en el resto                                                                                                                                 |
| `archived`                       | boolean (soft-delete)                                                                                                                                                                                                                          |

- `null` = campo limpiado vía PATCH (solo borradores); `undefined` = nunca escrito.
- `number`, `issueDate`, `lines` y refs son **inmutables fuera de `draft`** (bloqueo en servicio con 409).
- **Desviación documentada** de `docs/architecture/database.md`: la fila de NEGOCIO lista también `purchaseReturns` — aquí se implementa como un TIPO más de `purchaseDocuments` (`kind: 'purchase.return'`), no como colección separada (misma decisión de diseño que SALES con `salesReturns`).

## Índices (query → índice, todos con `tenantId` primero)

| Colección           | Índice                                       | Query justificada                                              |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `purchaseDocuments` | `{tenantId, kind, number}` **unique**        | unicidad de la serie por tenant+tipo (`core/numbering` `$inc`) |
| `purchaseDocuments` | `{tenantId, kind, createdAt:-1}`             | `GET /purchasing/<tipo>` (listado paginado desc por tipo)      |
| `purchaseDocuments` | `{tenantId, kind, status, createdAt:-1}`     | `GET /purchasing/<tipo>?status=`                               |
| `purchaseDocuments` | `{tenantId, kind, supplierId, createdAt:-1}` | `GET …?supplierId=` (documentos de un proveedor)               |
| `purchaseDocuments` | `{tenantId, kind, orderId}`                  | `GET …?orderId=` y FKs por orden                               |
| `suppliers`         | `{tenantId, code}` **unique**                | clave natural + `POST` (duplicado → 409)                       |
| `suppliers`         | `{tenantId, createdAt:-1}`                   | `GET /suppliers`                                               |
| `suppliers`         | `{tenantId, archived, createdAt:-1}`         | `GET /suppliers?archived=`                                     |

La unicidad de número y de código es **por tenant**: lo mismo en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en tests de aislamiento.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`purchase-repository.ts` es el único camino a MongoDB; UNA fábrica de rutas en core). Único punto de casteo: `payload`/`$set` de create/update (supplierId/refs a ObjectId).
- `tenantId` jamás del cliente; `number`/totales jamás del cliente; FKs cruzadas → `404` uniforme.
- `goods.receipt` no expone `DELETE` (sin permiso `:delete` en el catálogo): solo `PATCH {archived}`.
- `counters` usa `$inc` atómico: dos creaciones simultáneas del MISMO tipo no repiten número.

## NOT TESTED / RISK

- **PARTIAL**: sin transacciones Mongo (standalone): documento y contador en operaciones separadas (el contador es atómico).
- **PARTIAL**: sin referential integrity en BD (cascadas/borrado en bloque): el soft-delete conserva enlaces por diseño (coherente con FASE 5/8/9).
- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); volumen alto de escrituras sobre `counters`.
- **RISK**: posting `posted`→stock sin transacciones (at-most-once: el estado terminal evita el doble-posting, pero una caída entre escrituras deja stock pendiente — recuperable con un movimiento manual); `warehouseId` de recepciones sin índice (los listados de compras NO filtran por almacén; query justificada no existe → ADR-003 no exige índice).
- **RISK**: sin índice de texto (búsqueda de proveedores en fases de reporting); sin retención/TTL.
