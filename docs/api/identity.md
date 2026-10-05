# API — Identity / Auth (FASE 3)

Prefijo: `/api/v1/auth`. Todas las respuestas usan el envelope estándar.

## POST /api/v1/auth/login

Pública.

Body:

```json
{ "email": "user@empresa.com", "password": "…", "tenantId": "opcional-hex24" }
```

- `tenantId` es solo **pista de resolución**: el tenant autoritativo del JWT proviene del registro del usuario en BD.
- Sin `tenantId`, el email debe identificar un único usuario (si hay dos tenants con el mismo email, debe indicarse el tenant).

`200` → `{ accessToken, refreshToken, expiresIn, user: { id, email, tenantId, displayName, roles, status } }`

Errores:

- `401 UNAUTHENTICATED` "Invalid credentials" — contraseña incorrecta o email inexistente (mensaje idéntico, sin enumeración).
- `403 FORBIDDEN` "Account disabled".
- `429 RATE_LIMITED` — 5 fallos en 15 min (evaluación de bloqueo solo cuando viene `tenantId` explícito; ver RISK en reporte).
- `400 VALIDATION_ERROR`.

## POST /api/v1/auth/refresh

Pública. Body: `{ "refreshToken": "…" }`

- Rotación obligatoria: cada uso devuelve un `refreshToken` nuevo.
- **Reutilización** de un token ya usado → revoca la sesión completa (familia) y responde `401` (posible robo).
- `401` para token inválido/expirado/revocado.

## POST /api/v1/auth/logout

Requiere `Authorization: Bearer`. Revoca la sesión y todos sus refresh tokens. `200 { loggedOut: true }`.

## POST /api/v1/auth/change-password

Requiere `Authorization: Bearer`. Body: `{ "currentPassword", "newPassword" }`

- Verifica la actual (`401` si falla).
- Política: mínimo 12 caracteres, mayúscula, minúscula y dígito (`400` con `details.issues`).
- `409` si la nueva es igual a la actual.
- Revoca **todas** las sesiones excepto la actual.

## POST /api/v1/auth/forgot-password

Pública. Body: `{ "email": "user@empresa.com" }`

- Normaliza el email y envía un enlace de recuperación mediante Resend si la cuenta existe y está activa.
- Siempre devuelve `200` con el mismo mensaje genérico, sin revelar si la cuenta existe.
- El token aleatorio solo se almacena como SHA-256 y expira en una hora.

## POST /api/v1/auth/reset-password

Pública. Body: `{ "token": "…", "newPassword": "…" }`

- Aplica la política existente: mínimo 12 caracteres, mayúscula, minúscula y dígito.
- El token debe existir y no haber expirado ni sido utilizado.
- Al consumirse, actualiza la contraseña con Argon2id y elimina el token y su expiración.
- Revoca todas las sesiones y refresh tokens anteriores.
- `200 { passwordReset: true }` al completar; `400 VALIDATION_ERROR` para contraseña no válida o token inválido/expirado/usado.

## GET /api/v1/auth/me

Requiere `Authorization: Bearer`. `200` → perfil público (sin hash). `401` sin token, con token inválido o sesión revocada.

## Garantías

- Contraseñas: **Argon2id** (m=19456, t=2, p=1). Nunca texto plano; nunca en respuestas ni logs.
- Access JWT: **RS256**, TTL 900 s; claims `sub, tenantId, roles, permissions, pv, sid, iss, aud`.
  `permissions` se resuelven del catálogo RBAC al hacer login/refresh (FASE 6) y `pv` es la versión del catálogo (tokens con `pv` viejo → `403` en rutas con `requirePermission`).
- Refresh: token opaco de 48 bytes, guardado como SHA-256; TTL 2592000 s; rotación + detección de reutilización.
- `401` en: token ausente, malformado, manipulado, expirado, firma ajena, sesión revocada.
