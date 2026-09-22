# Reporte de fase — FASE 0.5: ENTORNO (herramientas + monorepo)

## ESTADO
**PASS**

## RESUMEN
- Instalado **Node.js LTS v24.19.0** y **Git 2.55.0.3** vía winget (fueron los bloqueantes críticos del diagnóstico).
- Inicializado el monorepo con npm workspaces: `apps/api` + `packages/shared-types`.
- Configurado TypeScript **estricto** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`).
- Configurado ESLint 9 flat config (con `no-explicit-any: error`), Prettier y Vitest.
- Creado `.gitignore`, `.env.example` (plantilla sin secretos) y envelope de API tipado en `shared-types`.
- Git inicializado en rama `main` con commit convencional. Identidad de git configurada **solo a nivel de repo** (`ERP Dev Team <dev@erp.local>`).

## ARCHIVOS CREADOS
- `.gitignore`, `.prettierrc.json`, `.prettierignore`, `.env.example`
- `package.json`, `package-lock.json`, `tsconfig.base.json`, `tsconfig.json`
- `eslint.config.mjs`, `vitest.config.ts`
- `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/index.test.ts`
- `packages/shared-types/package.json`, `packages/shared-types/tsconfig.json`, `packages/shared-types/src/index.ts`, `packages/shared-types/src/index.test.ts`

## ARCHIVOS MODIFICADOS
- `package.json` (test corregido: ejecución única desde raíz)
- `apps/api/package.json`, `packages/shared-types/package.json` (removido `test` por workspace)
- Docs FASE 0 (formateo Prettier)

## APIs
Ninguna (Express llega en FASE 2). El binario de `apps/api` es un placeholder de arranque, **no** un servidor HTTP.

## COLECCIONES / ÍNDICES
Ninguno (sin MongoDB aún).

## TESTS (ejecución real)
```
vitest run → 2 files, 3 tests, 3 passed (0 failed)
tsc -b (api + shared-types) → 0 errores
eslint . → 0 errores, 0 warnings
prettier --check . → All matched files use Prettier code style
build (tsc -b) → exit 0
```
Resultado: **PASS**. `npm run qa` reproduce toda la cadena.

## ERRORES ENCONTRADOS
1. `TS2580: Cannot find name 'process'` en `apps/api/src/index.ts` → faltaban tipos de Node.
2. `npm.ps1` bloqueado por execution policy de PowerShell (shim `.ps1` no ejecutable).
3. Postinstall de `esbuild` bloqueado por allow-scripts de npm 11 → `node` no encontrado en el subshell de cmd (PATH heredado incompleto).
4. `vitest` ejecutado por workspace con cwd local → "No test files found" (patrones relativos a la raíz).

## CORRECCIONES
1. Instalado `@types/node` (devDependency, justificada).
2. Uso de `npm.cmd` vía ruta completa en todos los comandos (no requiere cambiar la execution policy del sistema).
3. `npm approve-scripts esbuild` + `npm rebuild esbuild`.
4. Test movido al script raíz `vitest run` con `vitest.config.ts` central; eliminado `test` de los workspaces.

## RIESGOS
- **RISK** execution policy de PowerShell sigue restringiendo `*.ps1`: afectará a cualquier script de QA en `.ps1` → preferir `.cmd`/`.mjs` o documentar `RemoteSigned` para el usuario.
- **NOT TESTED:** conectividad a MongoDB Atlas (sin credenciales), E2E (sin UI), security/integration tests (sin API aún).
- npm muestra aviso de versión nueva (11.17.0 → 12.0.2): no actualizado a propósito (evitar cambios no probados).

## PRÓXIMA FASE
**FASE 1 — Arquitectura:** documentación completa (estructura monorepo, backend, frontend, mobile, MongoDB, multi-tenancy, auth, authz, audit, events, jobs, testing, CI/CD, observabilidad) antes de escribir código de negocio.
