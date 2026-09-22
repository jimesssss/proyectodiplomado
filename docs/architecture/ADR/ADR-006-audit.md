# ADR-006: Auditoría (audit log inmutable)

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Trazabilidad de acciones críticas en un ERP multiempresa: quién hizo qué, cuándo, sobre qué, con qué valores, desde dónde — sin permitir alteraciones.

## Opciones

1. **Logs de aplicación (winston/pino) como auditoría.** No son inmutables ni estructurados para consulta por entidad/tenant.
2. **Tabla/campo de auditoría por entidad.** Consulta local, pero fácil de alterar junto con la entidad.
3. **Colección `auditLogs` dedicada, append-only, con retención propia.** Consultable por entidad, tenant, usuario, rango; un camino único de escritura.

## Decisión

Opción 3, con `auditLogs` escrita **solo** desde el servicio central de auditoría (los módulos emiten `*Audited` events o llaman al servicio; ningún módulo escribe directo).

Registro mínimo por entrada:
`tenantId, userId, sessionId, action, entityType, entityId, requestId, timestamp, previousValue, newValue, metadata (ip, userAgent, reason), actorRoles`.

Reglas:

- **Append-only:** sin update ni delete desde la API de aplicación. Opción de retención/archivado solo por proceso jobs con credencial dedicada.
- Cobertura obligatoria en: login/logout/refresh, creación/modificación/borrado de entidades de negocio, aprobaciones de workflow, pólizas y asientos, pagos, ajustes de stock, cambios de permisos/roles, exportaciones de datos, acciones de IA ejecutadas.
- El `requestId` se propaga desde el middleware de request → respuesta → logs → audit para correlación.
- Los usuarios normales **no pueden** leer audit logs salvo permiso `audit:read` específico (admin/auditor), y **nunca** modificarlos.
- Escritura **asíncrona en cola/buffer** para no penalizar la latencia, con garantía de persistencia (fall → retry + DLQ) — fallo de auditoría en acciones críticas debe bloquear la operación (mejor fallar el POST que perder traza).

## Motivo

Requisito regulatorio y de soporte; la trazabilidad resuelve uno de los problemas comunes de los ERPs ("falta de trazabilidad").

## Consecuencias

- Costo de almacenamiento creciente → plan de retención/archivo por colección en `docs/database/retention.md`.
- `previousValue/newValue` debe ser una **diferencia** por campos sensibles (no documentos completos en operaciones grandes).
- Tests: toda acción crítica genera exactamente un registro con valores anterior/nuevo correctos y `tenantId` correcto.
