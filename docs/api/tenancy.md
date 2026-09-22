# API — Tenancy (`/api/v1/tenants`)

Estado: implementado (FASE 4) · Autorización por permisos desde FASE 6 (RBAC, ADR-005).

## Reglas

- El `tenantId` **nunca** llega del cliente (ADR-002): el body es estricto y rechaza campos desconocidos con `400 VALIDATION_ERROR`.
- El `_id` del tenant ES el `tenantId` de todos los documentos de negocio.
- `GET /:id` solo resuelve el **propio** tenant (el del JWT); cualquier otro id responde `404` idéntico a un inexistente.
- Permisos: `GET /current` es solo-autenticada (perfil básico); `PATCH /current` exige `tenant:update`; los permisos `tenant:read`, `tenant:suspend` y `tenant:reactivate` son de **plataforma** y solo los tiene `super_admin` (el `owner` de un tenant NO los recibe — ver `docs/security/permission-matrix.md`).

## Endpoints

| Método | Ruta                      | Auth | Permiso             | Descripción                                           |
| ------ | ------------------------- | ---- | ------------------- | ----------------------------------------------------- |
| POST   | `/tenants`                | No   | —                   | Provisiona tenant + usuario owner (201)               |
| GET    | `/tenants/current`        | Sí   | —                   | Tenant del propio JWT (404 si no existe)              |
| PATCH  | `/tenants/current`        | Sí   | `tenant:update`     | Renombra el tenant propio (slug inmutable)            |
| GET    | `/tenants`                | Sí   | `tenant:read`       | Listado paginado (`page`, `limit`, `total`)           |
| GET    | `/tenants/:id`            | Sí   | —                   | Solo el propio tenant; ajeno/inexistente → 404        |
| POST   | `/tenants/:id/suspend`    | Sí   | `tenant:suspend`    | Suspende + revoca todas las sesiones del tenant (200) |
| POST   | `/tenants/:id/reactivate` | Sí   | `tenant:reactivate` | Reactiva un tenant suspendido (200)                   |

## POST `/tenants` (provisionamiento)

Request:

```json
{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "owner": {
    "email": "owner@acme.example",
    "password": "Erp-Secret-2026",
    "displayName": "Acme Owner"
  }
}
```

- `slug` es opcional: si no viene se deriva del `name` (minúsculas, sin acentos, guiones).
- Contraseña con la misma política que identity (12+, mayúscula, minúscula, dígito) → si falla, `400` y **no** se crea el tenant.
- `201` → `{ tenant, owner }` (owner con `roles: ["owner"]`; jamás hash ni contraseña).

Respuesta `201`:

```json
{
  "success": true,
  "data": {
    "tenant": {
      "id": "…",
      "slug": "acme-corp",
      "name": "Acme Corporation",
      "status": "active",
      "createdAt": "…"
    },
    "owner": {
      "id": "…",
      "email": "owner@acme.example",
      "tenantId": "…",
      "displayName": "Acme Owner",
      "roles": ["owner"],
      "status": "active"
    }
  },
  "meta": { "requestId": "…", "timestamp": "…" },
  "error": null
}
```

## GET `/tenants` (listado)

Query: `page` (≥1, defecto 1), `limit` (1-100, defecto 20).

`meta` incluye `page`, `limit` y `total` (convenciones §5). Orden `createdAt` desc.

## Estados y efectos

- `active → suspended` (`suspend`): además de cambiar estado, **revoca todas las sesiones y refresh tokens** del tenant → el corte es inmediato; y el login devuelve `403 FORBIDDEN ("Tenant suspended")` (solo tras verificar credenciales, para no revelar estado sin autenticarse).
- `suspended → active` (`reactivate`).
- Mismo estado dos veces → `409 CONFLICT`.

## Errores

| Caso                                               | HTTP | Código             |
| -------------------------------------------------- | ---- | ------------------ |
| Slug ya usado                                      | 409  | `CONFLICT`         |
| Password fuera de política / nombre/slug inválidos | 400  | `VALIDATION_ERROR` |
| Sin token / token inválido / sesión revocada       | 401  | `UNAUTHENTICATED`  |
| Permiso faltante (p. ej. `tenant:suspend` sin él)  | 403  | `FORBIDDEN`        |
| Tenant ajeno o inexistente                         | 404  | `NOT_FOUND`        |
| Estado inválido (doble suspensión, etc.)           | 409  | `CONFLICT`         |

## NOT TESTED / RISK

- **RISK**: `POST /tenants` es público (bootstrap de alta) **sin rate-limit por IP** — pendiente (junto al rate-limit de login declarado en FASE 3).
- **PARTIAL**: sin transacción real en el provisioning (Mongo standalone en test): si falla el owner se compensa borrando el tenant. En Atlas (replica set) migrar a `session.withTransaction` → **NOT TESTED**.
- El CRUD de usuarios/roles está en `/api/v1/users` y `/api/v1/roles` (FASE 6 — ver `docs/api/users-roles.md`).
