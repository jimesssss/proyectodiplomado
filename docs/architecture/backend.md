# Arquitectura — Backend (apps/api)

Estado: Aceptado (FASE 1)

## 1. Organización por dominio

```
apps/api/src/
├── core/                        # Kernel del platform (no es un módulo de negocio)
│   ├── config/                  # Carga y valida env (Zod) — falla al arrancar si falta algo
│   ├── db/                      # Conexión Mongo, sesiones/transacciones, tipos de sesión
│   ├── http/                    # App Express, envelope, errores, middleware base
│   ├── auth/                    # AuthN: JWT, password hashing, sesiones
│   ├── authz/                   # AuthZ: evaluador RBAC/ABAC (ADR-005)
│   ├── tenant/                  # TenantContext y tipo branded TenantId
│   ├── audit/                   # Servicio único de auditoría (ADR-006)
│   ├── events/                  # Bus tipado + outbox (ADR-007)
│   ├── jobs/                    # Cola de trabajos y workers
│   ├── logging/                 # pino + requestId
│   ├── errors/                  # Error hierarchy + mapeo a HTTP
│   └── validation/              # Helpers Zod, parseo central
├── modules/                     # Módulos de dominio (negocio + plataforma)
│   ├── identity/   tenancy/   organization/   # CORE
│   ├── crm/  sales/  purchasing/  inventory/   # NEGOCIO
│   ├── accounting/  treasury/  manufacturing/  projects/
│   ├── service/  hr/                           # NEGOCIO
│   ├── reporting/  workflow/  notifications/   # PLATAFORMA
│   └── ai/                                     # PLATAFORMA
└── infrastructure/
    ├── integrations/            # Proveedores externos (email, storage, pasarelas)
    ├── jobs/                    # Implementación concreta de workers
    ├── events/                  # Suscripciones/aplicación de handlers
    └── config/
```

## 2. Estructura interna de un módulo

```
modules/inventory/
├── domain/           # PURA: sin Express, sin Mongoose, sin Node APIs de red
│   ├── entities/     # Entidades y aggregates (Stock, Product, Movement)
│   ├── valueObjects/ # Money, Quantity, Sku, StockState...
│   ├── rules/        # Reglas invariants (ej. ledger cuadra, estados válidos)
│   └── events/       # Tipos de evento que el módulo emite
├── application/
│   ├── commands/     # Casos de uso de escritura (transacción + eventos + audit)
│   ├── queries/      # Casos de uso de lectura (proyecciones, paginación)
│   └── services/     # Orquestación que cruza varios comandos/queries
├── infrastructure/
│   ├── repositories/ # Implementación del repositorio del dominio (Mongoose)
│   └── schemas/      # Modelos Mongoose — PRIVADOS del módulo
├── presentation/
│   ├── controllers/  # HTTP delgado: parse → useCase → envelope
│   ├── routes/       # Declaración de rutas + permiso requerido por endpoint
│   └── validators/   # Schemas Zod de entrada
└── index.ts          # Única superficie pública: tipos + servicios de aplicación
```

### Reglas de dependencia (obligatorias, validables con lint)

| Desde \ Hasta  | domain | application       | infrastructure     | presentation | Otro módulo       |
| -------------- | ------ | ----------------- | ------------------ | ------------ | ----------------- |
| presentation   | ✗      | ✅ vía `index.ts` | ✗                  | —            | ✗                 |
| application    | ✅     | —                 | ✗ (define puertos) | ✗            | ✗ solo `index.ts` |
| infrastructure | ✅     | ✗                 | —                  | ✗            | ✗                 |
| domain         | —      | ✗                 | ✗                  | ✗            | ✗                 |

- **Ningún módulo importa `schemas/`, `repositories/` ni colecciones de otro módulo.**
- Entre módulos: solo servicios públicos de `index.ts` o eventos tipados.
- Los repositorios son **intrínsecamente multi-tenant**: su interfaz exige `TenantId`.

## 3. Cómo se ve un caso de uso (patrón, no código final)

```
POST /api/v1/sales/orders   (permiso: sales.order:create)
  → validator (Zod)
  → authz (permiso) + tenantContext
  → CreateOrderHandler (application/commands)
      → domain rule: calcular totales, validar estado
      → repository.create(session, tenantId, ...)      # transacción si aplica
      → audit.record(...)                              # acción crítica
      → eventBus.emit('SalesOrderCreated', {...})      # outbox si es diferido
  → envelope 201 { success, data, meta, error: null }
```

## 4. Manejo de errores

Jerarquía: `AppError` → `DomainError` (regla de negocio, 422/409) · `ValidationError` (400) ·
`AuthenticationError` (401) · `AuthorizationError` (403) · `NotFoundError` (404) ·
`ConflictError` (409) · `InfrastructureError` (500, detalle solo en log).

- Un solo error handler global → envelope estándar, nunca stack trace al cliente.
- Todos los 5xx incluyen `requestId` en `meta` para soporte.
- `console.log` está prohibido por lint: usar logger estructurado.

## 5. Configuración

- `core/config` parsea `process.env` con Zod **al arrancar**; si falta una variable requerida el proceso no inicia (fail fast).
- `.env` nunca se commitea (`.gitignore`); `.env.example` documenta claves.
- Secretos de producción: variables de entorno inyectadas por el orquestador (no en Git).

## 6. Salud y operación

- `GET /api/v1/health` → estado del proceso y de la conexión a DB (sin detalles sensibles).
- `GET /api/v1/health/ready` → readiness (DB + outbox worker vivo).
- Graceful shutdown: cerrar server HTTP, terminar requests en curso, cerrar DB.

## 7. Validación de entrada

- Zod en **body, params, query** y metadata de archivos.
- Límites de tamaño de body y de paginación (`limit` máximo, ej. 100).
- Archivos: MIME allow-list + tamaño máximo + extensión coherente (metadata en MongoDB, binario en Object Storage).

## 8. TODO por implementar (no hecho todavía)

Express, config, DB, auth, audit, events, jobs y health checks → **FASE 2 (Core)**.
