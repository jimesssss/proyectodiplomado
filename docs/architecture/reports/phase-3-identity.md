# Reporte de fase — FASE 3: IDENTITY

## ESTADO

**PASS**

## RESUMEN

Módulo identity completo con estructura `domain/application/infrastructure/presentation` + `index.ts` como única superficie pública:

- **Dominio puro**: `User`/`toPublicUser`, política de contraseñas (12+, mayúscula, minúscula, dígito) y regla de bloqueo (5 fallos/15 min → 15 min, ventana expirada reinicia) — sin dependencias externas.
- **Contraseñas**: Argon2id (`@node-rs/argon2`, parámetros OWASP 2024) con hash estable por salt y manejo de hash corrupto.
- **JWT RS256** (`core/auth/jwt.ts`): claims `sub/tenantId/roles/permissions/sid/iss/aud`; verifica algoritmo, issuer y audience; claves desde env (base64) o efímeras en dev/test con warning (producción exige claves — validado en `loadConfig`).
- **Middleware `requireAuth`**: extrae bearer → verifica JWT → comprueba sesión activa (checker inyectado; core no depende de módulos) → `request.user`.
- **Colecciones** (`users`, `roles`, `sessions`, `refreshTokens`, `loginAttempts`) con índices documentados en `docs/database/identity.md`: unique `(tenantId,email)`, unique `tokenHash`, TTLs en sessions/refreshTokens/loginAttempts.
- **Flujos**: login (anti-enumeración, anti-fuerza bruta, resolución de tenant), refresh con **rotación + detección de reutilización** (revoca familia), logout (revoca sesión + refresh), change-password (política + revoca otras sesiones), `GET /me`.
- **API**: 5 endpoints documentados en `docs/api/identity.md`.
- `createApp` ahora acepta `routes[]` inyectadas (composition root monta auth) — mantiene a `core` sin dependencias de módulos.

## ARCHIVOS CREADOS

- `apps/api/src/core/auth/{password.ts,jwt.ts,keys.ts,middleware.ts,auth.test.ts}`
- `apps/api/src/modules/identity/domain/entities/user.ts`
- `apps/api/src/modules/identity/domain/rules/{auth-rules.ts,auth-rules.test.ts}`
- `apps/api/src/modules/identity/application/auth-service.ts`
- `apps/api/src/modules/identity/infrastructure/schemas/{types.ts,collections.ts}`
- `apps/api/src/modules/identity/infrastructure/repositories/identity-repository.ts`
- `apps/api/src/modules/identity/presentation/validators/auth-validators.ts`
- `apps/api/src/modules/identity/presentation/routes/auth-routes.ts`
- `apps/api/src/modules/identity/index.ts`
- `tests/integration/identity.test.ts`
- `tests/security/identity-security.test.ts`
- `docs/api/identity.md`, `docs/database/identity.md`
- `docs/architecture/reports/phase-3-identity.md` (este)

## ARCHIVOS MODIFICADOS

- `apps/api/src/core/config/env.ts` (+auth vars: JWT_ISSUER/AUDIENCE, TTLs, claves; fail-fast en producción sin claves)
- `apps/api/src/core/http/app.ts` (soporte `routes[]`)
- `apps/api/src/types/express.d.ts` (`request.user`)
- `apps/api/src/index.ts` (composition root: jwt + auth router)
- `apps/api/package.json` (`jsonwebtoken`, `@node-rs/argon2`, `@types/jsonwebtoken`)

## APIs

`POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `POST /api/v1/auth/logout` · `POST /api/v1/auth/change-password` · `GET /api/v1/auth/me`

## COLECCIONES

`users` · `roles` · `sessions` · `refreshTokens` · `loginAttempts` (`mfaSettings` postergada — PARTIAL por diseño)

## ÍNDICES

- users: `{tenantId,email}` unique; `{tenantId,status}`
- roles: `{tenantId,key}` unique
- sessions: `{userId,revokedAt}`; `{expiresAt}` TTL 0
- refreshTokens: `{tokenHash}` unique; `{sessionId,revokedAt}`; `{expiresAt}` TTL 0
- loginAttempts: `{key}` unique; `{updatedAt}` TTL 7d

## TESTS (ejecución real — `npm run qa` completado)

```
typecheck (api + shared-types + tests) → 0 errores
lint (eslint .) → 0 · format:check (prettier) → OK
vitest → 15 archivos · 82 tests PASSED (0 fallidos, 0 pendientes)
build (tsc -b workspaces) → exit 0
```

Desglose de los suites nuevos de FASE 3:

- **unit** `auth-rules.test.ts` (6), `auth.test.ts` (8): política de contraseña, bloqueo/ventana, Argon2id, RS256 (firma, token manipulado, clave ajena, issuer/audience, expirado).
- **integration** `identity.test.ts` (13): login ok/401/anti-enumeración, resolución sin tenantId, `/me` 200/401/manipulado, rotación de refresh + reutilización revoca familia, logout invalida token, change-password (revoca otras sesiones, contraseña vieja muere), bloqueo 429, política débil 400, body inválido 400.
- **security** `identity-security.test.ts` (5): mismo email en dos tenants, login por tenant, tenantId del body no confiable, sin `$argon2` en respuestas, BD sin texto plano.

Total: **50 (FASE 2) + 32 nuevos = 82 tests PASSED** (ver salida real de `npm run qa`).

## ERRORES ENCONTRADOS

1. `TS2322` (FASE 2 corregido) no reapareció.
2. `hashRefreshToken` usaba `require()` en módulo ESM → resuelto con `createHash` de `node:crypto`.
3. **Mongoose 9 + tipos**: `ObjectId` de nivel superior de mongoose **no es** `Types.ObjectId` (verificado con `tsc`: `ObjectId extends Types.ObjectId` → `false`), por lo que los filtros `StrictCondition<ApplyBasicQueryCasting<…>>` rechazaban `new Types.ObjectId()`; `FilterQuery` ya no se exporta; `roles: readonly string[]` no asignable a `string[]`.
4. `auth.test.ts` importaba `../../errors/app-error.js` (ruta incorrecta desde `core/auth`) → `../errors/app-error.js`.
5. Fixtures `Env` de 3 tests (database/health/api-security) no incluían los nuevos campos JWT → completados.

## CORRECCIONES

- `types.ts` y repositorio migrados a `Types.ObjectId` (trampa documentada en el propio archivo).
- `[...(input.roles ?? [])]` para aceptar `readonly string[]`; `toUser(doc.toObject() as unknown as UserDoc)`.
- Import de `createHash` en ESM (`node:crypto`) en lugar de `require`.
- Imports de rutas `.js` correctos y fixtures `Env` actualizados.
- Limpieza de FASE 3 resuelta en FASE 4: `changePassword` ahora recibe `userId` (no un `User` fabricado) y el import dinámico redundante de `getProfile` se eliminó.

## RIESGOS

- **RISK**: el bloqueo por intentos solo se evalúa con `tenantId` explícito en el body; sin él, el intento se evalúa **tras** validar credenciales (evita DoS por enumeración) — pero un atacante que no envíe `tenantId` podría forzar cuentas con email único global. Mitigación propuesta: rate-limit por IP (pendiente).
- **RISK**: sin rate-limit general por IP en el endpoint de login (declarado, no implementado).
- **NOT TESTED**: MFA (diseñado, no implementado), recuperación de contraseña por email (fuera del alcance de esta fase; requiere workers/email — FASE posterior), `roles` CRUD (llega con RBAC FASE 6).
- **PARTIAL**: `permissions` siempre `[]` en el JWT hasta FASE 6.

## PRÓXIMA FASE

**FASE 4 — TENANCY**: colección `tenants`, CRUD admin, contexto de tenant persistido y usado por identity (hoy el tenant viene del registro de usuario), pruebas de aislamiento cruzado extendidas.
