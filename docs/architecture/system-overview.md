# System Overview — ERP Empresarial Modular

Estado del documento: **DIAGNÓSTICO (FASE 0)**
Fecha: 2026-09-21
Autor: Equipo de desarrollo ERP (rol combinado arquitecto/analista/dev/qa)

---

## 1. Diagnóstico del repositorio actual

Se inspeccionó el directorio de trabajo completo (`C:\Proyecto`), incluyendo archivos ocultos.

| Área                      | Estado             | Evidencia                                  |
| ------------------------- | ------------------ | ------------------------------------------ |
| Estructura de proyecto    | **INEXISTENTE**    | Directorio con 0 entradas                  |
| `package.json`            | **NO EXISTE**      | Glob `**/package.json` sin resultados      |
| `tsconfig.json`           | **NO EXISTE**      | Glob `**/tsconfig*.json` sin resultados    |
| `.env` / configuración    | **NO EXISTE**      | Glob `**/.env*` sin resultados             |
| Código fuente (ts/tsx/js) | **NO EXISTE**      | Glob `**/*.{ts,tsx,js,jsx}` sin resultados |
| Documentación (md/yml)    | **NO EXISTE**      | Glob `**/*.{md,yml,yaml}` sin resultados   |
| Git                       | **NO DISPONIBLE**  | `git` no está instalado ni en PATH         |
| Node.js                   | **NO DISPONIBLE**  | `node` no está instalado ni en PATH        |
| npm                       | **NO DISPONIBLE**  | `npm` no está instalado ni en PATH         |
| Tests                     | **NO EXISTEN**     | No hay framework de testing instalado      |
| MongoDB Atlas             | **NO CONFIGURADO** | No hay credenciales ni capa de datos       |
| Frontend (RN/Web)         | **NO EXISTE**      | —                                          |
| Backend (Express)         | **NO EXISTE**      | —                                          |

**Conclusión:** el proyecto es un repositorio en blanco. No hay deuda técnica, no hay código previo generado por otra IA, no hay vulnerabilidades existentes porque no existe código. Tampoco hay nada que migrar.

### 1.1 Bloqueantes de entorno detectados

1. **Node.js y npm no instalados** → no se puede compilar TypeScript, instalar dependencias ni ejecutar tests.
2. **Git no instalado** → no hay historial de versiones, no se pueden aplicar las convenciones de commit del prompt.
3. **PowerShell 5.1** con salida en codepage local (tildes corruptas en errores) → recomendar `chcp 65001` o PowerShell 7 para logs legibles.

Ningún bloqueante de código existe todavía, pero **ninguna FASE posterior (1–20) puede validarse sin toolchain**. La regla 56 ("no reportar una prueba como exitosa si no fue ejecutada") obliga a declarar TODO como **NOT TESTED** hasta instalar toolchain.

---

## 2. Arquitectura encontrada

**No hay arquitectura implementada.** La arquitectura existente solo existe como especificación textual en el prompt maestro.

---

## 3. Propuesta de arquitectura (entra en FASE 1)

### 3.1 Decisiones de alto nivel

