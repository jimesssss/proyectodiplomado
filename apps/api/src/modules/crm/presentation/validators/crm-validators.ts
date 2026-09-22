import { z } from 'zod';
import { ACTIVITY_TYPES } from '../../domain/entities/activity.js';
import { CUSTOMER_TYPES } from '../../domain/entities/customer.js';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../domain/entities/lead.js';
import { OPEN_STAGES, OPPORTUNITY_STAGES } from '../../domain/entities/opportunity.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`) se
 * RECHAZA con 400 — el tenant y las FK validadas salen del JWT/BD, no del
 * cliente (ADR-002). Los campos anidados (p. ej. `address`) también son estrictos.
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
/** Query booleana: 'true'/'false' literales (NO coerce.boolean: 'false' → true). */
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');

const emailField = z.string().min(3).max(254).email('Invalid email');
const phoneField = z.string().min(4).max(30);

const addressSchema = z.strictObject({
  street: z.string().min(1).max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  region: z.string().min(1).max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Invalid country (ISO-3166 alpha-2)')
    .optional(),
});

export const crmIdParamsSchema = z.object({
  id: z.string().regex(objectIdPattern, 'Invalid id'),
});

// --- Listados (page/limit + filtros por entidad) ---

export const customerListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

export const contactListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  customerId: objectId.optional(),
});

export const leadListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  status: z.enum(LEAD_STATUSES).optional(),
});

export const opportunityListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
});

export const activityListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
  customerId: objectId.optional(),
  leadId: objectId.optional(),
  opportunityId: objectId.optional(),
});

// --- Customers ---

export const createCustomerBodySchema = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  type: z.enum(CUSTOMER_TYPES).optional(),
  email: emailField.optional(),
  phone: phoneField.optional(),
  taxId: z.string().min(3).max(30).optional(),
  address: addressSchema.optional(),
});

export const patchCustomerBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  type: z.enum(CUSTOMER_TYPES).optional(),
  email: emailField.nullable().optional(),
  phone: phoneField.nullable().optional(),
  taxId: z.string().min(3).max(30).nullable().optional(),
  address: addressSchema.nullable().optional(),
  archived: z.boolean().optional(),
});

// --- Contacts ---

export const createContactBodySchema = z.strictObject({
  customerId: objectId,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: emailField.optional(),
  phone: phoneField.optional(),
  jobTitle: z.string().min(1).max(80).optional(),
  isPrimary: z.boolean().optional(),
});

export const patchContactBodySchema = z.strictObject({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: emailField.nullable().optional(),
  phone: phoneField.nullable().optional(),
  jobTitle: z.string().min(1).max(80).nullable().optional(),
  isPrimary: z.boolean().optional(),
  archived: z.boolean().optional(),
});

// --- Leads ---

export const createLeadBodySchema = z.strictObject({
  name: z.string().min(1).max(120),
  source: z.enum(LEAD_SOURCES),
  email: emailField.optional(),
  phone: phoneField.optional(),
  notes: z.string().max(2000).optional(),
  customerId: objectId.optional(),
  assignedTo: objectId.optional(),
});

export const patchLeadBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  email: emailField.nullable().optional(),
  phone: phoneField.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  customerId: objectId.nullable().optional(),
  assignedTo: objectId.nullable().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  archived: z.boolean().optional(),
});

// --- Opportunities ---

export const createOpportunityBodySchema = z.strictObject({
  name: z.string().min(1).max(120),
  customerId: objectId,
  // Solo etapas abiertas al crear: won/lost pasan por transición validada.
  stage: z.enum(OPEN_STAGES).optional(),
  amount: z.number().min(0).max(1e12).optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
    .optional(),
  expectedCloseDate: z.coerce.date().optional(),
});

export const patchOpportunityBodySchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  customerId: objectId.optional(),
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  amount: z.number().min(0).max(1e12).optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
    .optional(),
  lostReason: z.string().min(1).max(200).optional(),
  expectedCloseDate: z.coerce.date().nullable().optional(),
  archived: z.boolean().optional(),
});

// --- Activities ---

export const createActivityBodySchema = z.strictObject({
  type: z.enum(ACTIVITY_TYPES),
  subject: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  dueAt: z.coerce.date().optional(),
  completed: z.boolean().optional(),
  customerId: objectId.optional(),
  leadId: objectId.optional(),
  opportunityId: objectId.optional(),
  assignedTo: objectId.optional(),
});

export const patchActivityBodySchema = z.strictObject({
  type: z.enum(ACTIVITY_TYPES).optional(),
  subject: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  completed: z.boolean().optional(),
  customerId: objectId.nullable().optional(),
  leadId: objectId.nullable().optional(),
  opportunityId: objectId.nullable().optional(),
  assignedTo: objectId.nullable().optional(),
  archived: z.boolean().optional(),
});

// --- Búsqueda global (/search, desde FASE 8) ---

export const searchQuerySchema = z.object({
  q: z.string().min(2).max(100),
  /** Subconjunto de tipos separados por coma (p. ej. `customer,lead`). */
  types: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
