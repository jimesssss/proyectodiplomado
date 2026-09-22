# ADR-008: Arquitectura de IA desacoplada

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Integrar IA en el ERP sin convertirla en un agente con acceso irrestricto a MongoDB ni en una fuente de cambios no auditados.

## Opciones

1. **IA con acceso directo a BD.** Rápido de prototipar; inseguro, no auditable, rompe multi-tenancy y permisos.
2. **IA solo lectura con RAG sobre datos exportados.** Seguro, pero datos desactualizados y sin acciones.
3. **Agente sobre herramientas autorizadas (tool-calling) con capa de permisos y confirmación humana para acciones críticas.** La IA nunca ve la BD: ve _tools_ ya filtradas por tenant y permisos del usuario.

## Decisión

Opción 3.

Flujo:

```
Usuario → AI Agent → Permission Layer (mismos permisos RBAC del usuario + tenantId del JWT)
        → Tool autorizada (ej. AccountsReceivable.overdue) → ERP → resultado
```

Reglas:

- **Nunca acceso directo a MongoDB.** El agente solo puede invocar tools registradas con contrato de entrada/salida (Zod) y permiso requerido declarado.
- **El tenant en juego es el del usuario que pidió la acción**, heredado del JWT; la tool lo propaga al repositorio.
- **Acciones críticas (IA propone → usuario confirma → ERP ejecuta → audit log):** cancelar facturas, anular pedidos, ajustar stock, pagar, modificar permisos, borrar datos. La IA **nunca** ejecuta por sí sola; ante instrucción ambigua ⇒ pregunta o rechaza.
- **Lecturas sensibles** (nómina, salarios) requieren el mismo permiso que si el usuario las pidiera manualmente.
- Toda interacción guarda `aiInteractions` (prompt redactado, tools llamadas, resultado, confirmación del usuario) correlacionado con `requestId` y `auditLog` de la acción final.

## Motivo

Evita el fallo clásico de "copiloto con superpoderes": si la IA puede saltarse permisos o tenants, todo el sistema de seguridad deja de valer.

## Consecuencias

- Costo de construir y mantener el catálogo de tools (pero son reutilizables por la API).
- Latencia extra por la capa de confirmación en acciones.
- FASE 20: empezar con 2–3 tools de lectura (búsqueda, cartera vencida, KPIs) antes que cualquier acción de escritura.
