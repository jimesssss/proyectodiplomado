# ERP-SC: revisión visual, datos reales y PDF

Fecha: 7 de octubre de 2026. Cambios locales; sin publicación, push, commit ni APK.

## Resultado y alcance

Se conservaron la API de Render, MongoDB, autenticación, sesión, permisos, contratos de negocio, organización, precios, SKU, inventario, fotografías y firma Android. No se ejecutaron ventas, compras ni cambios de catálogo para probar la interfaz en producción. Las comprobaciones de negocio con escritura se realizan mediante los tests existentes.

El build web contiene la aplicación Expo Router y conserva la página de verificación existente. La aplicación sigue usando `https://erp-sc-api.onrender.com/api/v1`. La revisión visual se hizo en navegador con datos reales; el servidor temporal de comprobación reenvió las peticiones a Render sin introducir mocks ni cambiar la configuración de producción.

## Interfaz y pantallas

- Sistema compartido ciruela/frambuesa, fondo cálido, bordes discretos, tipografía legible, controles accesibles y distribución adaptable. Los componentes compartidos aplican consistencia a login, formularios, listas, detalles y confirmaciones existentes.
- Dashboard: operaciones recientes y métricas disponibles, sin utilidad inventada.
- Productos e inventario: fotografías conservadas, clasificación compatible, estados claros, búsqueda, controles y mensajes de carga/error.
- POS: cuadrícula más cómoda en web móvil, selectores buscables de cliente, almacén y cuenta; formulario de pago desplazable; Cliente común y Nuevo cliente conservados. El carrito se mantuvo al visitar el formulario de cliente. No se confirmó una venta real.
- Clientes: métricas e historial calculados desde facturas reales cuando el usuario tiene permiso. Sin permiso o sin acceso a esos datos se evita presentar un cero inventado.
- Proveedores: historial de compras real y acceso al formulario de alta mediante el servicio y permiso existentes.
- Compras y gastos: selectores compartidos, datos y estados legibles. Gastos se presenta como pagos; no se inventa una categoría contable.
- Caja: cuenta real, ingresos, egresos y saldo existentes; se retiró una tarjeta que repetía el mismo dato de ingresos.
- Auditoría: lista virtualizada, etiquetas coherentes, nombres de usuario cuando existe permiso y tratamiento de eventos sin usuario asociado. Se conserva el filtro backend `entityId`.
- Configuración: unidades reales y mensajes claros; se retiró información de depuración visual. Menú Más mantiene sus rutas y evita encabezados duplicados.
- Reportes: selector de nueve PDF, organización real para el encabezado, periodo donde existe soporte, generación, descarga y estados de error/éxito.

## Datos existentes, sin nuevos registros

Se consultó la API de Render autenticada. No se ejecutó el seed porque los mínimos solicitados ya estaban cubiertos. Registros de negocio agregados: **0**.

| Área | Registros observados |
| --- | ---: |
| Organizaciones | 2 existentes; una es Dulcería ERP-SC |
| Empresa / sucursal / almacenes | 1 / 1 / 2 |
| Productos totales / activos / demo / con imagen | 107 / 101 / 100 / 100 |
| Clientes / proveedores | 20 / 15 |
| Compras / ventas | 10 / 22 |
| Pagos / gastos demo dentro de esos pagos | 16 / 6 |
| Cuentas / movimientos de tesorería | 2 / 41 |
| Saldos de inventario / movimientos | 104 / 197 |
| Usuarios | 1 |
| Auditoría al tomar la muestra | 804 |

Los saldos de inventario son filas, no unidades de stock. La auditoría puede crecer por login y exportaciones normales. No se insertó auditoría falsa. Detalle de la muestra en `pro-data-counts.json`.

## Categorías

Product no tiene una entidad/campo de categoría persistida. Se reutiliza la clasificación comercial que ya existe en las descripciones demo (`Clasificación comercial: Gomitas.`). El helper reconoce únicamente categorías de dulcería; productos sin esa metadata siguen compatibles, sin asignarles datos nuevos ni modificar sus descripciones. No se añadió CRUD de categorías ni un campo de backend.

## PDF: datos, generación y entrega

`report-data.ts` consulta los servicios y rutas existentes; `report-pdf.ts` genera un PDF real con pdf-lib. Incluye ERP-SC, organización seleccionada, fecha, periodo aplicable, tablas, totales disponibles, encabezados repetidos y número de página. No se inventa una utilidad global ni se suman monedas distintas.

