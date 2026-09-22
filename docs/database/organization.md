# Base de datos — Organization (FASE 5)

Estado: implementado. Ver ADR-002 (modelo mixto) y ADR-003 (6 preguntas por colección).

## Colecciones

`organizations` · `companies` · `branches` · `departments` · `warehouses` · `costCenters`
(documentada también `locations` en el inventario de diseño → **NO creada en FASE 5**, fuera del alcance de convenciones §4).

Documento estándar (todas):

```js
{
  (_id, // ObjectId
    tenantId, // SIEMPRE presente (ADR-002)
    code, // 2-24 mayúsculas, único por tenant
    name, // 1-120
    status, // 'active' | 'archived' (soft-delete)
    createdAt,
    updatedAt,
    // + el campo de padre según el tipo:
    organizationId, // companies
    companyId, // branches, costCenters
    branchId); // departments, warehouses
}
```

## Índices (por colección, creados por el schema builder)

| Índice                            | Tipo   | Consulta justificante                               |
| --------------------------------- | ------ | --------------------------------------------------- |
| `{ tenantId, code }`              | unique | Alta/lookup por clave natural **dentro** del tenant |
| `{ tenantId, status, createdAt }` | —      | Listado paginado por tenant (`database.md` §3)      |
| `{ tenantId, <parentId> }`        | —      | Hijos de un padre (estructura/borrado lógico)       |

Sin `tenantId` **primero** no hay índice (regla ADR-002). No hay TTLs ni historiales en estas colecciones.

## Acceso

- Único camino: `modules/organization/infrastructure/repositories/org-repository.ts`
  (UNA implementación genérica parametrizada por tipo + registro explícito de los 6 modelos; toda operación filtra por `tenantId`).
- Número de modelos parametrizado: si un tipo necesita campos extra, se añade al `switch` de `PARENT_FIELD`.

## Verificación

- `npm run qa`: 12 tests de integración + 9 de seguridad + 8 unit (FASE 5) sobre `mongodb-memory-server`
  (índices creados en BD real de memoria). **Contra Atlas real: NOT TESTED** (sin credenciales — RISK heredado FASE 2).
