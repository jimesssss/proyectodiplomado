# Arquitectura — Base de datos (MongoDB Atlas)

Estado: Aceptado (FASE 1) · Ver también ADR-002 y ADR-003

## 1. Principios

- Colecciones compartidas + `tenantId` en **todo** documento de negocio.
- Índices compuestos siempre con `tenantId` **primero**, justificados por un patrón de consulta real.
- Documento estándar: `{ _id, tenantId, createdAt, updatedAt, createdBy?, status? }`.
- Historiales como colecciones propias paginadas por cursor (no embebidos indefinidamente).
- Snapshot en documentos transaccionales (líneas de venta) para no repintar el histórico.

## 2. Colecciones previstas (inventario de diseño, NO creadas aún)

### CORE

| Colección                                                                                               | Notas                                                |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `users`                                                                                                 | email único por tenant, `passwordHash`, `status`     |
| `roles` · `permissions`                                                                                 | roles tenant-scoped; catálogo de permisos en código  |
| `sessions` · `refreshTokens`                                                                            | refresh con hash, rotación, `sessionId`              |
| `loginAttempts` · `mfaSettings`                                                                         | bloqueo por intentos; MFA preparado                  |
| `organizations` · `companies` · `branches` · `departments` · `warehouses` · `locations` · `costCenters` | jerarquía Tenant→Company→Branch→Department→Warehouse |
| `auditLogs`                                                                                             | append-only, retención propia                        |
| `files`                                                                                                 | metadata; binario en Object Storage                  |
| `notifications` · `notificationTemplates` · `notificationPreferences`                                   |                                                      |
| `workflows` · `workflowInstances` · `approvals`                                                         | motor de workflows                                   |
| `eventsOutbox`                                                                                          | outbox transaccional                                 |
| `jobs`                                                                                                  | cola de trabajos                                     |

### NEGOCIO

| Colección                                                                                                                                                                          | Notas                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `customers` · `contacts` · `leads` · `opportunities` · `activities` · `customerTags`                                                                                               | CRM; timeline = colección derivada/unión de eventos                               |
| `quotes` · `salesOrders` · `salesOrderLines` · `deliveries` · `invoices` · `salesReturns` · `commissions`                                                                          | líneas separadas si > umbral de tamaño                                            |
| `suppliers` · `purchaseRequests` · `purchaseOrders` · `goodsReceipts` · `supplierInvoices` · `purchaseReturns`                                                                     |                                                                                   |
| `products` · `productVariants` · `categories` · `brands` · `units` · `stock` · `stockMovements` · `stockReservations` · `lots` · `serialNumbers` · `inventoryCounts` · `transfers` | ledger de stock                                                                   |
| `accounts` · `journalEntries` · `journalLines` · `fiscalPeriods` · `taxes` · `currencies` · `exchangeRates` · `budgets` · `accountingDocuments`                                    | invariante DEBIT=CREDIT                                                           |
| `bankAccounts` · `cashAccounts` · `bankTransactions` · `payments` · `receipts` · `reconciliations` · `cashMovements`                                                               |                                                                                   |
| `boms` · `productionOrders`                                                                                                                                                        | manufacturing (FASE 16); plan POR UNIDAD + máquina de estados                     |
| `projects` · `tasks`                                                                                                                                                               | projects (FASE 17); clave natural única + grafo `dependsOn` acíclico por proyecto |
| `tickets` · `employees` · `attendance` …                                                                                                                                           | fases 18-19                                                                       |

Cada creación de colección exige pasar las **6 preguntas** de ADR-003 antes de escribir el schema.

## 3. Índices de ejemplo (patrones de consulta, no implementados aún)

```js
// Listado de entidades activas por tenant
{ tenantId: 1, status: 1, createdAt: -1 }
// Feed/timeline por tenant
{ tenantId: 1, createdAt: -1 }
// Detalle de cliente
{ tenantId: 1, customerId: 1, createdAt: -1 }
// Clave natural por tenant (uniqueness sin bloquear otros tenants)
{ tenantId: 1, email: 1 }                       // unique
{ tenantId: 1, sku: 1 }                         // unique (products)
// Movimientos de stock de un producto en un almacén
{ tenantId: 1, productId: 1, warehouseId: 1, createdAt: -1 }
// Búsqueda global por texto (si se adopta text index)
{ tenantId: 1, _fts: 'text' }                   // evaluar coste real (NOT TESTED)
```

Reglas:

- Documentar **cada** índice en `docs/database/indexes.md` con su consulta justificante.
- Prohibido índices "por si acaso" (coste de escritura y memoria).
- Todo índice de escritura se justifica por una lectura o por una restricción de unicidad.

## 4. Concurrencia y transacciones

- **Stock:** `stock` lleva `version` (optimistic locking) + actualización condicional. Ejecutar dentro de `session.withTransaction` si el cluster Atlas lo soporta (**NOT TESTED**: requiere replica set; verificar en FASE 2).
- **Doble reserva (stock=1, dos compras):** garantía por filtro atómico `findOneAndUpdate({ _id, available: { $gte: qty } }, ...)` → exactamente un ganador. Prueba obligatoria en FASE 11 (`tests/`).
- **Contabilidad:** balance validado en dominio antes de persistir + job de reconciliación.
- Nada de "leer-modificar-escribir" sin versión o filtro condicional.

## 5. Retención y borrado

| Colección                                      | Retención                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `auditLogs`                                    | Permanente (archivo/cold storage a largo plazo); nunca borrado por app |
| `stockMovements`, `journalEntries`, `payments` | Permanentess (ledger fiscal)                                           |
| `sessions`, `refreshTokens`, `loginAttempts`   | TTL (índice `expiresAt`)                                               |
| `eventsOutbox`                                 | purge tras aplicar + ventana de debug                                  |
| Datos operativos borrados por usuario          | soft-delete + retención documentada por módulo                         |

## 6. Acceso

- Único camino a MongoDB: repositorios (`infrastructure/repositories` de cada módulo).
- Pool de conexiones único por proceso; transacciones vía `core/db`.
- Credenciales solo en variables de entorno (`MONGODB_URI`); nunca en Git.
- Backups y PITR: configuración de Atlas **NOT TESTED** (pendiente de cuenta/proyecto).

## 7. Estado actual

Sin cluster configurado, sin credenciales, sin colecciones, sin índices: **NOT TESTED**. Verificación de transacciones multi-documento es prerequisito de la FASE 2.
