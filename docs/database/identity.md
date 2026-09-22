# Identity — Colecciones (FASE 3)

Colecciones creadas por el módulo identity. Todas son privadas del módulo:
otro módulo debe usar `modules/identity/index.ts`, nunca la colección directa.

## users

| Campo                   | Tipo                | Notas                                   |
| ----------------------- | ------------------- | --------------------------------------- |
| `_id`                   | ObjectId            |                                         |
| `email`                 | string              | lowercase, trim en aplicación           |
| `tenantId`              | string              | ObjectId hex                            |
| `passwordHash`          | string              | Argon2id (`$argon2id$…`)                |
| `displayName`           | string              |                                         |
| `roles`                 | string[]            | claves de rol (catálogo RBAC en FASE 6) |
| `status`                | `active`/`disabled` |                                         |
| `createdAt`/`updatedAt` | Date                | timestamps                              |

Índices:

- `{ tenantId: 1, email: 1 }` **unique** — login por (tenant, email); un mismo email puede existir en dos tenants.
- `{ tenantId: 1, status: 1 }` — listados por estado dentro del tenant.

Consultas justificantes: `findOne({tenantId, email})` (login), `findOne({_id})` (`/me`).

## roles

`{ tenantId, key, name, description?, timestamps }`

- `{ tenantId: 1, key: 1 }` **unique**.

## sessions

`{ userId, tenantId, ip?, userAgent?, expiresAt, revokedAt? }`

- `{ userId: 1, revokedAt: 1 }` — sesiones activas de un usuario.
- `{ expiresAt: 1 }` **TTL expireAfterSeconds: 0** — purga automática.

## refreshTokens

`{ tokenHash, sessionId, userId, tenantId, expiresAt, usedAt?, revokedAt? }`

- `{ tokenHash: 1 }` **unique** — SHA-256 del token opaco (la BD no guarda el token en claro).
- `{ sessionId: 1, revokedAt: 1 }` — revocación por sesión.
- `{ expiresAt: 1 }` **TTL 0**.

## loginAttempts

`{ key, count, windowStart, lockedUntil?, updatedAt }`

- `{ key: 1 }` **unique** — clave `tenantId:email`.
- `{ updatedAt: 1 }` **TTL 7 días** — limpieza automática.

Regla de dominio: 5 fallos en 15 min → bloqueo 15 min (`auth-rules.ts`).

## mfaSettings

Definida en ADR-004 como **preparada, no implementada** (PARTIAL): llega con la FASE de MFA posterior; no se crea colección vacía sin uso.

---

Nota de retención: `users` y `roles` no usan TTL; el borrado es semántico (`status: disabled`) o físico por decisión de tenant (a documentar en retención cuando exista el módulo de administración de tenant).
