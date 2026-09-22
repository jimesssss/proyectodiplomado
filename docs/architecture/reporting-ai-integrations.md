# Arquitectura — Reporting, IA e Integraciones

Estado: Aceptado (FASE 1) · ADR-008

## 1. Reporting / BI (FASE 15)

Objetivo: reportes rápidos sin bloquear operaciones.

- **Read models**: los reportes consumen colecciones/proyecciones optimizadas (agregados precalculados por job), no hacen `$match` sobre colecciones transaccionales en vivo.
- **Jobs**: exportaciones (CSV/Excel) y reportes pesados se encolan; el usuario recibe una notificación con el resultado.
- **Cache**: solo donde medido necesario (TTL corto por `tenantId + reportId + filtrosHash`); invalidación por evento cuando el dato cambia críticamente.
- **Paginación obligatoria**; exportaciones con límite y advertencia por tamaño.
- Aislamiento: todo pipeline de reporte arranca por `tenantId` y aplica los mismos permisos del usuario (un reporte jamás "filtra menos" que la API).

Endpoints: `GET /api/v1/reports/...`, dashboards por rol (ver `frontend.md` §4).

## 2. IA (FASE 20) — ADR-008

```
Usuario → AI Agent → Permission Layer (permisos del usuario + tenant del JWT)
        → Tool autorizada (contrato Zod) → ERP → resultado
```

- **Nunca** acceso directo a MongoDB: solo tools registradas con `requiredPermission` declarado.
- Lecturas sensibles (nómina) exigen el mismo permiso que la consulta manual.
- **Acciones críticas**: IA propone → usuario confirma → ERP ejecuta → audit log. Ante instrucción ambigua ⇒ preguntar o rechazar (nunca ejecutar).
- Registro en `aiInteractions` (prompt redactado, tools, resultado, confirmación) correlacionado con `requestId`.
- Orden de entrega: primero 2–3 tools de **lectura** (búsqueda, cartera vencida, KPIs); acciones de escritura al final.

## 3. Integraciones externas

- Aisladas en `apps/api/src/infrastructure/integrations/` con adaptadores por proveedor:
  - Email (SMTP/provider), Object Storage (S3-compatible), pasarelas de pago, proveedores fiscales/e-invoicing, mensajería.
- Los módulos dependen de **interfaces** (`EmailPort`, `StoragePort`, `PaymentPort`), no del proveedor.
- Credenciales en variables de entorno; los webhooks entrantes validan firma y mapean a eventos tipados.
- Fallos externos ⇒ reintento con backoff + cola (jamás bloquear la HTTP request en el proveedor).

## 4. Importación de datos (CSV/Excel)

Flujo obligatorio:

```
Archivo → validación (esquema, tipos, refs, tenant) → preview (N primeras filas + errores por fila)
        → confirmación del usuario → job de importación → reporte final (ok / fallidos)
```

- Nunca insertar sin validación; nada se persiste hasta la confirmación.
- El job corre por worker con `tenantId` y `userId` del request; reintentable; reporte auditable.

## 5. Estado

Todo **NOT TESTED**: sin reporting, sin IA, sin integraciones implementadas. Diseño fijado para las fases 15 y 20.
