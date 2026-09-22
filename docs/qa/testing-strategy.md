# Estrategia de testing — ERP

## Estructura

```
tests/
  unit/          # dominio puro: reglas, value objects, cálculos
  integration/   # API + MongoDB real (BD dedicada de test, nunca prod)
  security/      # authn/authz/tenant/validation
  e2e/           # flujos completos multi-módulo
  performance/   # concurrencia, reportes, indexes
```

Unit tests viven junto al código (`*.test.ts`); `tests/` agrupa los de integración hacia arriba por módulo.

## Pirámide y ejecución

| Nivel       | Cuándo                  | Herramienta propuesta                                  |
| ----------- | ----------------------- | ------------------------------------------------------ |
| Unit        | cada commit             | Vitest (o Jest)                                        |
| Integration | cada PR                 | Vitest + MongoDB real (Atlas test DB o testcontainers) |
| Security    | cada PR                 | scripts sobre la API levantada                         |
| E2E         | PR de módulo / nightly  | Playwright (web)                                       |
| Performance | faseles gates / nightly | k6 o scripts Node                                      |

**Herramientas NOT TESTED:** ninguna instalada todavía (repositorio vacío, toolchain ausente). Se confirmarán en FASE 0.5/2.

## Suites críticas (obligatorias)

### Seguridad

- Token ausente → 401; token inválido/firmado mal → 401; token expirado → 401.
- Refresh token reutilizado → 401 + revocación de sesión.
- Sin permiso → 403. Con permiso pero tenant distinto → 403 (o no-existe).
- Body con `tenantId` ajeno o manipulado → **se ignora**, usa el del JWT.
- Validación: payloads inválidos → 400 con `error.details`, nunca 500.
- Login: fuerza bruta → bloqueo/backoff.

### Multi-tenant (por cada entidad: clientes, productos, ventas, compras, inventario, facturas, pagos, reportes, proyectos, tickets, documentos, usuarios)

```
Usuario A (tenant A) GET recurso de A   → 200
Usuario A (tenant A) GET recurso de B   → 404/403 (no revelar existencia)
Usuario A lista recursos                 → solo recursos de A
```

### Inventario

- `stock = 1`, usuario A y B compran a la vez → exactamente una reserva exitosa; stock final 0; sin reservas huérfanas.
- Ledger: toda variación de `stock.quantity` tiene `stockMovement` asociado (mismo request, montos opuestos).
- Estados: disponible/reservado/comprometido/tránsito/dañado/cuarentena consistentes.

### Contabilidad

- Asiento con `sum(debit) != sum(credit)` → rechazado (400/422), nunca persistido.
- Asiento publicado no se edita (solo reverso).
- Toda operación crítica genera audit log.

### Workflow

- trigger → condition → action → approval → notification, verificado end-to-end con evento de prueba.

### API

- Envelope `success/data/meta/error` consistente en todos los endpoints.
- Paginación: nunca devuelve colecciones completas sin límite.

## Reglas de honestidad

- Resultado real de ejecución en cada reporte de fase.
- No ejecutado → `NOT TESTED`. Parcial → `PARTIAL`. Riesgo → `RISK`.
