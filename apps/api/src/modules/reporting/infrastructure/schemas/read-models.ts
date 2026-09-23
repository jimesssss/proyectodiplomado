import { Schema, model, models, type Model, type SchemaDefinition } from 'mongoose';

/**
 * Read models CQRS (FASE 15): Reporting SOLO-agrega (`.aggregate()`) sobre
 * las 10 colecciones físicas de otros módulos — sin hidratación y sin
 * escritura. Ningún módulo importa estas definiciones (aislamiento: cada
 * módulo declara SUS modelos).
 *
 * CRÍTICO — los nombres de modelo son `Reporting*` y NUNCA reutilizan el del
 * módulo dueño (`salesDocuments`, `customers`…): el `getModel` del dueño
 * comprobaría `models[<su nombre>]` y devolvería ESTE schema vacío →
 * corrompería sus escrituras.
 *
 * `tenantId` SIEMPRE primero en los índices (ADR-002). Los dos índices por
 * `issueDate` (consultados por los reportes) se declaran AQUÍ: mongoose los
 * construye sobre la colección compartida sin tocar los `collections.ts` del
 * dueño. Ver `docs/database/reporting.md`.
 */

/** Nombres físicos de las colecciones leídas (los usa también el repositorio). */
export const READ_COLLECTIONS = {
  salesDocuments: 'salesDocuments',
  purchaseDocuments: 'purchaseDocuments',
  customers: 'customers',
  suppliers: 'suppliers',
  products: 'products',
  stock: 'stock',
  cashMovements: 'cashMovements',
  treasuryAccounts: 'treasuryAccounts',
  leads: 'leads',
  opportunities: 'opportunities',
} as const;

/** Documento leído: solo agregación, el tipo concreto vive en cada `$project`. */
type ReadDoc = Record<string, unknown>;
type ReadModel = Model<ReadDoc>;

function getReadModel(name: string, schema: Schema): ReadModel {
  const existing = models[name] as ReadModel | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<ReadDoc>(name, schema as Schema<ReadDoc>);
}

/**
 * Schema sobre una colección AJENA: declara solo los campos que las
 * agregaciones referencian (documentación + casting de índice; la
 * agregación devuelve crudo y este modelo nunca escribe).
 */
function readSchema(definition: Record<string, unknown>, collection: string): Schema {
  return new Schema(definition as unknown as SchemaDefinition, { collection });
}

const salesReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    kind: { type: String, required: true },
    number: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    currency: { type: String, required: true },
    issueDate: { type: Date, required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    archived: { type: Boolean, required: true },
  },
  READ_COLLECTIONS.salesDocuments,
);
// FASE 15: ventana temporal por tipo (reportes); el dueño no filtra `issueDate`.
salesReadSchema.index({ tenantId: 1, kind: 1, issueDate: -1 });

const purchaseReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    kind: { type: String, required: true },
    number: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    currency: { type: String, required: true },
    issueDate: { type: Date, required: true },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    total: { type: Number, required: true },
    archived: { type: Boolean, required: true },
  },
  READ_COLLECTIONS.purchaseDocuments,
);
purchaseReadSchema.index({ tenantId: 1, kind: 1, issueDate: -1 });

const customerReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  READ_COLLECTIONS.customers,
);

const supplierReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  READ_COLLECTIONS.suppliers,
);

const productReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    code: { type: String, required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true },
    cost: { type: Number, default: null },
    minStock: { type: Number, default: null },
    archived: { type: Boolean, required: true },
  },
  READ_COLLECTIONS.products,
);

const stockReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, required: true },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    qty: { type: Number, required: true },
  },
  READ_COLLECTIONS.stock,
);

const cashMovementReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    accountId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    sourceType: { type: String, required: true },
    reason: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  READ_COLLECTIONS.cashMovements,
);

const treasuryAccountReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    currency: { type: String, required: true },
  },
  READ_COLLECTIONS.treasuryAccounts,
);

const leadReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    status: { type: String, required: true },
    archived: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
  },
  READ_COLLECTIONS.leads,
);

const opportunityReadSchema = readSchema(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    stage: { type: String, required: true },
    currency: { type: String, required: true },
    amount: { type: Number, required: true },
    expectedCloseDate: { type: Date, default: null },
    archived: { type: Boolean, required: true },
    createdAt: { type: Date, required: true },
  },
  READ_COLLECTIONS.opportunities,
);

export const ReportingSalesDocumentModel = getReadModel('ReportingSalesDocument', salesReadSchema);
export const ReportingPurchaseDocumentModel = getReadModel(
  'ReportingPurchaseDocument',
  purchaseReadSchema,
);
export const ReportingCustomerModel = getReadModel('ReportingCustomer', customerReadSchema);
export const ReportingSupplierModel = getReadModel('ReportingSupplier', supplierReadSchema);
export const ReportingProductModel = getReadModel('ReportingProduct', productReadSchema);
export const ReportingStockModel = getReadModel('ReportingStock', stockReadSchema);
export const ReportingCashMovementModel = getReadModel(
  'ReportingCashMovement',
  cashMovementReadSchema,
);
export const ReportingTreasuryAccountModel = getReadModel(
  'ReportingTreasuryAccount',
  treasuryAccountReadSchema,
);
export const ReportingLeadModel = getReadModel('ReportingLead', leadReadSchema);
export const ReportingOpportunityModel = getReadModel(
  'ReportingOpportunity',
  opportunityReadSchema,
);