- **Monolito modular** (no microservicios), con límites de módulo explícitos: cada módulo expone un `index.ts` público; prohibido importar `infrastructure/` o `schemas/` de otro módulo.
- **Monorepo** con workspaces npm (o pnpm): `apps/*` y `packages/*`.
- **TypeScript estricto** en backend y frontend (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **Multi-tenancy por `tenantId` en colecciones compartidas**, con `tenantId` derivado **exclusivamente del JWT**, nunca del body/params/query del cliente.
- **API REST versionada** `/api/v1` con envelope de respuesta único (`success/data/meta/error`).
- **Capa de dominio pura** (sin dependencias de Express/Mongoose) dentro de cada módulo, para permitir extracción futura a microservicios.

### 3.2 Estructura objetivo del monorepo

```
ERP/
  apps/
    web/            # React Native Web (o Expo web)
    mobile/         # React Native
    api/            # Node.js + Express + TypeScript
  packages/
    shared-types/
    shared-validation/   # schemas Zod compartidos frontend/backend
    shared-ui/
    api-client/
    permissions/
  config/
  infrastructure/
    docker/
    deployment/
    monitoring/
  scripts/
  docs/
    architecture/ADR/
    api/
    database/
    security/
    qa/
    modules/
    development/
  modules/          # (lógica interna vive en apps/api/src/core/modules)
  tests/
    unit/
    integration/
    security/
    e2e/
    performance/
```

### 3.3 Backend por dominio

```
apps/api/src/
  core/                 # kernel: config, db, errors, logging, events, jobs, auth middleware
  modules/
    identity/  tenancy/  organization/  crm/  sales/  purchasing/
    inventory/  accounting/  treasury/  manufacturing/  projects/
    service/  hr/  reporting/  workflow/  notifications/  ai/
  infrastructure/
    integrations/  jobs/  events/  config/
```

Cada módulo con `domain/ application/ infrastructure/ presentation/ index.ts` (hexagonal ligera).

### 3.4 Capas de la petición

```
RN/Web → HTTPS → Express → Validation → AuthN (JWT) → AuthZ (RBAC/ABAC)
→ TenantContext (del JWT) → Módulo de dominio → Repositorio (MongoDB) → Mongo Atlas
```

---

## 4. Problemas detectados

| #   | Problema                                             | Severidad          | Estado                                 |
| --- | ---------------------------------------------------- | ------------------ | -------------------------------------- |
| P1  | Repositorio vacío                                    | Alta (informativo) | Esperado en FASE 0                     |
| P2  | Node/npm ausentes                                    | **Crítica**        | Abierta — bloquea FASE 1+              |
| P3  | Git ausente                                          | **Crítica**        | Abierta — bloquea control de versiones |
| P4  | Sin variables de entorno ni gestor de secretos       | Alta               | Abierta                                |
| P5  | Sin MongoDB Atlas verificado (credenciales/base/red) | Alta               | Abierta — NOT TESTED                   |
| P6  | Sin CI/CD ni pipelines de QA                         | Alta               | Abierta                                |

---

## 5. Riesgos

- **R1 (RISK):** sin toolchain no se puede cumplir la Definition of Done de ninguna fase.
- **R2 (RISK):** sin Git, cualquier escritura posterior es irreversible/no auditable. Se recomienda instalar Git **antes** de crear archivos de código.
- **R3 (RISK):** sin definir esquema de `tenancyId` y modelo de datos desde el inicio, añadir multi-tenancy después es una migración de alto riesgo.
- **R4 (RISK):** comportamiento de Atlas (índices, transacciones `startSession` para concurrencia de stock) **NOT TESTED**: no hay evidencia de cluster ni soporte de transacciones multi-documento.
- **R5:** PowerShell 5.1 con encoding local puede corromper reportes/tests con acentos → usar UTF-8.

---

## 6. Estado por área (honestidad de reporte)

| Área         | Estado                                                 |
| ------------ | ------------------------------------------------------ |
| Backend      | NOT TESTED / no existe                                 |
| Frontend web | NOT TESTED / no existe                                 |
| Mobile       | NOT TESTED / no existe                                 |
| MongoDB      | NOT TESTED / no existe configuración                   |
| Testing      | NOT TESTED / 0 tests                                   |
| Seguridad    | N/A sin código; políticas definidas en `docs/security` |
| APIs         | No existen                                             |
| Colecciones  | Ninguna                                                |
| Índices      | Ninguno                                                |

---

## 7. Plan de implementación

- **FASE 0 — Diagnóstico:** ✅ este documento + ADRs + QA docs. (Esta entrega)
- **FASE 0.5 — Entorno (nueva, propuesta):** instalar Node LTS + Git, `npm init`, monorepo con workspaces, ESLint/Prettier, `tsc --noEmit`, Vitest/Jest, primer pipeline de QA. **Requisito previo obligatorio a FASE 1.**
- **FASE 1 — Arquitectura:** documentación completa (estructura, MongoDB, CI/CD, observabilidad).
- **FASE 2 — Core:** API foundation, config, DB foundation, error handling, logging, health checks, testing foundation.
- **FASE 3 — Identity** → FASE 4 Tenancy → 5 Organization → 6 Permissions → 7 Audit → 8 CRM → 9 Sales → 10 Purchasing → 11 Inventory → 12 Accounting → 13 Treasury → 14 Workflow → 15 Reporting → 16 Manufacturing → 17 Projects → 18 Service → 19 HR → 20 AI.

Regla invariante: no avanzar de fase con errores TS, lint, tests, vulnerabilidades graves, fugas de tenant o riesgos de integridad.

---

## 8. Archivos propuestos crear/modificar

Ver `docs/qa/definition-of-done.md` y el reporte de fase en el historial de la conversación. Resumen:

**Crear en esta fase (FASE 0):** los 13 documentos de `docs/` listados en el prompt (system-overview, 8 ADRs, definition-of-done, testing-strategy, development-rules).

**Modificar:** ninguno (no existe código).

**NO se implementa:** ningún módulo funcional (CRM, Sales, Purchasing, Inventory, Accounting, etc.).