| Reporte | Fuente existente | Filas en la comprobación |
| --- | --- | ---: |
| Ventas | Exportación CSV de reportes de ventas | 22 |
| Compras | Exportación CSV de reportes de compras | 10 |
| Inventario | Exportación CSV de inventario | 101 |
| Productos | Listado de productos activos | 101 |
| Clientes | Listado de clientes | 20 |
| Proveedores | Listado de proveedores | 15 |
| Gastos / pagos | Listado de pagos | 16 |
| Caja / tesorería | Exportación CSV de flujo de caja y cuentas | 41 |
| General | Las ocho fuentes anteriores, separadas | 8 tablas |

Periodo de la comprobación: 2026-01-01 a 2026-12-31. Catálogo, directorios e inventario son consultas actuales, no fotografías históricas inventadas. Los reportes transaccionales usan el periodo. Las exportaciones limitadas a 5000 filas indican truncamiento y totales parciales si corresponde.

Ventas: MXN 1,612.00. Compras: MXN 1,944.74. Pagos contabilizados: MXN 9,424.74. Tesorería: ingresos MXN 2,612.00 y egresos MXN 9,424.74; aperturas MXN 75,000.00 se muestran separadas, sin contarlas como ingresos del periodo.

Los precios/costos de Product no incluyen moneda en el modelo: el PDF no les atribuye MXN artificialmente. Gastos incluye pagos de compras además de gastos operativos y lo indica explícitamente.

Web descarga los bytes PDF mediante un enlace de descarga. Android utiliza Expo FileSystem y Sharing compatibles con SDK 50, un archivo de caché único por exportación y la hoja de compartir. El archivo no se borra inmediatamente al cerrar el selector, para permitir que la aplicación receptora termine de leerlo; queda en caché gestionada por el sistema. No hay subida de archivos ni almacenamiento de servidor nuevo.

Se exige el permiso de exportación y los permisos reales de lectura. Los cuatro exports existentes conservan el permiso/auditoría del backend. Los otros PDF se construyen desde GET autorizados; no se creó un evento de exportación backend ficticio para ellos. El backend sigue siendo la autoridad para acceder a los datos.

## Validación

- Typecheck completo: aprobado.
- Suite completa: **707 tests aprobados, 89 archivos**.
- Tests específicos de PDF y entrega: 13 aprobados; incluyen paginación, acentos, CSV, periodos, monedas, saldos iniciales, descarga web y ciclo de vida del archivo Android.
- Build web Expo + página de verificación: aprobado.
- Expo SDK 50: dependencias compatibles comprobadas, sin actualización de SDK.
- Exportación del bundle Android: aprobada; no equivale a construir ni probar una APK.
- Nueve PDF generados con HTTP real contra Render, abiertos con lectores PDF y revisados mediante renderizado de páginas. Muestra en `../../output/pdf/`; resumen en `pro-pdf-verification.json`.
- Login real, organización, productos/imágenes, inventario, clientes e historial, proveedores e historial, detalle de compra, caja, usuarios, auditoría y reportes comprobados en navegador. POS, Cliente común y regreso desde Nuevo cliente revisados sin confirmar ventas ni crear clientes de prueba.
- Descarga web real verificada. La integración nativa está comprobada por tests y exportación Android; **compartir el PDF en Android físico sigue pendiente**, pues esta tarea prohíbe generar APK.

## Limitaciones existentes preservadas

- Los reportes existentes se delimitan por el tenant autenticado, no por la organización elegida en el encabezado. La interfaz lo informa; no se inventó un filtro backend.
- No existe una distinción completa de gastos operativos frente a todos los pagos; no se inventaron categorías, márgenes ni utilidad.
- Apertura/cierre de turnos de caja no tiene operación real soportada por los handlers actuales. No se creó un corte ficticio.
- El campo visual de fecha esperada de una compra no se persiste por el handler actual. No se cambió el contrato de compras.
- Al cancelar Nuevo cliente desde POS, la navegación existente puede volver a Inicio; al volver a POS se conserva el carrito y se recupera el pago. No se reescribió la navegación.
- Algunas preferencias de seguridad, notificaciones y fiscalidad son locales, no servicios backend de 2FA o notificación. No se presentaron como infraestructura nueva.
- No se probó manualmente archivar productos ni confirmar operaciones financieras en producción para evitar modificar datos existentes. Sus mecanismos y tests se conservaron.
- Sin despliegue automático: estos cambios todavía no están en Render ni en la APK instalada.

## Archivos

El inventario exacto de archivos de código modificados/creados se guarda en `pro-ui-pdf-files.txt`. Incluye los cambios visuales locales de la etapa previa y los de esta etapa. Los artefactos de validación están en `output/pdf` y los resultados sanitizados en esta carpeta. No incluye scripts o archivos preexistentes ajenos al trabajo. No se modificó código de apps/api, modelos MongoDB, permisos, firma Android ni configuración Render.
