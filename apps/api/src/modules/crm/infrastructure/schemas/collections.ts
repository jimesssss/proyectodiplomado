import { Schema, model, models, type Model, type SchemaDefinition } from 'mongoose';
import { ACTIVITY_TYPES } from '../../domain/entities/activity.js';
import { CUSTOMER_TYPES } from '../../domain/entities/customer.js';
import { LEAD_SOURCES, LEAD_STATUSES } from '../../domain/entities/lead.js';
import { OPPORTUNITY_STAGES } from '../../domain/entities/opportunity.js';
import type { ActivityDoc, ContactDoc, CustomerDoc, LeadDoc, OpportunityDoc } from './types.js';

/**
 * Colecciones CRM (FASE 8): documentos de negocio — `tenantId` SIEMPRE como
 * primer campo de índice (ADR-002). `archived` = soft-delete (DELETE de la API).
 *
 * Índices y su justificación (query → índice):
 * - todas: `{tenantId, createdAt:-1}` — listado paginado del tenant (GET /).
 * - customers: `{tenantId, code}` unique — clave natural del cliente.
 * - contacts: `{tenantId, customerId, createdAt:-1}` — timeline de un cliente.
 * - leads: `{tenantId, status, createdAt:-1}` — `GET /leads?status=`.
 * - opportunities: `{tenantId, stage, createdAt:-1}` — `GET /opportunities?stage=`.
 * - activities: `{tenantId, <link>, createdAt:-1}` ×3 — timeline por entidad.
 */

function getModel<T>(name: string, schema: Schema): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  return existing ?? model<T>(name, schema as Schema<T>);
}

function buildSchema(collection: string, definition: Record<string, unknown>): Schema {
  const schema = new Schema(definition as unknown as SchemaDefinition, {
    timestamps: true,
    collection,
  });
  // Listado paginado por tenant (patrón de consulta de database.md §3).
  schema.index({ tenantId: 1, createdAt: -1 });
  return schema;
}

const addressSchema = new Schema(
  {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    country: { type: String, trim: true, uppercase: true },
  },
  { _id: false },
);

const customerSchema = buildSchema('customers', {
  tenantId: { type: String, required: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: CUSTOMER_TYPES, default: 'company' },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  taxId: { type: String, trim: true, uppercase: true },
  address: { type: addressSchema, required: false },
  archived: { type: Boolean, default: false },
});
// Clave natural por tenant: uniqueness sin bloquear otros tenants (ADR-002).
customerSchema.index({ tenantId: 1, code: 1 }, { unique: true });

const contactSchema = buildSchema('contacts', {
  tenantId: { type: String, required: true },
  customerId: { type: Schema.Types.ObjectId, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  jobTitle: { type: String, trim: true },
  isPrimary: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
});
contactSchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });

const leadSchema = buildSchema('leads', {
  tenantId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  source: { type: String, enum: LEAD_SOURCES, required: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  notes: { type: String, trim: true },
  status: { type: String, enum: LEAD_STATUSES, default: 'new' },
  customerId: { type: Schema.Types.ObjectId, default: null },
  assignedTo: { type: String },
  archived: { type: Boolean, default: false },
});
leadSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

const opportunitySchema = buildSchema('opportunities', {
  tenantId: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  customerId: { type: Schema.Types.ObjectId, required: true },
  stage: { type: String, enum: OPPORTUNITY_STAGES, default: 'prospecting' },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'USD', uppercase: true, trim: true },
  expectedCloseDate: { type: Date, default: null },
  lostReason: { type: String, trim: true },
  archived: { type: Boolean, default: false },
});
opportunitySchema.index({ tenantId: 1, stage: 1, createdAt: -1 });

const activitySchema = buildSchema('activities', {
  tenantId: { type: String, required: true },
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  subject: { type: String, required: true, trim: true },
  notes: { type: String, trim: true },
  dueAt: { type: Date, default: null },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  customerId: { type: Schema.Types.ObjectId, default: null },
  leadId: { type: Schema.Types.ObjectId, default: null },
  opportunityId: { type: Schema.Types.ObjectId, default: null },
  assignedTo: { type: String },
  archived: { type: Boolean, default: false },
});
// Timeline de cada entidad enlazada (tenantId primero — ADR-002).
activitySchema.index({ tenantId: 1, customerId: 1, createdAt: -1 });
activitySchema.index({ tenantId: 1, leadId: 1, createdAt: -1 });
activitySchema.index({ tenantId: 1, opportunityId: 1, createdAt: -1 });

export const CustomerModel = getModel<CustomerDoc>('Customer', customerSchema);
export const ContactModel = getModel<ContactDoc>('Contact', contactSchema);
export const LeadModel = getModel<LeadDoc>('Lead', leadSchema);
export const OpportunityModel = getModel<OpportunityDoc>('Opportunity', opportunitySchema);
export const ActivityModel = getModel<ActivityDoc>('Activity', activitySchema);
