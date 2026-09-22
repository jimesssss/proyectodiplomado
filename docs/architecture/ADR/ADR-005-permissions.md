# ADR-005: Autorización RBAC con ruta a ABAC

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Controlar qué puede hacer cada usuario por rol, por módulo y por tenant, con crecimiento futuro a reglas por atributos (ej. "ve solo sus propios clientes"), sin reescribir el sistema.

## Opciones

1. **RBAC clásico (roles → permisos).** Simple, auditable, apto para ERPs. Limitado para condiciones por dato.
2. **ABAC puro (políticas por atributos).** Máximo poder, alto costo de diseño, difícil de auditar y testear.
3. **RBAC como base + capa de políticas (ABAC) opcional por acción.** El 90% de casos se resuelve con permisos; los casos con condición pasan por un evaluador de política.

## Decisión

Opción 3.

- **Modelo:** `roles` (tenant-scoped) → `rolePermissions[]` → `permissions` con clave canónica `recurso:acción` (`customer:read`, `sales.order:create`, `accounting.journal:post`, `hr.salary:read`…). Catálogo central en `packages/permissions` compartido backend/frontend.
- **Evaluación:** middleware `requirePermission('sales.order:create')` que opera sobre los permisos del JWT (versados con `permVersion` para invalidación cuando cambia el rol).
- **ABAC:** interfaz `Policy.evaluate(subject, action, resource, context)` con una implementación `AllowByPermissionPolicy` por defecto; reglas por recurso (ownership, monto, sucursal) se añaden como políticas sin tocar los controllers. Preparado, no implementado todavía (**PARTIAL**).
- **Denegación por defecto:** sin permiso explícito → 403.
- **Separación de Concerns:** `401` = no autenticado; `403` = autenticado sin permiso o tenant distinto (nunca revelar existencia de recursos de otro tenant → respuesta idéntica a "no encontrado" cuando corresponda).
- Ejemplos obligatorios de matriz de permisos en `docs/security/permission-matrix.md`: VENDEDOR (clientes, cotizaciones, pedidos; no contabilidad/nómina/config) y ALMACÉN (stock, entradas/salidas/transferencias; no pólizas ni datos salariales).

## Motivo

RBAC es comprensible por usuarios no técnicos (ventaja frente a ERPs complejos) y ABAC opcional cubre los casos finos sin contaminar el núcleo.

## Consecuencias

- El catálogo de permisos debe versionarse; cambios rompen `permVersion` → fuerza re-login o refresh de permisos.
- Toda ruta nueva requiere declarar permiso en el route y test de 403.
- La búsqueda global y los reportes deben filtrar por permisos además de por tenant.
