# API — HR (`/api/v1/employees` + `/api/v1/attendance` + `/api/v1/salaries`) — FASE 19

Estado: implementado. Módulo `apps/api/src/modules/hr`; colecciones e índices en `docs/database/hr.md`. Catálogo de permisos **SIN CAMBIOS**: `employee:*`, `attendance:*` y `hr.salary:*` entraron en el catálogo inicial de FASE 6 (commit `d5d8753`, verificado con `git log -S` → `pv` sigue en **2**, sin re-login por esta fase — ver `docs/security/permission-matrix.md`).

## Recursos y endpoints

**3 montajes** (convenciones §4, fila 19) — **13 endpoints**. Empleados comparten grupo `employee:*` (el catálogo **SÍ** define `employee:delete` → DELETE **publicado** como **soft-delete**, patrón CRM/product); asistencia y nómina usan `attendance:*`/`hr.salary:*` que **NO** tienen `:delete` → esas rutas DELETE **no existen** (peticiones → **404**) y los registros se archivan con `PATCH {archived}` con su permiso de actualización (patrón bom/production.order/goods.receipt).

| Acción                               | Ruta                    | Permiso             |
| ------------------------------------ | ----------------------- | ------------------- |
| listar empleados (nómina activa)     | `GET /employees`        | `employee:read`     |
| crear empleado                       | `POST /employees`       | `employee:create`   |
| detalle de empleado                  | `GET /employees/:id`    | `employee:read`     |
| editar / estado / archivar           | `PATCH /employees/:id`  | `employee:update`   |
| borrar empleado (soft-delete)        | `DELETE /employees/:id` | `employee:delete`   |
| listar asistencia (por rango/día)    | `GET /attendance`       | `attendance:read`   |
| registrar fichaje/día                | `POST /attendance`      | `attendance:create` |
| detalle de asistencia                | `GET /attendance/:id`   | `attendance:read`   |
| editar fichajes / archivar           | `PATCH /attendance/:id` | `attendance:update` |
| listar nómina (por empleado/período) | `GET /salaries`         | `hr.salary:read`    |
| crear renglón de nómina              | `POST /salaries`        | `hr.salary:create`  |
| detalle de nómina                    | `GET /salaries/:id`     | `hr.salary:read`    |
| editar importes / archivar           | `PATCH /salaries/:id`   | `hr.salary:update`  |

- **Leer ≠ crear/actualizar/borrar** (ningún `:read` escribe) — verificado en `tests/security/hr-security.test.ts`.
- El **owner** (y `super_admin`) reciben los 12 permisos por derivación del catálogo; `pv` vigente **2**.
- `GET /attendance` **NO** tiene ruta DELETE (404) y `GET /salaries` **NO** tiene ruta DELETE (404) — solo empleados.

## Empleado (`/employees`)

- **Clave natural `code`**: normalizada en el servidor (trim → mayúsculas → espacios → `-`) y validada (`2-32` de `[A-Z0-9._-]` con inicial alfanumérica) → inválido `400 Invalid code`; **única por tenant** (duplicado → `409 Code already exists`; el MISMO código existe sin conflicto en otro tenant) e **inmutable** (crear con `code` en PATCH → `400`, esquema estricto).
- **`email` único por tenant** (normalizado a minúsculas; duplicado → `409 Email already exists`; formato → `400 Invalid email`, con `.trim()` antes de `.email()`).
- **Campos**: `firstName`/`lastName` (1-60, `.trim()` → solo espacios `400`), `position` (1-80), `department?` (texto ≤80 — **PARTIAL**: FK a departamentos de Organization **NO** implementado), `hireDate` (fecha), `userId?` (FK usuario del MISMO tenant — desconocido → `400 Unknown user`, patrón CRM).
- **Estado inicial `active`**; transiciones SOLO vía `PATCH {status}` con `employee:update`:
  - `active ↔ inactive` (baja y reincorporación temporales), `active|inactive → terminated`.
  - `terminated` **terminal**: los campos de negocio (`firstName`, `lastName`, `email`, `position`, `department`, `hireDate`, `userId`) quedan **congelados** → `409 Only non-terminal employees can be edited`; repetido → `409 Status is already the requested one`; sin salida → `409 Invalid status transition`; fuera del enum → `400`.
  - `archived` es **ortogonal** al estado (archivar un `terminated` es válido).
- **DELETE = soft-delete** (`employee:delete`): marca `archived`; doble → `409 Employee is already archived`; restaurar = `PATCH {archived:false}` (audita `employee.restore`). PATCH vacío → `400 No valid fields to update`.
- Empleado **archivado** bloquea el ALTA de su asistencia/nómina → `409 Employee is archived` (paralelo a `Project is archived`, FASE 17); los registros existentes siguen editables.

## Asistencia (`/attendance`)

