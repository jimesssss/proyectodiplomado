# Base de datos — SERVICE (FASE 18)

1 colección nueva, propia de Service (dueño FASE 18): `tickets` (documento numerado + máquina de estados de soporte con reapertura). Colección propia (ADR-003): se lista y filtra independiente de la auditoría. Schema en `service/infrastructure/schemas/collections.ts`.

## Colección `tickets`

| Campo          | Tipo / notas                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------- |
| `tenantId`     | string (SIEMPRE del JWT)                                                                     |
| `number`       | string, **única por tenant** (`TK-YYYY-000001`, asignada por el servidor con `$inc` atómico) |
| `subject`      | string (1–120, `.trim()` en validador: solo espacios → 400)                                  |
| `description?` | string ≤ 500 \| null (blanco → null)                                                         |
| `status`       | enum `open \| in_progress \| resolved \| closed \| cancelled` (inicial `open`)               |
| `priority`     | enum `low \| normal \| high \| urgent` (default `normal`) — determina el SLA `dueAt`         |
| `assigneeId?`  | ObjectId → `users` \| null (FK del mismo tenant)                                             |
| `resolution?`  | string ≤ 500 \| null (obligatoria no vacía al `→ resolved`; la reapertura la limpia)         |
| `archived`     | boolean (soft-delete con `ticket:delete`)                                                    |
| `dueAt`        | **NO existe en el documento**: derivado al exponer = `createdAt + SLA[priority]`             |

## Índices

| Colección | Índice                                 | Query justificada                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------------- |
| `tickets` | `{tenantId, number}` **unique**        | número de documento único por tenant: duplicado → 409 en el repo |
| `tickets` | `{tenantId, createdAt:-1}`             | `GET /tickets` (listado por defecto, desc)                       |
| `tickets` | `{tenantId, status, createdAt:-1}`     | `GET /tickets?status=` (cola de abiertos / cerrados)             |
| `tickets` | `{tenantId, archived, createdAt:-1}`   | `GET /tickets?archived=`                                         |
| `tickets` | `{tenantId, assigneeId, createdAt:-1}` | `GET /tickets?assigneeId=` (cola personal de UN agente)          |

`tenantId` SIEMPRE primero (ADR-002); cada índice justificado por una lectura o restricción de unicidad (sin índices "por si acaso").

## Reglas de escritura

- Único camino a Mongo: `service/infrastructure/repositories/ticket-repository.ts` (modelo propio `ServiceTicket` — nunca reutiliza el nombre del modelo de otro módulo). Toda operación filtra por `tenantId`.
- **FK de usuario** (`assigneeId`): resuelta contra Identity vía `findUserInTenant` (API pública `identity/index.ts`) → desconocido/ajeno → `400 Unknown user`; Service → Identity, nunca al revés.
- **Numeración**: serie `ticket` de `core/numbering` (`buildCounterKey = tenant:serie:año`, `$inc` atómico con upsert). Carrera de upsert (`E11000`) → **reintento único** (FASE 18) — sin perder ni duplicar números.
- **Duplicado** de `{tenantId, number}` → `E11000` traducido a `409 Number already exists` en el repositorio.
- **Máquina de estados** en el servicio (patrón proyectos/manufacturing): mismos guards `409`; `→ resolved` exige `resolution` no vacía en el MISMO patch (**pre-chequeo ANTES de escribir**); la reapertura escribe `resolution: null` junto con el nuevo estado.
- **Sin transacciones multi-documento**: cada escritura es UN documento (`findOneAndUpdate` con `$set`); no hay flujos multi-colección con invariante fuerte.

## NOT TESTED / RISK / PARTIAL

- **NOT TESTED**: el reintento `E11000` de `nextDocumentNumber` es defensivo (carrera de upsert difícil de provocar de forma determinista en `mongodb-memory-server`); la concurrente se cubre con `Promise.all` (números distintos), no con la colisión exacta.
- **NOT TESTED**: `explain()` de los 5 índices sobre Atlas; volumen alto de la cola `tickets`.
- **PARTIAL**: no hay índices dedicados sobre `priority` (la cola por prioridad es secundaria; `?priority` sin índice propio — filtra sobre el índice de `createdAt`/`status`).
