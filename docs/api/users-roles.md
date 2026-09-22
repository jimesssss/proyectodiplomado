# API — Users, Roles y Permissions (`/api/v1/users`, `/roles`, `/permissions`)

Estado: implementado (FASE 6 — RBAC, ADR-005). Ver `docs/security/permission-matrix.md`.

## Reglas

- `tenantId` **siempre** del JWT: bodies Zod `strict` (cualquier campo extra → `400`); usuarios y roles jamás cruzan de tenant (`:id` ajeno → `404` uniforme, idéntico a un inexistente).
- **No hay `DELETE /users`**: se deshabilita (`status: disabled`) para conservar la integridad (FK de auditoría/ventas futuras).
- Al cambiar **los roles** o **el estado** de un usuario se revocan TODAS sus sesiones: los JWT vigentes mueren (`401`) y el re-login refleja los permisos nuevos.
- Cambiar los `permissions` de un rol NO revoca sesiones: los tokens vigentes quedan con permisos viejos hasta el próximo login/refresh (**stale → sigue con lo anterior**, comprobado en tests).
- Claves de rol reservadas: `owner`, `super_admin` (embutidos: no existen como documentos, no se pueden crear/editar/borrar → `400`/`404`).
- Permisos desconocidos (fuera del catálogo) → `400` con `details.issues`.
- `GET /permissions` devuelve el catálogo **constante en código** (`@erp/permissions`) con `version` (`pv` del JWT): no es una colección ni se escribe por API.

## Endpoints

### `/users`

| Método | Ruta   | Auth | Permiso       | Notas                                            |
| ------ | ------ | ---- | ------------- | ------------------------------------------------ |
| GET    | `/`    | Sí   | `user:read`   | Paginado (`page`, `limit`, `total`), solo tenant |
| GET    | `/:id` | Sí   | `user:read`   | Ajeno/inexistente → 404 uniforme                 |
| POST   | `/`    | Sí   | `user:create` | 201; política de contraseña; email único/tenant  |
| PATCH  | `/:id` | Sí   | `user:update` | `{ displayName?, status?, roles? }` (≥1 campo)   |

Crear:

```json
{
  "email": "vendedor@acme.example",
  "password": "Erp-Secret-2026",
  "displayName": "Vendedor Uno",
  "roles": ["vendedor"]
}
```

- `roles` debe existir en el tenant (o ser embutido) → si no, `400 {"message":"Unknown role"}`.
- Respuesta: `PublicUser` (sin `passwordHash` jamás).

### `/roles`

| Método | Ruta   | Auth | Permiso       | Notas                                                    |
| ------ | ------ | ---- | ------------- | -------------------------------------------------------- |
| GET    | `/`    | Sí   | `role:read`   | Paginado; no expone `tenantId`                           |
| GET    | `/:id` | Sí   | `role:read`   | Ajeno/inexistente → 404 uniforme                         |
| POST   | `/`    | Sí   | `role:create` | 201; `key` única por tenant (dup → 409)                  |
| PATCH  | `/:id` | Sí   | `role:update` | `{ name?, description?, permissions? }`; `key` inmutable |
| DELETE | `/:id` | Sí   | `role:delete` | 200; en uso por usuarios → 409                           |

- `key`: 2-32, minúsculas/dígitos/guiones, empieza por letra; reservadas (`owner`, `super_admin`) → 400.
- `permissions`: claves del catálogo, deduplicadas; desconocida → 400.

### `/permissions`

| Método | Ruta | Auth | Permiso | Notas                                               |
| ------ | ---- | ---- | ------- | --------------------------------------------------- |
| GET    | `/`  | Sí   | —       | `{ version, permissions[], groups{} }` del catálogo |

## Errores

| Caso                                                                   | HTTP | Código             |
| ---------------------------------------------------------------------- | ---- | ------------------ |
| Campos desconocidos / id mal formado / clave inválida / password débil | 400  | `VALIDATION_ERROR` |
| Sin token / token inválido / sesión revocada                           | 401  | `UNAUTHENTICATED`  |
| Permiso faltante / `pv` desactualizado                                 | 403  | `FORBIDDEN`        |
| Id ajeno o inexistente                                                 | 404  | `NOT_FOUND`        |
| Email o `key` duplicado (mismo tenant), rol en uso                     | 409  | `CONFLICT`         |

## NOT TESTED / RISK

- **PARTIAL**: ABAC (`Policy.evaluate`) solo diseñado, no implementado (ADR-005).
- **PARTIAL**: al editar permisos de un rol NO se revocan sesiones de los usuarios con ese rol (stale hasta re-login) — decisión documentada; evaluar revocación en lote cuando exista event bus.
- **NOT TESTED**: recuperación/reset de contraseña por email; MFA; Atlas real.
- Cambio de `permissions` de usuarios embutidos (`owner`/`super_admin`): no aplica (resuelven del catálogo).
