# Arquitectura — Visión general

Estado: Aceptado (FASE 1)
Fecha: 2026-09-21
ADR relacionados: ADR-001 … ADR-008

## 1. Principios

1. **Monolito modular** con límites explícitos (ADR-001), extraíble a microservicios por módulo.
2. **Multi-tenancy por `tenantId` en colecciones compartidas**, tenant siempre desde el JWT (ADR-002).
3. **Dominio puro**: los módulos no conocen Express, Mongoose ni HTTP (ADR-003).
4. **Denegación por defecto** en autorización; RBAC + ruta ABAC (ADR-005).
5. **Auditoría append-only** y events tipados (ADR-006, ADR-007).
6. **IA desacoplada** tras una capa de permisos y tools autorizadas (ADR-008).
7. UX simple: el ERP no debe parecer un laberinto de opciones.

## 2. Diagrama de despliegue lógico

```
USUARIO
  ↓
React Native (mobile app)          React Native Web (navegador)
  ↓ API Client (HTTPS, JSON)  ←→  ↕
        ↘                       ↙
         HTTPS / TLS 1.2+
              ↓
   Node.js + Express (apps/api)
              ↓
   Middleware: requestId → validation (Zod) → AuthN (JWT)
              → AuthZ (RBAC) → TenantContext (del JWT)
              ↓
   ERP Modular Monolith (apps/api/src/core/modules/*)
       ├── application services ── domain (puro)
       └── repositories ────────── MongoDB Atlas
              ↓
   EventBus in-process + Outbox → Workers/Jobs (email, reportes, IA, imports)
   Object Storage (archivos) · Cache (solo si medido necesario)
```

## 3. Capas de una petición

| #   | Capa                | Responsabilidad                                                  | Falla con             |
| --- | ------------------- | ---------------------------------------------------------------- | --------------------- |
| 1   | HTTP server         | Rutas `/api/v1/*`, CORS, helmet, body limits                     | 404                   |
| 2   | requestId           | ID correlacionado en logs, audit y respuesta `meta`              | —                     |
| 3   | Validation          | Zod en body/params/query/ archivos                               | 400 + `error.details` |
| 4   | AuthN               | JWT access token válido                                          | 401                   |
| 5   | AuthZ               | Permiso `recurso:acción` requerido por la ruta                   | 403                   |
| 6   | TenantContext       | `tenantId` desde `request.user`, inyectado como tipo obligatorio | 403                   |
| 7   | Application service | Orquestación, reglas, transacción, eventos                       | error tipado          |
| 8   | Domain              | Reglas puras (sin I/O)                                           | error de dominio      |
| 9   | Repository          | Único acceso a MongoDB, filtra `tenantId` siempre                | 500 (error interno)   |

Reglas invariantes:

- Ninguna capa superior salta a la 9 directamente (revisable por lint y code review).
- El `tenantId` del body/query/params **se descarta**; solo vale el del JWT.
- Los errores nunca escalan crudos al cliente: envelope estándar + log interno con `requestId`.

## 4. Estructura del monorepo

```
ERP/
├── apps/
│   ├── api/          # Node.js + Express + TypeScript (monolito modular)
│   ├── web/          # React Native Web (bundler: Expo/Metro o react-native-web + webpack)
│   └── mobile/       # React Native (iOS/Android) + módulos Kotlin puntuales
├── packages/
│   ├── shared-types/      # Tipos de dominio y envelope API (creado, FASE 0.5)
│   ├── shared-validation/ # Esquemas Zod compartidos frontend/backend
│   ├── shared-ui/         # Componentes design-system (RN + RN Web)
│   ├── api-client/        # Cliente tipado para /api/v1 (usado por web y mobile)
│   └── permissions/       # Catálogo canónico de permisos `recurso:acción`
├── config/                 # Config compartida (tsconfig base, babel, env schema)
├── infrastructure/
│   ├── docker/             # docker-compose (mongo local, mailhog, minio)
│   ├── deployment/         # definiciones de despliegue
│   └── monitoring/         # dashboards, alerts
├── scripts/                # scripts de QA/CI (`.cmd`/`.mjs`, no `.ps1` por policy)
├── docs/                   # esta documentación
└── tests/                  # integration / security / e2e / performance
```

`apps/api` **no** contiene `controllers/` globales: su interior es `core/` + `modules/` (ver `02-backend.md`).

## 5. Decisiones de dependencias (resumen)

| Necesidad    | Elección                                                       | Justificación                                             |
| ------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| HTTP         | Express 5                                                      | Requisito del stack; middleware maduro                    |
| Validación   | Zod                                                            | Compartir schemas front/back, derivar tipos               |
| Persistencia | Mongoose (o mongodb driver)                                    | Requisito MongoDB; repositorio aísla la elección          |
| Auth         | `jsonwebtoken` RS256 + Argon2id (`argon2` o `@node-rs/argon2`) | ADR-004                                                   |
| Logs         | pino                                                           | JSON estructurado, bajo overhead                          |
| Tests        | Vitest + Supertest + Playwright                                | Ya operativo (unit), integración/e2e en fases posteriores |
| Build        | tsc (composite)                                                | TS obligatorio, sin bundler innecesario en API            |

Cada adición futura pasa por la checklist de dependencias (necesidad, mantenimiento, seguridad, compatibilidad, tamaño, licencia).

## 6. Coherencia verificada en FASE 1

- Estructura de carpetas ↔ ADR-001 (límites de módulo) coherentes.
- Cadena de petición ↔ ADR-002/004/005/006 coherentes (tenant/AuthN/AuthZ/audit en capas separadas).
- Modelo de datos ↔ ADR-003 coherente con ledger de stock y asientos.
- Events ↔ ADR-007 sin broker externo al inicio; outbox para efectos secundarios.
- Testing ↔ `docs/qa/*`: misma pirámide y gates de fase.

Pendiente de validación real (NOT TESTED hasta FASE 2): Express 5 + middleware, Mongoose vs driver puro, transacciones Atlas.
