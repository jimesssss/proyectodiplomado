# ADR-007: Sistema de eventos

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Desacoplar módulos (una venta reserva stock, notifica, actualiza CRM, encola facturación…) sin que el módulo de ventas conozca al de inventario, notificaciones ni reporting.

## Opciones

1. **Llamadas directas entre módulos.** Simple, pero acoplamiento circular y difícil de extraer a microservicios.
2. **Broker externo (Kafka/RabbitMQ) desde el inicio.** Potente, pero operación, costo y latencia innecesarios para un monolito inicial.
3. **Bus de eventos in-process tipado + outbox para efectos externos.** Desacople real dentro del monolito, camino de migración a broker.

## Decisión

Opción 3.

- **Eventos tipados:** registro `ERPEventMap` (TypeScript interface) con eventos concretos: `SalesOrderCreated`, `PaymentReceived`, `StockLow`, `InvoiceApproved`, `PurchaseReceived`, `CustomerCreated`, `WorkflowCompleted`, etc. **Prohibido** emitir strings arbitrarios: `emit<K extends keyof ERPEventMap>(name: K, payload: ERPEventMap[K])`.
- **Transporte in-process** por defecto (síncrono rápido para reacciones baratas), con opción `mode: 'deferred'` (cola interna) para handlers pesados.
- **Handlers registrados por módulo** en su `index.ts`; el core no conoce los handlers concretos.
- **Transactional Outbox** para eventos que deben sobrevivir a fallos o salir del proceso (email, jobs, futuros microservicios): se persiste en la misma transacción de negocio y un worker los despacha. (Diseño en esta fase; implementación en FASE 2/Core → **PARTIAL**.)
- **Idempotencia:** cada consumidor recibe `eventId` + `occurredAt`; los handlers deben ser idempotentes (clave `eventId` aplicado).
- Los eventos **no** sustituyen a las transacciones de dominio (no se usa evento para commit de stock): el evento se emite **después** del commit (o vía outbox).

## Motivo

Da el desacople que permite extraer módulos como microservicios más adelante, sin pagar el costo de un broker ahora. Los eventos tipados evitan contratos rotos entre módulos.

## Consecuencias

- Orquestación multi-paso (ej. cotización → pedido → entrega → factura) debe tener dueño claro en la capa de aplicación, no en handlers encadenados frágiles.
- Requiere tests de contrato de eventos.
- Fallo en handler diferido ⇒ reintentos + alerta; ningún evento debe perderse silenciosamente.
