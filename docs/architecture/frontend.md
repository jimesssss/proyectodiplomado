# Arquitectura — Frontend (web + mobile)

Estado: Aceptado (FASE 1)

## 1. Aplicaciones

| App           | Tecnología       | Notas                                                           |
| ------------- | ---------------- | --------------------------------------------------------------- |
| `apps/web`    | React Native Web | Misma base de componentes que mobile                            |
| `apps/mobile` | React Native     | iOS/Android; Kotlin solo para hardware nativo (ver `mobile.md`) |

Ambas consumen la API **exclusivamente** vía `packages/api-client` (tipado, sin fetch disperso).

## 2. Estructura de carpetas (idéntica en web y mobile)

```
src/
├── core/
│   ├── auth/            # Sesión, refresh, guards de rutas
│   ├── api/             # Cliente API + query cache ligera
│   ├── navigation/      # Stack/tab por rol y permisos
│   ├── permissions/     # Hook usePermission('recurso:acción')
│   ├── theme/           # Design tokens (color, spacing, tipografía)
│   └── localization/    # i18n
├── modules/
│   ├── dashboard/  crm/  sales/  purchasing/  inventory/
│   ├── accounting/  treasury/  manufacturing/  projects/
│   ├── service/  hr/  ai/
└── shared/
    ├── components/      # Design system (shared-ui)
    ├── forms/           # Campos reutilizables + validación inline
    ├── tables/          # Tablas paginadas/cursor + filtros
    ├── charts/          # KPIs y dashboards
    └── utils/
```

Reglas:

- **Cero lógica empresarial en React**: React llama a `api-client` y renderiza; cálculos viven en el backend.
- **Cero acceso directo a datos**: ningún componente habla con MongoDB ni arma URLs raw de endpoints.
- Cada pantalla declara los permisos que requiere; sin permiso → pantalla/acción no se muestra **y** el backend rechaza igual (UI no es seguridad).

## 3. Experiencia de usuario (contra los problemas clásicos de ERP)

Prioridades obligatorias:

- **Búsqueda global** (`/api/v1/search`) accesible con atajo (`Ctrl/Cmd+K`), resultados filtrados por permisos.
- Menús por rol: el usuario ve su trabajo, no el organigrama completo.
- Formularios cortos, validación inline, autocompletado, acciones rápidas.
- **Timeline** por entidad (cliente, pedido, ticket): historial cronológico en un vistazo.
- Filtros guardables, paginación (o infinite scroll con cursor) en todas las listas.
- Responsive por defecto (RN Web) y mobile-first en pantallas críticas (consulta, aprobaciones, escáner).

Anti-patrones prohibidos: pantallas con 50 acciones visibles, tablas sin paginación, modales anidados, esperar a que el usuario rellene 40 campos para avisar del error.

## 4. Dashboards por rol (FASE 15, diseño ya definido)

| Rol        | Contenido                                                   |
| ---------- | ----------------------------------------------------------- |
| Director   | Ventas, utilidad, flujo de caja, inventario, clientes, KPIs |
| Ventas     | Leads, oportunidades, ventas, conversión, comisiones        |
| Compras    | Órdenes, proveedores, precios, tiempos                      |
| Inventario | Existencias, rotación, stock bajo, productos críticos       |

Los dashboards consumen **read models/jobs** (`reporting`), nunca agregaciones pesadas en vivo.

## 5. Estado y datos

- Estado de servidor: caché de queries tipo TanStack Query (evaluar en FASE 2; NOT TESTED) o implementación mínima propia en `api-client`.
- Estado de UI local: contexto/zustand ligero según necesidad medida; no duplicar datos del servidor.
- Token: access token en memoria; refresh en cookie httpOnly (web) / secure storage (mobile).

## 6. Validación de forms

Usar `shared-validation` (Zod) para que el mensaje de error del form coincida con el rechazo del backend. El backend **siempre** revalida: la validación de cliente es UX, no seguridad.

## 7. Estado actual

No existen `apps/web` ni `apps/mobile` todavía (**NOT TESTED**). Se construyen a partir de FASE 8+ junto con los primeros módulos, sobre este diseño.
