# API — Endpoints de Core (FASE 2)

Estado: implementado y probado (FASE 2)

## GET /api/v1/health

Liveness. No depende de la base de datos.

`200`:

```json
{
  "success": true,
  "data": { "status": "ok", "uptimeSeconds": 123 },
  "meta": { "requestId": "…", "timestamp": "…" },
  "error": null
}
```

## GET /api/v1/health/ready

Readiness. Depende de la base de datos.

`200` con `data.database = "up"` cuando MongoDB responde al ping.
`503` con `error.code = "SERVICE_UNAVAILABLE"` cuando no responde.

## Comportamiento transversal (todas las rutas)

- Cabecera `X-Request-Id`: la sugiere el cliente solo si es segura (`[A-Za-z0-9_-]{8,64}`); si no, se genera UUID.
- JSON malformado → `400 VALIDATION_ERROR` (`Invalid JSON body`).
- Payload > 1 MB → `413 PAYLOAD_TOO_LARGE`.
- Ruta inexistente → `404 NOT_FOUND` con `error.details.path`.
- Errores 500 → mensaje genérico `Internal server error`; detalle solo en logs con `requestId`.
- Headers de seguridad (helmet) activos; `X-Powered-By` ausente.
- CORS: allow-list por `CORS_ORIGINS` (vacío = sin CORS).
