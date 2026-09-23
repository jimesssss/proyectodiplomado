# Base de datos — AI (FASE 20)

1 colección nueva, propia de AI (dueño FASE 20): `aiInteractions` — apéndice **append-only** de gobernanza (ADR-008: cada invocación de tool queda registrada y correlacionada). Lista y se filtra de forma independiente (ADR-003). Schema en `ai/infrastructure/schemas/collections.ts`; repositorio propio en `ai/infrastructure/repositories/ai-repository.ts` (modelo `AiInteraction` — nunca reutiliza nombres de modelo de otro módulo).

## Colección `aiInteractions`

| Campo       | Tipo / notas                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `tenantId`  | string (SIEMPRE del JWT)                                                                          |
| `requestId` | string — correlación con `meta.requestId` del envelope que originó la llamada                     |
| `userId`    | string — `sub` del JWT (quién pidió la ejecución)                                                 |
| `prompt?`   | string ≤2000 \| null — **redactado** (controles fuera, blancos → null) o null                     |
| `tool`      | string ≤64 — nombre de la tool registrada (`crm.search` \| `reports.sales_kpis` \| `hr.salaries`) |
| `args`      | Mixed — arguments ya parseados por el contrato Zod de la tool                                     |
| `result?`   | Mixed \| null — objeto JSON devuelto (null si `status: failed`)                                   |
| `error?`    | string ≤300 \| null — mensaje redactado del fallo (null si `completed`)                           |
| `status`    | enum `completed \| failed`                                                                        |
| `latencyMs` | number ≥0 — duración de la EJECUCIÓN (la validación/permisos no se cuentan)                       |

- `_id`/`createdAt`/`updatedAt` del schema (`timestamps: true`); colección física `aiInteractions`.
- **No existen** campos de tenant alternativos, ni versión, ni `archived`: el apéndice es inmutable (sin `PATCH`/`DELETE` publicados → 404).

## Índices (3)

| Índice                             | Query justificada                            |
| ---------------------------------- | -------------------------------------------- |
| `{tenantId, createdAt:-1}`         | `GET /ai/interactions` (listado por defecto) |
| `{tenantId, tool, createdAt:-1}`   | `GET /ai/interactions?tool=`                 |
| `{tenantId, status, createdAt:-1}` | `GET /ai/interactions?status=`               |

`tenantId` SIEMPRE primero (ADR-002); cada índice justificado por un parámetro de lectura (sin índices "por si acaso"). **No hay claves únicas**: es append-only (una misma tool/args puede ejecutarse N veces; la unicidad no aplica).

## Reglas de escritura

- Único camino a MongoDB: `ai/infrastructure/repositories/ai-repository.ts` con SOLO `create` + lecturas — **no existe `update` ni `delete` en el repositorio** (el inmutable lo garantiza la capa de datos, no solo la de rutas).
- Toda operación filtra por `tenantId` (SIEMPRE del JWT, ADR-002).
- **Se persisten SOLO los intentos con contrato válido**: los rechazos previos (tool desconocida `400`, permiso faltante `403`, args inválidos `400`) NO crean documento (decisión documentada en `docs/api/ai.md` — evita que `ai:use` llene la colección con peticiones rechazadas).
- Redacción ANTES de persistir: `prompt` (`PROMPT_MAX` 2000) y `error` (`ERROR_MAX` 300) con `redactPrompt`/`redactError` (reglas puras en `ai/domain/rules/ai-rules.ts`).
- `result` puede contener objetos con `Date` (p. ej. `createdAt` de salarios) → Mixed los conserva y el JSON de respuesta los serializa a ISO igual que la ruta directa (paridad verificada en test).
- **Sin transacciones multi-documento**: cada registro es UN documento (`create`); sin claves únicas que requieran retry E11000.
- Sin FKs de colección: `userId`/`requestId` son strings de correlación (Identity se resuelve en el JWT, sin lectura).

## NOT TESTED / RISK / PARTIAL

- **NOT TESTED**: `explain()` de los 3 índices sobre Atlas; volumen alto de interacciones.
- **PARTIAL**: sin índice para `userId` (no existe filtro `?userId=` en la API); sin índice de `requestId` (la correlación es de escritura, no consulta).
- **RISK**: **sin retención/TTL** — outbox/jobs no implementados → la colección crece monótonamente (mitigación futura: TTL por retención, documentada); sin cuota por tenant en el origen (el consumo ilimitado es de API, no de datos).
- **RISK vigentes (sin regresar)**: sin transacciones Mongo, sin `Idempotency-Key`, paginación offset, `apps/web`/`apps/mobile`/Atlas real NOT TESTED.
