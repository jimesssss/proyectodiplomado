# Reglas de desarrollo — ERP

## Idioma y tipos

- TypeScript estricto (`strict: true`) en backend y frontend. Sin `any` injustificado; preferir `unknown` + narrowing.
- Tipos compartidos en `packages/shared-types`; validación (Zod) en `packages/shared-validation`, usada por backend **y** frontend.

## Arquitectura

- Monolito modular: `domain / application / infrastructure / presentation` por módulo; `index.ts` es la única superficie pública.
- Prohibido importar `infrastructure/`, `schemas/` o repositorios de otro módulo.
- `domain/` puro: sin Express, Mongoose, HTTP ni Node APIs de red.
- MongoDB solo se accede desde repositorios (capa infrastructure) — nunca desde controllers, React ni components.
- Comunicación entre módulos: servicios de aplicación públicos o eventos tipados (`ERPEventMap`). Nada de strings arbitrarios.
- Multi-tenancy: `TenantId` (branded type) proveniente **solo** del JWT. Toda consulta y todo índice arranca por `tenantId`.

## Código

- Sin funciones/controllers/components gigantes; extraer lógica a servicios de aplicación o dominio.
- Sin lógica empresarial en React: React llama a `api-client` y renderiza.
- Validar absolutamente todo lo que entra (body/params/query/archivos): tipos, longitudes, formatos, permisos.
- Manejar todos los errores: envelope estándar, errores tipados, nunca silenciar ni filtrar stack traces al cliente.
- Logs estructurados (nivel, msg, `requestId`, `tenantId`, `userId`) y audit log en acciones críticas.
- Sin duplicación de lógica (DRY entre módulos vía `packages/*`).

## Dependencias

Antes de instalar: necesidad · mantenimiento · seguridad · compatibilidad · tamaño · licencia · React Native · React Native Web · Node.js. No instalar una librería para resolver una tarea trivial.

## Git / commits (Conventional Commits)

```
feat(inventory): add stock reservation
feat(auth): add refresh token rotation
fix(accounting): prevent unbalanced journal entries
test(tenancy): prevent cross-tenant access
docs(api): update sales endpoints
```

Prohibido: `update`, `changes`, `fix`, `final`, `final2`. Secretos nunca en Git (`.env` ignorado; secretos en variable de entorno/secret manager).

## QA por fase

Ejecutar antes de declarar fase completa: `tsc --noEmit` · lint · unit · integration · security · e2e (cuando aplique) · build. Si algo falla: identificar causa → corregir → reejecutar → confirmar. Reportar resultados **reales**.

## Estructura de carpetas

```
ERP/
  apps/{web,mobile,api}
  packages/{shared-types,shared-validation,shared-ui,api-client,permissions}
  config/ infrastructure/{docker,deployment,monitoring} scripts/
  docs/{architecture,api,database,security,qa,modules,development}
  tests/{unit,integration,security,e2e,performance}
```

Frontend por módulos: `core/{auth,api,navigation,permissions,theme,localization}` + `modules/{dashboard,crm,sales,...}` + `shared/{components,forms,tables,charts,utils}`.

## UX

Priorizar: búsqueda global · menús claros · formularios simples · acciones rápidas · filtros · atajos · autocompletado · validaciones inline · historial/timeline · responsive · mobile. Sin pantallas repletas de opciones innecesarias.
