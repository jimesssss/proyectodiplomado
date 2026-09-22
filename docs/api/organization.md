# API — Organization (`/api/v1/{organizations,companies,branches,departments,warehouses,cost-centers}`)

Estado: implementado (FASE 5). Roles provisionales hasta FASE 6 (RBAC).

## Jerarquía

```
Tenant (JWT)
└── organization        (raíz, sin padre)
    └── company         (padre: organization)
        ├── branch      (padre: company)
        │   ├── department  (padre: branch)
        │   └── warehouse   (padre: branch)
        └── costCenter  (padre: company)
```

## Reglas

- `tenantId` **siempre** del JWT: los bodies son Zod `strict` y rechazan cualquier campo extra (`tenantId`, `code` en PATCH, etc.) con `400`.
- El padre debe existir **dentro del mismo tenant**; un `parentId` ajeno o inexistente → `404` uniforme (sin revelar existencia).
- `code` único **por (tenantId, code)** — el mismo código en dos tenants está permitido.
- `GET /:id` de otro tenant → `404` idéntico a un inexistente.
- `code` es inmutable después de crearlo (rompería referencias); `name` y `status` sí se pueden editar.
- `DELETE` = soft-delete (`status: "archived"`); el dato se conserva para integridad referencial.

## Endpoints (por cada recurso)

| Método | Ruta   | Auth | Rol                   | Notas                                                     |
| ------ | ------ | ---- | --------------------- | --------------------------------------------------------- |
| POST   | `/`    | Sí   | `owner`/`super_admin` | 201; `parentId` obligatorio salvo en `organizations`      |
| GET    | `/`    | Sí   | —                     | Paginado: `page` (≥1), `limit` (1-100), `meta.total`      |
| GET    | `/:id` | Sí   | —                     | 200 solo si es del propio tenant                          |
| PATCH  | `/:id` | Sí   | `owner`/`super_admin` | `{ name?, status? }`; transición de estado inválida → 409 |
| DELETE | `/:id` | Sí   | `owner`/`super_admin` | Archiva (200); ya archivado → 409                         |

## Cuerpos

Crear (con padre):

```json
{ "code": "SCL-CENTRO", "name": "Sucursal Centro", "parentId": "64b0…" }
```

- `code`: 2-24, se normaliza a mayúsculas (`"acme group"` → `ACME-GROUP`).
- `name`: 1-120 recortado.

Crear (raíz): `{ "code": "ACME-GROUP", "name": "ACME Group" }` — enviar `parentId` → 400.

Actualizar: `{ "name": "…", "status": "active" | "archived" }` (ambos opcionales; al menos uno).

## Errores

| Caso                                                              | HTTP | Código             |
| ----------------------------------------------------------------- | ---- | ------------------ |
| Campos desconocidos / id mal formado                              | 400  | `VALIDATION_ERROR` |
| Sin token / token inválido                                        | 401  | `UNAUTHENTICATED`  |
| Sin rol de escritura                                              | 403  | `FORBIDDEN`        |
| Id ajeno/inexistente, padre ajeno                                 | 404  | `NOT_FOUND`        |
| `code` duplicado (mismo tenant), estado inválido, doble archivado | 409  | `CONFLICT`         |

## NOT TESTED / RISK

- **PARTIAL**: roles `owner`/`super_admin` provisionales (RBAC real en FASE 6).
- **NOT TESTED**: contra Atlas real; borrado físico de unidades (solo archivado); auditoría de cambios (FASE 7).
- La existencia de hijos al archivar el padre **no** se bloquea (el archivado es por unidad) — decisión documentada; evaluar regla de negocio en FASE 6+ si hace falta.