- **UN registro por empleado por DÍA** (clave única `employeeId + date`): el `date` se trunca a **medianoche UTC** en el servidor; repetir el mismo día (aunque venga con hora) → `409 Attendance already recorded for this date`. La unicidad **incluye archivados**: corregir es vía `PATCH`, no archivar y recrear.
- **Horas `HH:MM` (24h)**: `checkIn` obligatorio; formato inválido → `400 Invalid time`. `checkOut` opcional; **`checkOut ≥ checkIn`** → `400 checkOut must be on or after checkIn`. Al editar se valida la **pareja efectiva** (lo escrito + lo que ya estaba): no se puede perder la `checkIn` debajo de una `checkOut` existente → `400 checkIn is required when checkOut is set`.
- **`status` derivado** (`open` sin `checkOut` → `closed` con él): NO se almacena, viaja solo en la proyección pública (patrón `dueAt` de FASE 18). `PATCH {checkOut: null}` reabre.
- **Inmutables al crear**: `employeeId` y `date` NO existen en el PATCH → `400`. FK empleado desconocido/ajeno → `404` uniforme (mismo módulo, patrón projects).
- **Sin ruta DELETE** (`attendance:*` sin `:delete` → 404); se archiva con `PATCH {archived}` (`409 Attendance is already archived` / `Attendance is not archived`).

## Nómina (`/salaries`)

- **UN renglón por empleado por PERÍODO `YYYY-MM`** (clave única): repetido → `409 Salary record already exists for this period`; periodo inválido (`2026-13`, `202609`) → `400 Invalid period`. Un período archivado **sigue ocupado** (no se paga dos veces).
- **Importes**: `baseAmount` obligatorio ≥0 (máx `MONEY_MAX`), `bonusAmount`/`deductionAmount` opcionales (default `0`); negativo → `400`. Se redondean con `roundMoney` (2 decimales) al escribir.
- **`netAmount` DERIVADO** (no persistido): `roundMoney(base + bonus − deduction)` — recalculado en cada lectura, imposible desincronizarlo. Puede ser **negativo** (anticipo/descuento mayor que el sueldo — decisión de diseño, documentada).
- **Inmutales al crear**: `employeeId` y `period` NO existen en el PATCH → `400`. FK empleado → `404` uniforme; empleado archivado → `409 Employee is archived`.
- **Sin ruta DELETE** (`hr.salary:*` sin `:delete` → 404); se archiva con `PATCH {archived}` (`409 Salary is already archived` / `Salary is not archived`).

## Query (listados)

Los listados usan `z.object`: parámetro **desconocido DESCARTADO sin error** (incluido `?tenantId=` — el filtro de tenant SIEMPRE sale del JWT); **valor inválido de un parámetro conocido** → `400 VALIDATION_ERROR`.

| Recurso       | Params                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/employees`  | `page?` (≥1, def 1), `limit?` (1-100, def 20), `archived?` (`true\|false`), `status?` (enum de 3)                                         |
| `/attendance` | `page?`, `limit?`, `employeeId?` (ObjectId), `from?`/`to?` (rango de días, `from > to` → `400 from must be on or before to`), `archived?` |
| `/salaries`   | `page?`, `limit?`, `employeeId?` (ObjectId), `period?` (`YYYY-MM`), `archived?`                                                           |

Orden: empleados/nómina desc por `createdAt`, asistencia desc por `fecha del registro` (desempate `_id`); `meta {page, limit, total}`.

## Auditoría

`employee.create` / `employee.update` / `employee.archive` / `employee.restore`, `attendance.create` / `attendance.update` / `attendance.archive` / `attendance.restore`, `salary.create` / `salary.update` / `salary.archive` / `salary.restore` (acción = `<entity>.<acción>`, entidades canónicas `employee`, `attendance`, `salary`); las transiciones del empleado quedan en `metadata.reason` = `status:<valor>` (p. ej. `status:terminated`), los archivados en `archived:true` (el DELETE de empleado audita `employee.archive`).

Envelope, códigos de error y paginación: `docs/api/conventions.md`. FK de usuario vía API pública de Identity (`findUserInTenant`): HR → Identity, nunca al revés (sin ciclos de módulos).

## NOT TESTED / RISK / PARTIAL

- **PARTIAL**: `department` es **texto libre** — la FK hacia los departamentos del módulo organization NO está implementada (la superficie pública de Organization no expone una búsqueda por tipo/kind); tampoco hay filtro `?department=`.
- **PARTIAL**: nómina básica **sin integración contable** (no genera asientos ni usa `fiscalPeriods`) y **sin campo moneda** (importes numéricos con 2 decimales, moneda implícita del tenant).
- **PARTIAL**: asistencia en hora **local sin zona horaria** (`HH:MM`), sin calendario laboral, turnos, horas extra ni vacaciones.
- **PARTIAL**: `netAmount` negativo permitido (anticipos/descuentos en exceso) — sin validación de topes salariales.
- **NOT TESTED**: `apps/web` / `apps/mobile` / Atlas real (no existen todavía en las fases de dominio); `explain()` de los 12 índices sobre Atlas; volumen alto de asistencia.
