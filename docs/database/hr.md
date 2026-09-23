# Base de datos — HR (FASE 19)

3 colecciones nuevas, propias de HR (dueño FASE 19): `employees` (maestro con clave natural + máquina laboral), `attendance` (registro único por empleado+día) y `salaries` (renglón único por empleado+período). Las 3 se listan y filtran de forma independiente (ADR-003). Schema en `hr/infrastructure/schemas/collections.ts`; repositorio único en `hr/infrastructure/repositories/hr-repository.ts` (modelo `HrEmployee`/`HrAttendance`/`HrSalary` — nunca reutiliza nombres de modelo de otro módulo).

## Colección `employees`

| Campo         | Tipo / notas                                                                       |
| ------------- | ---------------------------------------------------------------------------------- |
| `tenantId`    | string (SIEMPRE del JWT)                                                           |
| `code`        | string, **única por tenant** (normalizada: mayúsculas, espacios → `-`) e inmutable |
| `firstName`   | string (1-60, `.trim()` en validador)                                              |
| `lastName`    | string (1-60, `.trim()`)                                                           |
| `email`       | string, **único por tenant**, normalizado a minúsculas                             |
| `position`    | string (1-80)                                                                      |
| `department?` | string ≤80 \| null (texto libre — FK a Organization NO implementado, PARTIAL)      |
| `userId?`     | ObjectId → `users` \| null (FK del mismo tenant, resuelta con `findUserInTenant`)  |
| `hireDate`    | Date                                                                               |
| `status`      | enum `active \| inactive \| terminated` (inicial `active`; `terminated` terminal)  |
| `archived`    | boolean (soft-delete con `employee:delete`)                                        |

## Colección `attendance`

| Campo         | Tipo / notas                                                                      |
| ------------- | --------------------------------------------------------------------------------- |
| `tenantId`    | string (SIEMPRE del JWT)                                                          |
| `employeeId`  | ObjectId → `employees` (FK del mismo tenant)                                      |
| `date`        | Date a **medianoche UTC** (parte de la clave única `employeeId + date`)           |
| `checkIn`     | string `HH:MM` (24h, hora local sin zona — PARTIAL)                               |
| `checkOut?`   | string `HH:MM` \| null (nulo = registro `open`; `≥ checkIn` validado en servicio) |
| `notes?`      | string ≤200 \| null                                                               |
| `archived`    | boolean (sin ruta DELETE — archivar con `PATCH {archived}`)                       |
| _(no existe)_ | `status` (`open\|closed`) **NO se almacena**: derivado de `checkOut` al exponer   |

## Colección `salaries`

| Campo             | Tipo / notas                                                                           |
| ----------------- | -------------------------------------------------------------------------------------- |
| `tenantId`        | string (SIEMPRE del JWT)                                                               |
| `employeeId`      | ObjectId → `employees` (FK del mismo tenant)                                           |
| `period`          | string `YYYY-MM` (parte de la clave única `employeeId + period`; inmutable tras crear) |
| `baseAmount`      | number ≥0 (`roundMoney` 2 decimales al escribir)                                       |
| `bonusAmount`     | number ≥0 (default 0)                                                                  |
| `deductionAmount` | number ≥0 (default 0)                                                                  |
| `archived`        | boolean (sin ruta DELETE — archivar con `PATCH {archived}`; el período sigue ocupado)  |
| _(no existe)_     | `netAmount` **NO se almacena**: derivado `roundMoney(base + bonus − deduction)`        |

## Índices

| Colección    | Índice                                      | Query justificada                                                     |
| ------------ | ------------------------------------------- | --------------------------------------------------------------------- |
| `employees`  | `{tenantId, code}` **unique**               | clave natural única por tenant: duplicado → 409 `Code already exists` |
| `employees`  | `{tenantId, email}` **unique**              | email laboral único: duplicado → 409 `Email already exists`           |
| `employees`  | `{tenantId, createdAt:-1}`                  | `GET /employees` (listado por defecto, desc)                          |
| `employees`  | `{tenantId, archived, createdAt:-1}`        | `GET /employees?archived=`                                            |
| `employees`  | `{tenantId, status, createdAt:-1}`          | `GET /employees?status=` (nómina activa / bajas)                      |
| `attendance` | `{tenantId, employeeId, date}` **unique**   | UN fichaje por empleado por día: duplicado → 409                      |
| `attendance` | `{tenantId, date:-1}`                       | `GET /attendance` (orden `date` desc) + rangos `?from=`/`?to=`        |
| `attendance` | `{tenantId, archived, date:-1}`             | `GET /attendance?archived=`                                           |
| `salaries`   | `{tenantId, employeeId, period}` **unique** | UN renglón de nómina por empleado por período: duplicado → 409        |
| `salaries`   | `{tenantId, createdAt:-1}`                  | `GET /salaries` (listado por defecto, desc)                           |
| `salaries`   | `{tenantId, period, createdAt:-1}`          | `GET /salaries?period=` (cierre de nómina: todos los sueldos del mes) |
| `salaries`   | `{tenantId, archived, createdAt:-1}`        | `GET /salaries?archived=`                                             |

`tenantId` SIEMPRE primero (ADR-002); cada índice justificado por una lectura o restricción de unicidad (sin índices "por si acaso").

## Reglas de escritura

- Único camino a Mongo: `hr/infrastructure/repositories/hr-repository.ts`; toda operación filtra por `tenantId`. Las 3 unicidades resuelven sus `E11000` a `409` con mensaje del índice (code / email / asistencia / nómina).
- **FK de usuario** (`userId`): resuelta contra Identity vía `findUserInTenant` → desconocido → `400 Unknown user`; HR → Identity, nunca al revés. **FK de empleado** (`employeeId`): `employeeRepo.findById` del MISMO tenant → inexistente/ajeno → `404` uniforme; **archivado** → `409 Employee is archived` (paralelo a `Project is archived`).
- **Días/periodos normalizados en servidor**: `date` → medianoche UTC (`normalizeAttendanceDate`); `period` validado por regex `YYYY-MM` (mes 01-12).
- **Importes**: `roundMoney` (core `line-totals`, 2 decimales) al crear y al editar; `netAmount` no persiste (derivación en `toPublicSalary`).
- **Sin transacciones multi-documento**: cada escritura es UN documento (`findOneAndUpdate` con `$set`); la unicidad la garantiza el índice, no una transacción.
- Archivar **no libera** la clave (día/período): unicidad incluye archivados — decisión documentada (corregir vía `PATCH`; un período anulado sigue ocupado para no pagar dos veces).

## NOT TESTED / RISK / PARTIAL

- **NOT TESTED**: `explain()` de los 12 índices sobre Atlas; volumen alto de asistencia (días × empleados).
- **PARTIAL**: sin índice compuesto para filtros combinados p. ej. `?employeeId=&from=&to=` (resuelto por el índice único `employeeId+date` o por `date`; memoria filtrada aceptable).
- **PARTIAL**: sin retención/archivado automático (outbox/jobs no implementados); sin relación con `fiscalPeriods` (nómina no toca contabilidad).
- **RISK vigentes (sin regresar)**: sin transacciones Mongo multi-documento, sin `Idempotency-Key`, paginación offset, `apps/web`/`apps/mobile`/Atlas real NOT TESTED.
