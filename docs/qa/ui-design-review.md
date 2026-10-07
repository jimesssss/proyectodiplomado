# Revisión UI/UX ERP-SC

Alcance: presentación de la aplicación Expo compartida por Android y Web y de la página Vite de verificación. Se conservaron rutas, servicios, contratos, autenticación, permisos y operaciones existentes. Las modificaciones de sesión, archivo de productos y cliente común anteriores a esta tarea se preservaron.

## Sistema aplicado

- Ciruela/frambuesa para identidad y acciones; fondos cálidos claros y neutros con contraste; verde, ámbar, rojo y azul petróleo para estados.
- Tipografía nativa sin fuentes o dependencias adicionales; títulos 26 px, secciones 18 px y texto auxiliar al menos 13 px en estilos de pantallas.
- Radios 8/12/16/20 px, escala de espaciado existente y sombras ligeras. Tarjetas con bordes discretos, precios y totales con jerarquía.
- Botones compartidos de 48 px, acciones compactas de al menos 44 px, campos de 48 px; etiquetas accesibles, foco de formularios, contraste AA de tokens principales comprobado por tests.
- Contenido web centrado hasta 1200 px, login hasta 440 px y formularios de autenticación hasta 520 px. Las cuadrículas existentes se adaptan al ancho disponible. Navegación y rutas Expo Router conservadas.
- Safe areas inferiores en las pestañas; Android conserva sus rutas, SDK y package. Sin APK ni cambios nativos de esta tarea.

## Pantallas y componentes

- Login: identidad de dulcería, formulario contenido, recuperar/reenviar/registrar mediante rutas existentes, control visual de contraseña y error accesible. Lógica de login intacta.
- Inicio: jerarquía de ventas por periodo, métrica diaria destacada, tarjetas y listas uniformes; carga/error y ausencia de datos identificados sin añadir valores inventados.
- Productos, inventario y POS: estilos homogéneos, controles accesibles, stock y precios diferenciados. Se mantienen Nuevo/Editar/Archivar, Cliente común, clientes registrados y Nuevo cliente con carrito.
- Ventas/compras/clientes/proveedores/gastos/caja/usuarios/auditoría: lenguaje visual compartido; carga/error de listas y estados de detalle de contactos/compras/usuarios derivados de los stores actuales.
- Reportes: gráficas existentes con cantidades visibles, periodo real de 7 días, jerarquía y ausencia de datos explícita. Sin PDF, nuevos filtros ni nuevos cálculos de negocio.
- Más: Caja y Gastos bajo Administración; Operación y Contactos conservan sus enlaces y permisos existentes.
- Configuración, registro, bienvenida y formularios restantes: tokens, reglas de estilos y componentes compartidos uniformes. Verificación Vite mantiene su flujo y adopta la misma paleta/foco/controles.
- La única edición visual en un store cambia UNPERSISTED_CATEGORY_OPTIONS a categorías de dulcería. No cambia validaciones, solicitudes ni persistencia.

## Comprobaciones visuales

Login local revisado en navegador con viewport 1440x900 y 375x812. Ancho del documento igual al viewport (sin desbordamiento horizontal); campos de 48 px; mostrar/ocultar contraseña y error de campos vacíos comprobados. No se enviaron credenciales ni se ejecutaron escrituras de negocio.

## Límites y problemas no modificados

1. El contrato real de productos no persiste categoría ni código de barras. Se cambian únicamente opciones visuales; no se crean campos ni se presentan categorías como datos persistidos.
2. El dashboard actual obtiene ventas; no dispone de compras/gastos/utilidad/actividad/inventario en su contrato. No se añadieron cargas, cálculos ni métricas nuevas. Esas secciones mantienen sus pantallas existentes.
3. Los historiales/métricas de clientes incluyen campos calculados inicializados en cero por el store existente. No se conectaron nuevas consultas ni se cambiaron dichos cálculos dentro de esta tarea visual.
4. Algunos formularios usan Alert.alert para confirmaciones/resultados; no se reimplementó ese mecanismo ni sus callbacks de negocio.
5. Las pantallas protegidas no se inspeccionaron visualmente con una sesión nueva en este turno; se revisó código real y se ejecutaron pruebas. Falta revisión visual completa en dispositivo Android físico y sesión web autenticada.
6. No se desplegó ni se hizo push. El diseño es local; la versión pública conserva su despliegue anterior.

