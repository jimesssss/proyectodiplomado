# API — Audit (`/api/v1/audit`)

Estado: implementado (FASE 7 — ADR-006). Ver `docs/database/audit.md`.

## Reglas

- **Append-only**: solo existe `GET /`. No hay POST/PATCH/DELETE (responden `404`): nadie puede alterar ni fabricar trazas por API. La escritura vive en `core/audit` (`recordAudit`), única superficie de la colección.
- **Denegación por defecto**: requiere `audit:read` (matriz `docs/security/permission-matrix.md`); lo tienen `owner` y `super_admin`.
- **Tenant-scoped**: `tenantId` sale del JWT; la lista contiene solo las entradas del propio tenant. Una traza escrita en otro tenant (p. ej. `tenant.suspend` sobre un tercero) no es visible desde aquí.
- **Escritura crítica bloqueante**: si el INSERT de una traza falla, la petición falla (`500`) — mejor fallar que perder traza.
- Los intentos de login con **email inexistente** quedan con `tenantId: ""` (no resoluble): se guardan en la colección pero **no aparecen** en ningún listado por tenant (solo consultable directamente en BD / plataforma futura).

## Endpoints

| Método | Ruta | Auth | Permiso      | Notas                                                    |
| ------ | ---- | ---- | ------------ | -------------------------------------------------------- |
| GET    | `/`  | Sí   | `audit:read` | Paginado (`page`, `limit`, `total`), orden `timestamp` ↓ |

Query (opcional): `action` (canónico `recurso:acción` o `área.evento`, p. ej. `auth.login.failed`), `entityType` (p. ej. `organization`), `entityId` (≤64). Formato no canónico → `400`.

Cada entrada:

```json
{
  "id": "...",
  "action": "role.create",
  "entityType": "role",
  "entityId": "665f...",
  "userId": "665e...",
  "sessionId": "665e...",
  "requestId": "req_...",
  "timestamp": "2026-09-21T18:33:00.000Z",
  "previousValue": null,
  "newValue": { "key": "vendedor", "permissions": ["customer:read"] },
  "metadata": { "ip": "127.0.0.1", "userAgent": "supertest" }
}
```

## Acciones auditadas

| Grupo   | Acciones                                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth    | `auth.login`, `auth.login.failed` (`metadata.reason`: `invalid_credentials`, `rate_limited`, `account_disabled`, `tenant_suspended`), `auth.refresh`, `auth.refresh.reuse` (`token_reuse`), `auth.logout`, `auth.change_password`, `auth.change_password.failed` |
| Tenancy | `tenant.provision` (escrita en el tenant creado), `tenant.rename`, `tenant.suspend`, `tenant.reactivate` (estas dos se escriben **en el tenant afectado**, con el actor como `userId`)                                                                           |
| RBAC    | `role.create`, `role.update`, `role.delete`, `user.create`, `user.update`                                                                                                                                                                                        |
| Org     | `org.create`, `org.update`, `org.archive` (`entityType` = tipo de unidad)                                                                                                                                                                                        |

## Errores

| Caso                                            | HTTP | Código             |
| ----------------------------------------------- | ---- | ------------------ |
| Sin token / token inválido / sesión revocada    | 401  | `UNAUTHENTICATED`  |
| Sin `audit:read`                                | 403  | `FORBIDDEN`        |
| Query no válida (`limit`, `page`, `action`)     | 400  | `VALIDATION_ERROR` |
| Cualquier método ≠ GET (ruta no existe)         | 404  | `NOT_FOUND`        |
| Fallo del INSERT de traza en una acción crítica | 500  | `INTERNAL_ERROR`   |

## NOT TESTED / RISK

- **PARTIAL**: `previousValue` siempre `null` (las rutas registran el estado resultante); poblarlo exige lectura previa en cada mutación — evaluar con event bus.
- **PARTIAL**: sin transacciones (Mongo standalone): si el INSERT de la traza falla **después** de la mutación, queda acción hecha sin traza (migrar a `session.withTransaction` en Atlas).
- **NOT TESTED**: trazas de usuarios con `tenantId: ""` vía API (invisibles por diseño); rotación de colección/retención; Atlas real.
- Auditoría de: creación de tenants fallidos, bloqueos por IP, exportaciones y accesos a datos sensibles de negocio (futuras fases).
