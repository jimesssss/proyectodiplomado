# Base de datos — CRM (FASE 8)

Colecciones del módulo `crm`. Documentos de negocio: `tenantId` SIEMPRE como primer campo de índice (ADR-002); `archived: boolean` = soft-delete. Todas con `timestamps: true` (`createdAt`/`updatedAt`) y `_id` ObjectId.

## Colecciones y campos

| Colección       | Campos principales                                                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`     | `tenantId`, `code` (único por tenant, inmutable, mayúsculas), `name`, `type` (`company\|person`), `email?`, `phone?`, `taxId?`, `address{street?,city?,region?,postalCode?,country?}` (subdoc sin `_id`), `archived`                           |
| `contacts`      | `tenantId`, `customerId` (ObjectId), `firstName`, `lastName`, `email?`, `phone?`, `jobTitle?`, `isPrimary`, `archived`                                                                                                                         |
| `leads`         | `tenantId`, `name`, `source` (`web\|referral\|event\|outbound\|partner\|other`), `email?`, `phone?`, `notes?`, `status` (`new\|contacted\|qualified\|converted\|lost`), `customerId?` (ObjectId), `assignedTo?` (string), `archived`           |
| `opportunities` | `tenantId`, `name`, `customerId` (ObjectId), `stage` (`prospecting\|qualification\|proposal\|negotiation\|won\|lost`), `amount` (≥0), `currency` (ISO-4217), `expectedCloseDate?`, `lostReason?`, `archived`                                   |
| `activities`    | `tenantId`, `type` (`call\|email\|meeting\|task\|note`), `subject`, `notes?`, `dueAt?`, `completed`, `completedAt?`, `customerId?`/`leadId?`/`opportunityId?` (ObjectId), `assignedTo?`, `archived` (al menos un enlace, validado en servicio) |

- `email` a minúsculas, `taxId`/`country`/`currency` a mayúsculas (normalización de servicio + setters).
- `assignedTo` guarda el `userId` como string (sin FK en BD; el servicio valida pertenencia al tenant).
- **Desviación documentada** de `docs/architecture/database.md`: NO existen `customerTags` ni colección derivada de timeline (`activities` ES la línea de tiempo); se añadirán en fases de reporting si el producto lo requiere.

## Índices (query → índice, todos con `tenantId` primero)

| Colección       | Índice                                                             | Query justificada                        |
| --------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `customers`     | `{tenantId, code}` **unique**                                      | clave natural + `POST` (duplicado → 409) |
| `customers`     | `{tenantId, createdAt:-1}`                                         | `GET /customers` (listado paginado desc) |
| `contacts`      | `{tenantId, customerId, createdAt:-1}`                             | `GET /contacts?customerId=` (timeline)   |
| `contacts`      | `{tenantId, createdAt:-1}`                                         | `GET /contacts`                          |
| `leads`         | `{tenantId, status, createdAt:-1}`                                 | `GET /leads?status=`                     |
| `leads`         | `{tenantId, createdAt:-1}`                                         | `GET /leads`                             |
| `opportunities` | `{tenantId, stage, createdAt:-1}`                                  | `GET /opportunities?stage=`              |
| `opportunities` | `{tenantId, createdAt:-1}`                                         | `GET /opportunities`                     |
| `activities`    | `{tenantId, customerId\|leadId\|opportunityId, createdAt:-1}` (×3) | timeline de cada entidad enlazada        |
| `activities`    | `{tenantId, createdAt:-1}`                                         | `GET /activities`                        |

La unicidad de `customers.code` es **por tenant**: el mismo código en dos tenants no colisiona (índice compuesto, ADR-002) — verificado en test de aislamiento.

## Reglas

- Ninguna operación fuera del repositorio del módulo (`crm-repository.ts` es el único camino a MongoDB; UNA fábrica genérica para las 5 colecciones).
- `tenantId` jamás del cliente; FKs cruzadas→ `404` uniforme (inexistente y ajeno se responden igual).
- `/search` usa regex **literal escapada** sobre los campos de texto (sin índice de texto): `RISK` colección-completa por tipo con `limit` — si crece, migrar a índice `$text` o Atlas Search (NOT TESTED a escala).
- Sin retención/TTL (mismo riesgo que el resto de colecciones de negocio).

## NOT TESTED / RISK

- **NOT TESTED**: Atlas real (índices creados en memory server igual que en dev); rendimiento de `/search` con colecciones grandes.
- **PARTIAL**: sin referential integrity en BD (cascadas/borrado en bloque): el soft-delete conserva enlaces por diseño.
- **RISK**: `activities` crece sin política de archivado automático.