## Archivos de esta tarea
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/(tabs)/_layout.tsx`
- `apps/mobile/src/app/(tabs)/dashboard/index.tsx`
- `apps/mobile/src/app/(tabs)/inventory/index.tsx`
- `apps/mobile/src/app/(tabs)/inventory/movements.tsx`
- `apps/mobile/src/app/(tabs)/more/audit/index.tsx`
- `apps/mobile/src/app/(tabs)/more/cash-register/index.tsx`
- `apps/mobile/src/app/(tabs)/more/customers/[id].tsx`
- `apps/mobile/src/app/(tabs)/more/customers/index.tsx`
- `apps/mobile/src/app/(tabs)/more/customers/new.tsx`
- `apps/mobile/src/app/(tabs)/more/expenses/index.tsx`
- `apps/mobile/src/app/(tabs)/more/expenses/new.tsx`
- `apps/mobile/src/app/(tabs)/more/index.tsx`
- `apps/mobile/src/app/(tabs)/more/purchases/[id].tsx`
- `apps/mobile/src/app/(tabs)/more/purchases/index.tsx`
- `apps/mobile/src/app/(tabs)/more/purchases/new.tsx`
- `apps/mobile/src/app/(tabs)/more/reports/index.tsx`
- `apps/mobile/src/app/(tabs)/more/sales/[id].tsx`
- `apps/mobile/src/app/(tabs)/more/sales/index.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/branches.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/companies.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/index.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/organizations.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/password.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/profile.tsx`
- `apps/mobile/src/app/(tabs)/more/settings/warehouses.tsx`
- `apps/mobile/src/app/(tabs)/more/suppliers/[id].tsx`
- `apps/mobile/src/app/(tabs)/more/suppliers/index.tsx`
- `apps/mobile/src/app/(tabs)/more/users/[id].tsx`
- `apps/mobile/src/app/(tabs)/more/users/index.tsx`
- `apps/mobile/src/app/(tabs)/pos/index.tsx`
- `apps/mobile/src/app/(tabs)/products/[id]/edit.tsx`
- `apps/mobile/src/app/(tabs)/products/[id]/index.tsx`
- `apps/mobile/src/app/(tabs)/products/index.tsx`
- `apps/mobile/src/app/(tabs)/products/new.tsx`
- `apps/mobile/src/app/login/index.tsx`
- `apps/mobile/src/app/register/index.tsx`
- `apps/mobile/src/app/welcome/index.tsx`
- `apps/mobile/src/components/AppHeader.tsx`
- `apps/mobile/src/components/AuthActionScreen.tsx`
- `apps/mobile/src/components/DataState.tsx`
- `apps/mobile/src/components/EmptyState.tsx`
- `apps/mobile/src/components/FormInput.tsx`
- `apps/mobile/src/components/ListItem.tsx`
- `apps/mobile/src/components/ModuleCard.tsx`
- `apps/mobile/src/components/PrimaryButton.tsx`
- `apps/mobile/src/components/ScreenContainer.tsx`
- `apps/mobile/src/components/SearchBar.tsx`
- `apps/mobile/src/components/SecondaryButton.tsx`
- `apps/mobile/src/components/SectionHeader.tsx`
- `apps/mobile/src/components/StatCard.tsx`
- `apps/mobile/src/components/StatusBadge.tsx`
- `apps/mobile/src/stores/productStore.ts`
- `apps/mobile/src/theme/screen-styles.ts`
- `apps/mobile/src/theme/tokens.test.ts`
- `apps/mobile/src/theme/tokens.ts`
- `apps/web/src/styles.css`
## Validación final

- pnpm typecheck: aprobado (código de salida 0).
- pnpm test: 685 tests aprobados en 86 archivos (código de salida 0).
- pnpm --filter @erp/web build: aprobado; exportación Expo Web y página Vite de verificación (código de salida 0).
- 7 comprobaciones de contraste AA incluidas; tonos secundarios y de información cumplen 4.5:1.
- Vista previa local: http://127.0.0.1:4173/login . No es un despliegue de Render.
- Este informe también se añadió: docs/qa/ui-design-review.md.