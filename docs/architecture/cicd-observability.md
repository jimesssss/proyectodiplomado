# Arquitectura — CI/CD y Observabilidad

Estado: Aceptado (FASE 1)

## 1. Pipeline CI (gate de fases)

Ejecutar en este orden ante cada PR y antes de declarar cualquier fase completa:

| #   | Paso              | Herramienta                                        | Falla el PR si…             |
| --- | ----------------- | -------------------------------------------------- | --------------------------- |
| 1   | Install           | `npm ci`                                           | lockfile inconsistente      |
| 2   | Typecheck         | `tsc -b --noEmit`                                  | hay errores TS              |
| 3   | Lint              | `eslint .`                                         | hay errores/warnings nuevos |
| 4   | Format            | `prettier --check .`                               | archivos sin formatear      |
| 5   | Unit tests        | `vitest run`                                       | test fallido                |
| 6   | Integration tests | `vitest run tests/integration` (con Mongo de test) | test fallido                |
| 7   | Security tests    | `vitest run tests/security`                        | test fallido                |
| 8   | E2E               | Playwright (cuando haya UI)                        | test fallido                |
| 9   | Build             | `npm run build`                                    | build falla                 |

Regla de fase: si algo falla → identificar causa → corregir → reejecutar → confirmar. **Nunca** reportar como verde algo que no corrió (etiqueta `NOT TESTED`).

Estado actual: el pipeline está **local** (`npm run qa`, verificado en FASE 0.5). **No hay CI remoto configurado** (GitHub Actions/GitLab): RISK, pendiente de definir plataforma (R1).

## 2. Entornos

| Entorno    | Uso                     | Datos                                    |
| ---------- | ----------------------- | ---------------------------------------- |
| local      | desarrollo              | mongo local (docker-compose) o Atlas dev |
| test       | CI integration/security | BD dedicada, destruida por ejecución     |
| staging    | validación funcional    | datos sintéticos                         |
| production | real                    | backups + PITR Atlas                     |

La BD de test **nunca** es la de producción; los tests jamás corren contra prod.

## 3. Observabilidad

### Logs

- `pino` JSON: `level, msg, requestId, tenantId, userId, route, durationMs`.
- Prohibido `console.log` (lint). Sin PII, sin tokens, sin passwords en logs.

### Métricas (diseño; implementación pendiente)

- Requests: tasa, latencia p50/p95, errores 4xx/5xx por ruta.
- Job queue: pendientes, fallos, edad del más antiguo.
- DB: pool, lentas (> umbral), errores de transacción.
- Negocio (vía reporting, no middleware): reservas, stock bajo, etc.

### Trazas

- `requestId` propagado: HTTP → logs → audit → jobs → eventos → respuesta.
- OpenTelemetry: evaluar en FASE 2 (dependencia con coste; NOT TESTED, no instalar hasta medir la necesidad).

### Health checks

- `/api/v1/health` (liveness) y `/api/v1/health/ready` (DB + workers).

### Alertas (definir en `infrastructure/monitoring/`)

- 5xx por encima de umbral, latencia p95, jobs atascados, outbox sin drenar, discos/índices de Atlas, fallos de backup.

## 4. Defecto de despliegue

1. `npm run qa` verde obligatorio.
2. Build de imagen/ artefacto reproducible (docker en `infrastructure/docker`).
3. Migraciones/esquemas: compatibilidad hacia atrás (el ERP no puede caer por un deploy).
4. Rollback posible sin pérdida de datos; cambios destructivos de BD solo con plan de migración documentado.

## 5. Estado

- CI local: **PASS** (ejecutado en FASE 0.5).
- CI remoto, staging, métricas, trazas, alertas: **NOT TESTED / no implementados** (se abordan en FASE 2 y con la definición de plataforma).
