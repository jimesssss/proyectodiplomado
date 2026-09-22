# Arquitectura — Eventos, Jobs y Notificaciones

Estado: Aceptado (FASE 1) · ADR-007

## 1. Bus de eventos

- **Tipado**: `EventBus.emit<K extends keyof ERPEventMap>(name, payload)` — prohibido strings arbitrarios (los eventos son contrato).
- **In-process** por defecto (monolito); handlers registrados por módulo en su `index.ts`.
- **Outbox transaccional** para eventos diferidos/externos: se persiste en la misma transacción que el cambio de negocio y un worker lo despacha ⇒ ningún evento se pierde por un crash.
- Los eventos se emiten **después del commit** (o vía outbox): no sustituyen transacciones.
- Consumidores **idempotentes** por `eventId`.

### Eventos iniciales del catálogo

| Evento              | Payload mínimo                    | Consumidores típicos                          |
| ------------------- | --------------------------------- | --------------------------------------------- |
| `CustomerCreated`   | customerId, tenantId              | CRM timeline, búsqueda                        |
| `SalesOrderCreated` | orderId, customerId, total        | inventory (reserva), reporting, notifications |
| `PaymentReceived`   | paymentId, invoiceId, amount      | accounting, treasury, notifications           |
| `StockLow`          | productId, warehouseId, available | notifications, purchasing                     |
| `InvoiceApproved`   | invoiceId, approvedBy             | accounting, notifications                     |
| `PurchaseReceived`  | receiptId, poId                   | inventory, accounting                         |
| `WorkflowCompleted` | workflowInstanceId, outcome       | notifications, módulo originador              |

Nuevo evento ⇒ añadir al `ERPEventMap` (falla de compilación si alguien emite algo no declarado).

## 2. Jobs / Workers

Nunca ejecutar procesos largos dentro de una petición HTTP:

| Job                                  | Trigger                  | Fase |
| ------------------------------------ | ------------------------ | ---- |
| Envío de emails                      | eventos / outbox         | 2    |
| Notificaciones internas              | eventos                  | 2    |
| Generación/exportación de reportes   | request → encola         | 15   |
| Importaciones (CSV/Excel)            | upload → valida → encola | 15+  |
| Purge de outbox y sesiones expiradas | cron                     | 2    |
| IA (procesamiento largo)             | request → encola         | 20   |
| Conciliación de contabilidad         | cron                     | 13   |

- Almacenamiento: colección `jobs` con estados `pending/running/succeeded/failed` + reintentos con backoff y dead-letter.
- Los handlers de job reutilizan los mismos casos de uso del módulo (mismas reglas, mismo tenant, misma auditoría).
- Un job **nunca** hereda otro tenant: el job persiste `tenantId` y `userId` del request que lo encoló.

## 3. Notificaciones

- Colecciones: `notifications` (in-box del usuario), `notificationTemplates` (con placeholders tipados), `notificationPreferences` (canales por usuario).
- Canales iniciales: **interna** + **email**. Preparados (interfaces, no implementados): push, SMS, WhatsApp.
- Toda notificación lleva `tenantId`, `userId`, `entityType`, `entityId` (para deep-link) y correlación con el evento.

## 4. Flujo ejemplo

```
Factura total > 50,000
  → evento InvoiceCreated (outbox)
  → workflow engine evalúa condición
  → acción: solicitar aprobación a rol Gerente
  → notification interna al gerente
  → Gerente aprueba (auditoría + permiso workflow.approve)
  → evento WorkflowCompleted
  → asiento contable publicado / facturación liberada
```

Configurable por datos (trigger/condición/acción), sin tocar código para casos normales.

## 5. Estado

Diseño en FASE 1; implementación del bus + outbox + worker base en **FASE 2 (Core)**; motor de workflows completo en **FASE 14**. **NOT TESTED**.
