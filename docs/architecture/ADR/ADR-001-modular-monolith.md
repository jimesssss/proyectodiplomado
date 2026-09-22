# ADR-001: Modular Monolith

Estado: Aceptado
Fecha: 2026-09-21

## Problema

El ERP debe cubrir decenas de dominios (identity, CRM, sales, inventory, accounting, HR…), ser escalable, multiempresa y preparado para IA, sin caer en los problemas típicos: implementaciones difíciles, mantenimiento caro, despliegues frágiles.

## Opciones

1. **Microservicios desde el inicio.** Aislamiento por servicio, despliegue independiente. Costo: red interna, consistencia distribuida, contratos versionados, observabilidad compleja, equipos dedicados. Para un equipo/producto en fase inicial es una carga desproporcionada.
2. **Monolito tradicional (una sola base sin límites).** Rápido al inicio, pero acoplamiento inevitable: controllers/models/services globales, imposible de extraer después sin reescribir.
3. **Monolito modular.** Un único deploy con **límites estrictos entre módulos** (API pública por módulo, dependencias dirigidas, prohibido cruzar capas), dominio desacoplado de Express/Mongoose.

## Decisión

Opción 3: **monolito modular** en un monorepo, con cada módulo organizado `domain / application / infrastructure / presentation` y un `index.ts` como única superficie pública.

Reglas que materializan el límite:

- Nada fuera del módulo importa `infrastructure/`, `schemas/` ni repositorios de otro módulo (validable con lint `no-restricted-imports` / regla propia).
- `domain/` no importa Express, Mongoose ni Node APIs de red.
- Comunicación entre módulos **solo** vía servicios de aplicación públicos o eventos tipados.
- El monorepo separa `packages/*` (tipos, validación, permisos, UI) de `apps/api`.

## Motivo

- Un deploy simplifica transacciones MongoDB multi-documento (clave para concurrencia de stock y contabilidad).
- Los límites de módulo permiten extraer un módulo a microservicio **posteriormente** cambiando solo el transporte, porque el dominio ya no depende de Express.
- Reduce el costo de las "personalizaciones excesivas" típicas de los ERPs maduros.

## Consecuencias

- Se requiere disciplina y checks automatizados de dependencias; sin lint, los límites se erosionan.
- Un despliegue afecta a todos los módulos (mitigado con CI estricto).
- Escalado horizontal es por app completa hasta que se extraiga algún módulo.
