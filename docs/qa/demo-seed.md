# Demo real Dulcería ERP-SC

Desde C:\Proyecto: `pnpm seed:demo`.

El comando carga las variables existentes de `.env` y `apps/api/.env`. Requiere `MONGODB_URI` y MongoDB Atlas/replica set con transacciones. No imprime credenciales. Reutiliza admin@erp-sc.com activo, su tenant y contraseña; no comprueba login por solicitud del usuario. No necesita DEMO_ADMIN_PASSWORD cuando existe ese administrador.

Crea la jerarquía organización → empresa → sucursal → dos almacenes activos, dos cuentas MXN (cash/bank), 100 productos, 20 clientes, 15 proveedores, entradas iniciales, 10 compras recibidas/pagadas, 20 ventas entregadas/cobradas, seis gastos y una aportación de efectivo. Las cuentas incluyen saldos de apertura de demostración. Usa validadores, servicios y el mecanismo de auditoría del backend; no escribe directamente colecciones de negocio.

Identifica maestros por códigos DEMO-* y operaciones por referencias/notas ERP-SC DEMO v1. Reutiliza registros existentes; rechaza colisiones o documentos demo incompletos. Cada operación de compra/venta se ejecuta en una transacción que incluye inventario, tesorería y auditoría. El bloqueo local evita ejecuciones simultáneas desde este checkout; no garantiza exclusión entre máquinas distintas. No borrar ni editar manualmente los identificadores de los registros demo.

Las categorías no existen en el contrato de productos: no se crean campos ni entidades nuevas. La clasificación comercial aparece únicamente en description. Los SKU utilizan el campo real code. No existe un tipo de cuenta transfer: se utiliza bank.

La verificación levanta temporalmente las rutas existentes en 127.0.0.1 contra la misma base de datos. Usa una sesión real de mantenimiento con los permisos del administrador, y la revoca al finalizar. Esto comprueba lecturas y reportes del código local; no sustituye verificar Render o el dispositivo Android. No cambia la configuración de la aplicación ni sus pantallas.

Resultado de la última ejecución: docs/qa/demo-seed-result.json. Solo contiene identificadores, cantidades y estado de verificación; no incluye tokens ni contraseñas. `pnpm seed:demo --verify-only` verifica sin crear los datos de negocio, pero abre y revoca su sesión de mantenimiento.

Prueba aislada: `pnpm exec vitest run tests/integration/demo-seed.test.ts`. Usa MongoDB Memory Replica Set, servicios reales y HTTP real para comprobar la carga, lecturas mediante el API client móvil y la segunda ejecución sin duplicados. Únicamente se sustituye la configuración nativa de Expo dentro de la prueba; no se añaden mocks ni datos demo a la app móvil.
