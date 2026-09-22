# Base de datos — Tenancy (`tenants`)

Estado: implementado (FASE 4). Ver ADR-002 (modelo mixto multi-tenant).

## Colección `tenants`

Es la **raíz** del multi-tenancy: su `_id` (ObjectId) ES el `tenantId` que lleva
todo documento de negocio. Por ser global, es la única colección **sin** campo
`tenantId`.

| Campo       | Tipo     | Reglas                                           |
| ----------- | -------- | ------------------------------------------------ |
| `_id`       | ObjectId | = `tenantId` (branded `TenantId` en código)      |
| `slug`      | string   | 3-32, `[a-z0-9-]`, normalizado, **único global** |
| `name`      | string   | 2-120, trim                                      |
| `status`    | string   | `active` \| `suspended` (defecto `active`)       |
| `createdAt` | Date     | `timestamps: true`                               |
| `updatedAt` | Date     | `timestamps: true`                               |

Documento estándar: `{ _id, slug, name, status, createdAt, updatedAt }`.

## Índices

| Índice                         | Tipo   | Justificación                                           |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `{ slug: 1 }`                  | unique | Clave natural global (URLs/subdominios) + alta ágil     |
| `{ status: 1, createdAt: -1 }` | —      | Listado admin: filtro por estado + paginación (sin N+1) |

No hay TTLs ni soft delete en esta fase (retención documentada en FASE 7 audit).

## Colecciones relacionadas (identidad, FASE 3)

- `users.tenantId` → `_id` de `tenants` (índice `{tenantId,email}` unique).
- `sessions`/`refreshTokens.tenantId` → al suspender el tenant se revocan
  (`updateMany {tenantId, revokedAt: null}`) — corte inmediato.

## Reglas de consulta

- Todo módulo de negocio filtra **siempre** por `tenantId` (ADR-002); el
  repositorio es el único camino a MongoDB.
- `tenants` es la excepción legítima: es el catálogo raíz y solo se consulta
  por `_id`/`slug` o con rol de plataforma.

## Comprobaciones

- `npm run qa`: índices creados por Mongoose en `mongodb-memory-server` (12 tests
  de integración + 10 de seguridad en FASE 4). Contra **Atlas real: NOT TESTED**
  (sin credenciales en este entorno — RISK heredado de FASE 2).
