# Arquitectura — Seguridad (AuthN, AuthZ, tenant, audit)

Estado: Aceptado (FASE 1) · ADR-002, ADR-004, ADR-005, ADR-006

## 1. Cadena de seguridad por petición

```
HTTPS → helmet/CORS → body limit → requestId → Zod validation
  → AuthN (JWT RS256: firma, exp, iss, aud)          → 401 si falla
  → AuthZ (permiso de la ruta sobre perms del token) → 403 si falla
  → TenantContext(request.user.tenantId)              → única fuente de tenant
  → use case → repo(filtra tenantId) → audit si acción crítica
```

## 2. Autenticación (detalle operativo)

- Login `POST /api/v1/auth/login` → access JWT (≤15 min) + refresh (≤30 d, rotado en cada uso).
- Reutilización de refresh ⇒ revocación total de la sesión + audit.
- Passwords: Argon2id (o bcrypt ≥12); nunca texto plano; nunca logueados.
- Reset de contraseña: token de un solo uso con TTL; respuesta idéntica exista o no el email (anti-enumeración).
- Bloqueo por intentos con backoff (cuenta e IP).
- MFA TOTP: esquema y flujo preparados, implementación diferida (PARTIAL por diseño).

Claims del access token: `sub`, `tenantId`, `roles[]`, `permissions[]`, `pv` (versión del catálogo), `sid`, `iss`, `aud`, `iat`, `exp`.

## 3. Autorización

- Claves canónicas `recurso:acción` definidas en `packages/permissions` (compartido con la UI).
- Denegación por defecto; sin permiso ⇒ 403 siempre (nunca "sorpresa" 200).
- Ejemplos matriz (detalle en `docs/security/permission-matrix.md`, creado en FASE 6):

| Rol      | Puede                                           | No puede                            |
| -------- | ----------------------------------------------- | ----------------------------------- |
| VENDEDOR | ver/crear clientes, cotizaciones, pedidos       | contabilidad, nómina, config global |
| ALMACÉN  | ver inventario, entradas/salidas/transferencias | pólizas, información salarial       |

- ABAC: interfaz `Policy` preparada (ownership, monto, sucursal) sin implementar todavía.
- Búsqueda global y reportes aplican los **mismos** permisos: sin permiso ⇒ sin resultado.

## 4. Aislamiento multi-tenant (garantías)

1. `tenantId` solo desde el JWT — cualquier `tenantId` entrante se descarta.
2. Repositorio exige `TenantId` branded en cada método (imposible "olvidarlo" sin que TS falle).
3. Índices y agregaciones arrancan por `tenantId` (los `$lookup` arrastran el filtro).
4. 404/403 uniforme para recursos de otro tenant (sin revelar existencia).
5. Pruebas automáticas de cruce por entidad en cada módulo (clientes, productos, ventas, compras, inventario, facturas, pagos, reportes, proyectos, tickets, documentos, usuarios).

## 5. Auditoría

- Servicio único `core/audit`; los módulos no escriben `auditLogs` directamente.
- Campos: `tenantId, userId, sessionId, action, entityType, entityId, requestId, timestamp, previousValue, newValue, metadata{ip, userAgent, reason}`.
- Acciones críticas siempre auditan: auth, entidades de negocio, aprobaciones, pólizas, pagos, ajustes de stock, permisos, exportaciones, acciones de IA.
- Append-only: sin update/delete desde la aplicación; `audit:read` restringido a admin/auditor.
- Escritura síncrona-y-fallida-bloqueante en acciones críticas (mejor fallar que perder traza); buffer solo en acciones no críticas.

## 6. Superficies de API

- Todas bajo `/api/v1/`; CORS con allow-list exacta (no `*`) cuando haya apps reales.
- Rate limiting en auth y endpoints caros (evaluar en FASE 2; NOT TESTED).
- Archivos: metadata en Mongo, binario en Object Storage con clave no enumerable; descarga también exige permiso + tenant.

## 7. Gestión de secretos

- Ningún secreto en Git (`.gitignore` incluye `.env*` salvo `.env.example`).
- Producción: variables de entorno del orquestador/secret manager.
- Rotación de claves JWT: soportar `kid` (diseño; implementación en FASE 3).

## 8. Estado

Implementado: autenticación (FASE 3), autorización RBAC (FASE 6 — `requirePermission`, matriz de permisos real) y auditoría append-only (FASE 7 — `core/audit` + `GET /audit` con `audit:read`). **PARTIAL**: ABAC sin implementar; `previousValue` de auditoría sin poblar. **NOT TESTED**: reset por email, MFA, rate-limit por IP, Atlas real.
