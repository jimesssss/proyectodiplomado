# ADR-004: Autenticación

Estado: Aceptado
Fecha: 2026-09-21

## Problema

Autenticar usuarios multiempresa en web y mobile con sesiones revocables, sin exponer credenciales y dejando puerta a MFA.

## Opciones

1. **Sesiones en servidor (cookie de sesión).** Revocación inmediata. Difícil con clientes móviles nativos y APIs sin cookies.
2. **JWT stateless puro (sin estado).** Escala bien, pero no se puede revocar sin blacklist → riesgo ante robo de token.
3. **Access JWT corto + refresh token rotativo persistido.** Revocación por rotación/flag en servidor, UX buena en mobile.

## Decisión

Opción 3.

- **Access token JWT** (≤ 15 min) con claims mínimos: `sub` (userId), `tenantId`, `roles`, `permissions` (o hash/version de permisos), `sid` (session id), `iat`, `exp`, `iss`, `aud`. Firmado con algoritmo **RS256** (clave privada en secret manager; nunca en Git).
- **Refresh token** (≤ 30 días) con **rotación obligatoria** y detección de reutilización → revoca toda la sesión (`refreshTokens` collection: `tokenHash`, `userId`, `tenantId`, `sessionId`, `expiresAt`, `usedAt`, `ip`, `userAgent`).
- **Password hashing:** Argon2id (preferido) o bcrypt cost ≥ 12. Nunca texto plano, nunca MD5/SHA simple.
- **Endpoints:** login, logout (revoca sesión), refresh (rotación), change-password (invalida otras sesiones), forgot/reset password (token de un solo uso con expiración, respuesta idéntica exista o no el email).
- **Bloqueo por intentos:** `loginAttempts` con backoff exponencial + CAPTCHA tras umbral; cuenta y por IP.
- **MFA (preparado):** `mfaSettings` con TOTP; interface `MfaProvider` sin implementar todavía (PARTIAL por diseño, fase posterior).
- **Cookies `httpOnly; Secure; SameSite=Strict`** en web para refresh; mobile guarda refresh en secure storage.
- Todo login/logout/refresh/cambio de contraseña genera **audit log**.

## Motivo

Cubre web y mobile sin cookies obligatorias en mobile, permite revocación real y cumple con "no almacenar contraseñas en texto plano".

## Consecuencias

- Requiere manejo de `kid`/rotación de claves JWT.
- Requiere pruebas: token inválido → 401, token expirado → 401, refresh reutilizado → 401 + revocación.
- El claims `tenantId` del JWT es la **única** fuente de tenant (ver ADR-002).
