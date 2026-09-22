# ADR-003: Modelo de datos en MongoDB Atlas

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Decidir cómo modelar colecciones, referencias, índices y consistencia en un ERP transaccional (stock, contabilidad) sobre MongoDB.

## Opciones

1. **Muy embebido (documentos grandes).** Lecturas rápidas, pero duplicación y actualizaciones caras (líneas de pedido, movimientos de stock).
2. **Muy referenciado (estilo 3NF).** Sin duplicación, pero reads multi-roundtrip y agregaciones costosas.
3. **Mixto por caso de uso:** embeber lo pequeño, volátil y leído junto (direcciones de una venta, líneas de producto en un snapshot); referenciar por `_id` lo grande, compartido o con historial propio (clientes, productos, movimientos, pólizas).

## Decisión

Opción 3, con reglas explícitas:

- **Documento de venta/factura guarda snapshot** (nombre, SKU, precio, impuesto del momento) además de `productId` referenciado → evita que repintar un producto histórico cambie el histórico contable.
- **Historiales nunca se embeben en el documento padre:** `stockMovements`, `journalLines`, `auditLogs`, `timeline` son colecciones propias con paginación por cursor.
- **Campos estándar:** `tenantId`, `createdAt`, `updatedAt`, `createdBy`, y `status` donde aplique. `_id` ObjectId.
- **Diseño de colección condicionado a 6 preguntas obligatorias antes de crearla:** patrón de consulta principal, crecimiento esperado, embedding vs referencia, índices reales (con `tenantId` primero), retención/auditoría, concurrencia.
- **Índices** se documentan en `docs/database/indexes.md` y se justifican por una consulta; prohibido índices "por si acaso".
- **Paginación:** `page/limit` para listas pequeñas; **cursor pagination** (`_id` o `createdAt` + `_id`) para datasets grandes y feeds.
- **Concurrencia de stock:** estrategia de _optimistic concurrency_ con `version` + transacción de sesión (`startSession` / `withTransaction`) en Atlas (replica set) para reservas; en caso de que Atlas no soporte transacciones (**NOT TESTED**), recurrir a actualización condicional `findOneAndUpdate` con filtro `available >= qty` (inyección de pérdida cero) y dejarlo documentado.
- **Contabilidad:** invariante `SUM(debit) == SUM(credit)` validado en dominio y por índice de consistencia en jobs de reconciliación.

## Motivo

MongoDB admite ambos estilos; la clave es que el modelo siga el patrón de consulta real y mantenga el ledger completo (nunca mutar `stock.quantity` sin movimiento asociado).

## Consecuencias

- Requiere disciplina de snapshot y de ledger → más escrituras por operación.
- Requiere verificación temprana del soporte de transacciones en el cluster Atlas (**bloqueante: RISK, NOT TESTED**).
- Agregaciones de reportes deben usar read models/jobs para no bloquear la API.
