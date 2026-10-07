# ERP-SC — mejora visual conservadora

Fecha: 2026-10-07. Trabajo local; sin commit, push, despliegue ni APK.

## Arquitectura revisada

La aplicación completa Web y Android comparte `apps/mobile/src/app` con Expo Router.
`apps/web` conserva la verificación de correo; `scripts/build-web.mjs` exporta Expo,
incorpora el verificador y copia las fotografías. Render publica `apps/mobile/dist`.
La configuración sigue usando `https://erp-sc-api.onrender.com/api/v1`, SDK 50 y
package Android `com.erpsc.app`. La firma Release no fue modificada.

Se revisaron los componentes, tokens, layouts, pantallas de operación y administración,
stores, clientes API y los permisos y contratos de productos. La sesión usa el mecanismo
existente de SecureStore y refresh. No se modificaron esas capas.

## Mejoras realizadas

- Interlineado y ajuste de textos largos; separación de importes y datos de contacto.
- Controles y filtros con altura táctil mínima; contenedores de filtros sin recorte.
- Búsqueda con foco visible y botones deshabilitados con texto legible.
- Tarjetas de métricas compartidas para Dashboard, con las mismas cifras existentes.
- Badges con texto y un indicador de color, sin depender únicamente del color.
- Fotos que conservan su tamaño frente a textos largos, marco discreto y placeholder.
- Productos: textos accesibles, precio y badge que pueden acomodarse en varias líneas.
- Inventario y Productos: estados de error humanos utilizando DataState existente.
- POS: selección de cliente/pago con fondo claro y borde ciruela, preservando handlers.
- Reportes: espacio vertical suficiente para barras, importes y etiquetas existentes.
- Configuración: retirar el resumen fijo de empresa y sucursal que contradecía los datos
  reales; conservar los accesos existentes a organizaciones, empresas, sucursales y almacenes.
  Los valores fiscales locales se identifican como preferencias locales.
- Pestañas: etiquetas debajo del icono a menos de 600 px y junto al icono en desktop.
  Se conservan exactamente las cinco rutas y los controles de sesión.

Compras, Clientes, Proveedores, Gastos, Caja, Usuarios, Auditoría y los formularios reciben
las reglas compartidas de tipografía, tarjetas, inputs, badges y objetivos táctiles.
No se añadieron nuevas funciones ni métricas.

## Archivos modificados

Todos los siguientes son relativos a `C:\Proyecto`:

- apps/mobile/src/theme/screen-styles.ts
- apps/mobile/src/components/AppHeader.tsx
- apps/mobile/src/components/EmptyState.tsx
- apps/mobile/src/components/FormInput.tsx
- apps/mobile/src/components/ListItem.tsx
- apps/mobile/src/components/ModuleCard.tsx
- apps/mobile/src/components/PrimaryButton.tsx
- apps/mobile/src/components/ProductImage.tsx
- apps/mobile/src/components/SearchBar.tsx
- apps/mobile/src/components/SecondaryButton.tsx
- apps/mobile/src/components/StatCard.tsx
- apps/mobile/src/components/StatusBadge.tsx
- apps/mobile/src/app/(tabs)/_layout.tsx
- apps/mobile/src/app/(tabs)/dashboard/index.tsx
- apps/mobile/src/app/(tabs)/inventory/index.tsx
- apps/mobile/src/app/(tabs)/products/index.tsx
- apps/mobile/src/app/(tabs)/pos/index.tsx
- apps/mobile/src/app/(tabs)/more/reports/index.tsx
- apps/mobile/src/app/(tabs)/more/settings/index.tsx
- docs/qa/pro-ui-review.md

## Validación

- Typecheck completo aprobado, incluido mobile, API y Web.
- Pruebas relacionadas: 25 aprobadas.
- Suite completa: 87 archivos, 694 tests aprobados.
- Build Web final aprobado: export Expo, Vite/verificador y fotografías.
- Configuración pública Expo válida; sin cambios de SDK, package ni firma.
- Login real de admin comprobado en preview local mediante API de Render.
- Dashboard con datos reales; Productos con búsqueda, fotos y stock reales.
- Productos a 390 px: ancho del documento 390 px; sin overflow horizontal.
- Clientes y POS abiertos en el preview con datos reales. No se confirmaron ventas,
  compras, creación de clientes ni archivados contra producción.
- Evidencias locales: `.cache/pro-ui-dashboard.png` y
  `.cache/pro-ui-products-mobile-final.png`.

La API no permite CORS para el preview `http://127.0.0.1:4173`. Se comprobó la salud
HTTP 200 y se utilizó un proxy temporal en `.cache/pro-ui-preview.mjs`, exclusivamente
para la revisión. No se cambió CORS ni la URL del build original. El proxy reenvía a
Render, no genera datos ni mocks.

## Hallazgos y límites preservados

- Product no tiene categoría persistida: las opciones visuales actuales no clasifican
  los productos devueltos por la API. No se inventó un campo ni se cambiaron stores.
- Configuración conserva preferencias locales, incluyendo switches de notificaciones
  y seguridad; no se convirtieron en funciones backend ni se alteró autenticación.
- Dashboard muestra identificadores de cliente en algunas ventas recientes porque
  así los entrega actualmente su store. Se conserva esa lógica; resolver nombres es
  una corrección de datos/presentación pendiente fuera de este bloque conservador.
- Algunas pantallas de Más conservan encabezado del Stack y encabezado propio.
  Se mantuvieron para preservar sus controles actuales de regreso.
- No se añadieron utilidad, reportes nuevos ni periodos nuevos sin contrato disponible
  en la pantalla actual. Tampoco se reescribieron listas ni flujos comerciales.
- No se ejecutó este código nuevo en una APK ni en un dispositivo Android. La revisión
  móvil corresponde a viewport Web y configuración/compilación TypeScript de Expo.
- `apps/worker` no tiene fuentes TypeScript: el script existente lo omite.
- El cambio previo de finales de línea en purchase-routes.ts y los scripts/artefactos
  no rastreados anteriores no forman parte de esta implementación.

Backend, MongoDB, modelos, endpoints, permisos, stores, servicios, datos demo,
contraseñas, precios, SKU, inventario y referencias Product.imageUrl permanecen intactos.
