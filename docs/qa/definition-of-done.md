# Definition of Done (DoD) — ERP

Un módulo **no** se considera terminado hasta cumplir **todos** los puntos. Cualquier punto no verificado se marca **NOT TESTED**, parcial → **PARTIAL**, riesgo → **RISK**. Prohibido reportar como exitosa una prueba que no se ejecutó.

## Checklist obligatoria por módulo

- [ ] Implementado según diseño y reglas de dominio.
- [ ] `tsc --noEmit` sin errores (backend y frontend).
- [ ] Lint sin errores (y sin warnings nuevos).
- [ ] Unit tests: reglas de dominio y casos límite.
- [ ] Integration tests: API + MongoDB real (testcontainers o BD de test dedicada).
- [ ] E2E cuando corresponda (flujos de usuario críticos).
- [ ] Security tests: 401 sin token, 403 sin permiso, **403/no-access cross-tenant**, inyección/validación de entrada.
- [ ] Multi-tenant tests: aislamiento por cada entidad del módulo (clientes, productos, ventas, compras, inventario, facturas, pagos, reportes, proyectos, tickets, documentos, usuarios — según aplique).
- [ ] Validación de `body`, `params`, `query`, archivos, tipos, longitudes, formatos (Zod compartido).
- [ ] Authentication aplicada a todos los endpoints.
- [ ] Authorization: permiso `recurso:acción` declarado + test de 403.
- [ ] `tenantId` exclusivamente del JWT (nunca del cliente).
- [ ] Audit log en toda acción crítica (con valores anterior/nuevo).
- [ ] Error handling: errores tipados, envelope estándar, sin fugas de stack trace al cliente.
- [ ] Logs estructurados con `requestId`, `tenantId`, `userId`.
- [ ] Performance revisada: paginación en listas, índices justificados, sin N+1, sin queries sin `tenantId`.
- [ ] API documentada (OpenAPI en `docs/api/`).
- [ ] UI implementada, responsive y validada en mobile (web RN).
- [ ] Documentación de módulo e índices actualizada.
- [ ] QA aprobado: pipeline verde (tsc + lint + unit + integration + security + build).

## Reglas de fase (gate de avance)

**No avanzar a la siguiente fase** si existe cualquiera de:
errores críticos · errores TypeScript · lint · tests fallidos · vulnerabilidades graves · riesgo de fuga entre tenants · problemas de integridad de datos · arquitectura rota · dependencias innecesarias.

Primero corregir, después continuar.

## Calidad de código

Prohibido: `any` indiscriminado, lógica duplicada, functions/controllers/components gigantes, lógica empresarial en React, acceso directo a MongoDB desde componentes, saltarse autorización, confiar en `tenantId` del frontend, secretos en Git, contraseñas en texto plano, ignorar u ocultar errores, instalar dependencias sin justificación (necesidad, mantenimiento, seguridad, compatibilidad, tamaño, licencia, RN/RN-Web/Node).
