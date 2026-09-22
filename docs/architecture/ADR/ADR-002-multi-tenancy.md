# ADR-002: Multi-tenancy con colecciones compartidas y tenantId

Estado: Aceptado
Fecha: 2026-09-21

## Problema

El ERP debe alojar mústras empresas (tenants) con aislamiento total de datos, sin duplicar información entre empresas y con rendimiento y costos razonables en MongoDB Atlas.

## Opciones

1. **Base de datos por tenant.** Aislamiento fuerte, backups y borrado por tenant fáciles. Costo: N conexiones/pools, índices N veces, migraciones por tenant, difícil consultas globales del holding.
2. **Colecciones por tenant (prefijo/sufijo).** Evita colisión de índices; complica migraciones y descubrimiento de colecciones.
3. **Colecciones compartidas + campo `tenantId` en todo documento.** Un solo pool, migraciones únicas; el aislamiento depende de que **cada** consulta filtre por `tenantId`.

## Decisión

Opción 3. Todo documento de negocio lleva `tenantId`, `createdAt`, `updatedAt`.

Reglas críticas:

- `tenantId` se obtiene **solo** de `request.user.tenantId` (payload JWT verificado). Nunca de body, params, query ni headers del cliente.
- Todos los repositorios reciben un `TenantContext` obligatorio (tipo `TenantId` branded, no `string`) en su interfaz; un repositorio sin tenant no debe poder construirse.
- Índices compuestos **siempre** con `tenantId` como primer campo, acorde a los patrones de consulta reales.
- Índice único compuesto `(tenantId, claveNatural)` para claves naturales (email de usuario, código de producto) — sin restricción global entre tenants.
- Pruebas automáticas de aislamiento cruzado por módulo (clientes, productos, ventas, compras, inventario, facturas, pagos, reportes, proyectos, tickets, documentos, usuarios).
- Soft delete / retención documentada por colección (auditoría nunca se borra).

## Motivo

Simplicidad operativa en Atlas y coherencia con el volumen inicial. El riesgo de fugas se mitiga con capa obligatoria de repositorio + tests de seguridad, no con confianza en el código de presentación.

## Consecuencias

- Una consulta que olvide `tenantId` es un fallo crítico de seguridad → mitigado por:
  - repositorio como único camino a MongoDB,
  - tests de integración multi-tenant en CI,
  - revisión de PR con checklist específica.
- Un `aggregate` con `$lookup` debe arrastrar `tenantId` en el match.
- Migración futura a DB por tenant es viable solo si la capa de acceso está centralizada (así está diseñada).
