# Base de datos — Audit (`auditLogs`)

Estado: implementado (FASE 7 — ADR-006). Colección **append-only** (solo `create` + `find` desde `core/audit`; sin update/delete en la aplicación).

## Documento

| Campo           | Tipo           | Regla                                                                                                                             |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `_id`           | ObjectId       | PK                                                                                                                                |
| `tenantId`      | string         | Tenant del recurso afectado (o del actor). `""` = intento de login sin tenant resoluble (solo visible leyendo la BD directamente) |
| `userId`        | string         | Actor (`""` si anónimo, p. ej. login fallido sin usuario)                                                                         |
| `sessionId`     | string         | Sesión del actor (`""` si no aplica)                                                                                              |
| `action`        | string         | Canónico: `auth.login.failed`, `role.create`, `org.archive`…                                                                      |
| `entityType`    | string         | `user`, `role`, `tenant`, `session`, `organization`, `company`…                                                                   |
| `entityId`      | string \| null | Id del recurso afectado (o email en login fallido)                                                                                |
| `requestId`     | string         | Correlación con access logs                                                                                                       |
| `timestamp`     | Date           | Momento del evento (no usa `createdAt` de Mongoose)                                                                               |
| `previousValue` | Mixed (null)   | **PARTIAL**: siempre `null` en FASE 7                                                                                             |
| `newValue`      | Mixed (null)   | Estado resultante / detalle del evento (nunca secretos)                                                                           |
| `metadata`      | subdocumento   | `{ ip?, userAgent?, reason? }` (`reason` = código o motivo, p. ej. `token_reuse`)                                                 |

`timestamps: false` — el campo temporal explícito es `timestamp`.

## Índices

| Índice                                      | Motivo                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `{ tenantId: 1, timestamp: -1 }`            | Listado del tenant ordenado por tiempo (query de `GET /audit`) |
| `{ tenantId: 1, action: 1, timestamp: -1 }` | Filtro por acción dentro del tenant (mismo orden)              |

Ambos cubren `entityType`/`entityId` como filtros adicionales sobre el prefijo `{tenantId}` (selectividad alta por la partición de tenant).

## Reglas

- Ningún módulo escribe la colección directamente: usan `recordAudit`/`auditFromRequest` de `core/audit` (único dueño).
- Escritura **síncrona y bloqueante** para acciones críticas.
- Sin `tenantId` desde el cliente en ningún caso.
- Datos sensibles **nunca** se registran: sin `passwordHash`, sin contraseñas, sin tokens (los `newValue` contienen emails/roles/nombres, no credenciales).

## NOT TESTED / RISK

- **PARTIAL**: sin TTL/retención ni partición (volumen creciente → política de retención en fases de operación).
- **NOT TESTED**: Atlas real (índices creados en memoria/test igual que en dev).
