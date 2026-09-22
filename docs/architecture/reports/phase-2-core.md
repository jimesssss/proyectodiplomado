# Reporte de fase — FASE 2: CORE

## ESTADO

**PASS**

## RESUMEN

Implementado el núcleo del API (sin módulos de negocio):

- **Configuration**: `core/config/env.ts` con Zod + fail fast (el proceso no arranca con env inválido).
- **Logging**: `core/logging/logger.ts` (pino JSON, redacción de passwords/tokens, ISO time).
- **Errores**: jerarquía `AppError` con código + status + `expose` (`errors/app-error.ts`); `normalizeError` mapea JSON malformado → 400, 413 → `PAYLOAD_TOO_LARGE`, resto → 500 sin exponer mensaje.
- **HTTP foundation**: `createApp` con helmet → CORS allow-list (`CORS_ORIGINS`) → body limit 1 MB → `X-Request-Id` (solo cabecera segura, si no UUID) → log por request (path sin query) → rutas → 404 envelope → error handler único envelope.
- **Envelope**: `successResponse`/`errorResponse` (error con `meta` solo `requestId`, según contrato API). `shared-types` ajustado a `ApiErrorMeta`.
- **Validación**: middleware `validate({body,params,query})` con Zod → 400 + `details.issues[]`.
- **MongoDB foundation**: `connectDatabase`/`disconnectDatabase`/`isDatabaseConnected` (ping real) + eventos de conexión logueados.
- **Tenant foundation**: tipo `TenantId` branded + `asTenantId` validado (requisito de compilación para repositorios).
- **Health checks**: `GET /api/v1/health` (liveness) y `GET /api/v1/health/ready` (DB ping → 200/503).
- **Composition root**: `src/index.ts` (config → DB → listen → graceful shutdown con SIGINT/SIGTERM y timeout de fuerza).
- **Testing foundation**: `tests/` con `tsconfig` propio typechecked en el gate; `mongodb-memory-server` para tests de integración contra MongoDB real; `scripts/smoke.mjs` de arranque real.
- **Docs**: `docs/api/core.md` documenta los endpoints y el comportamiento transversal.

## ARCHIVOS CREADOS

- `apps/api/src/index.ts` (reescrito: composition root)
- `apps/api/src/types/express.d.ts`
- `apps/api/src/core/config/env.ts` · `env.test.ts`
- `apps/api/src/core/logging/logger.ts`
- `apps/api/src/core/errors/app-error.ts` · `app-error.test.ts`
- `apps/api/src/core/http/app.ts` · `envelope.ts` · `envelope.test.ts` · `error-handler.ts` · `error-handler.test.ts` · `not-found.ts` · `request-id.ts` · `request-id.test.ts` · `request-logger.ts`
- `apps/api/src/core/http/routes/health.ts`
- `apps/api/src/core/validation/validate.ts` · `validate.test.ts`
- `apps/api/src/core/db/database.ts`
- `apps/api/src/core/tenant/tenant-id.ts` · `tenant-id.test.ts`
- `tests/package.json` · `tests/tsconfig.json`
- `tests/integration/health.test.ts` · `tests/integration/database.test.ts`
- `tests/security/api-security.test.ts`
- `scripts/smoke.mjs`
- `docs/api/core.md` · `docs/architecture/reports/phase-2-core.md` (este archivo)

## ARCHIVOS MODIFICADOS

- `package.json` (typecheck incluye `tests/`; `"type": "module"`)
- `packages/shared-types/src/index.ts` (`ApiErrorMeta`), `index.test.ts`
- `apps/api/package.json` (deps: express, helmet, cors, zod, pino, mongoose + dev: supertest, types)

## APIs

| Método | Ruta                   | Auth    | Estado       |
| ------ | ---------------------- | ------- | ------------ |
| GET    | `/api/v1/health`       | pública | implementada |
| GET    | `/api/v1/health/ready` | pública | implementada |

## COLECCIONES

Ninguna creada (solo conexión base). Colecciones de negocio en FASE 3+.

## ÍNDICES

Ninguno.

## TESTS (resultado real de ejecución)

```
typecheck (api + shared-types + tests) → 0 errores
lint → 0 errores/warnings
format:check → OK
vitest run → 11 archivos, 50 tests, 50 passed, 0 failed
build → exit 0
fail-fast binario: node apps/api/dist/index.js sin MONGODB_URI → exit 1 con log fatal
smoke: mongod en memoria + servidor real → health=200, ready=200 (database up)
```

Cobertura por tipo:

- **Unit** (37): config, jerarquía de errores, envelope, error-handler/normalize, validate, request-id, tenant-id, shared-types.
- **Integration** (8): health/ready sin DB (503), 404 envelope, JSON malformado, conexión real a mongod (memory server) → ready 200 → tras disconnect → 503.
- **Security** (8): helmet headers, sin `X-Powered-By`, CORS allow-list (origen no listado rechazado), `X-Request-Id` seguro/malicioso, sin fuga de stack en 404/400, límite 413.
- **E2E**: NOT TESTED (no hay UI todavía).

## ERRORES ENCONTRADOS

1. `TS2322` en `validate.ts`: `result.data` (`unknown`) asignado a `req.params`/`req.query`.
2. `TS1295` (ECMAScript imports en archivo CommonJS con `verbatimModuleSyntax`) en `tests/` y `vitest.config.ts`: la raíz y `tests/` no tenían `"type": "module"`.
3. `TS2305`: import inexistente `PayloadTooLargeSource` en un test.
4. Duplicación de `notFoundHandler` en dos archivos (creado por mí durante la fase).

## CORRECCIONES

1. Cast tipado `result.data as typeof req.params/query` (la validez ya la garantiza Zod).
2. `"type": "module"` en `package.json` raíz y `tests/package.json`.
3. Import eliminado y test redundante eliminado.
4. `not-found-placeholder.ts` eliminado; único `not-found.ts`.

## RIESGOS

- **NOT TESTED**: MongoDB Atlas real (los tests usan mongod en memoria 8.2.6; versión/driver compatibles pero Atlas no verificado).
- **NOT TESTED**: transacciones multi-documento (`startSession`) — se verifican en FASE 11 (stock).
- **RISK**: Express 5 + helmet/cors/mongoose sin pin de versión exacta (hay `package-lock`, pero sin Dependabot/renovate).
- **RISK**: sin CI remoto (gate local `npm run qa` + `scripts/smoke.mjs`).
- **PARTIAL**: rate limiting y request body schema global no implementados (evaluar con medición real).

## PRÓXIMA FASE

**FASE 3 — IDENTITY**: `users`, `roles`, `sessions`, `refreshTokens` (rotación), `loginAttempts`; login/logout/refresh/change-password con Argon2id + JWT RS256 (o HS256 documentado si no hay claves), middleware de autenticación, auditoría de eventos de auth y pruebas 401/403/lockout.
