import mongoose from 'mongoose';
import { Schema, model, type Model, type Types } from 'mongoose';

/**
 * Colección `auditLogs` (ADR-006): append-only.
 * Este módulo (core/audit) es el ÚNICO dueño: ni los módulos ni la API
 * exponen update/delete — solo `create` y `find` (ver audit.ts + test unit).
 */

export interface AuditLogDoc {
  _id: Types.ObjectId;
  /** '' cuando el intento no pudo resolverse a un tenant (login sin email conocido). */
  tenantId: string;
  userId: string;
  sessionId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string;
  timestamp: Date;
  previousValue: unknown;
  newValue: unknown;
  metadata: {
    ip?: string;
    userAgent?: string;
    reason?: string;
  };
}

function getModel(): Model<AuditLogDoc> {
  const existing = mongoose.models.AuditLog as Model<AuditLogDoc> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const schema = new Schema<AuditLogDoc>(
    {
      tenantId: {
        type: String,
        // '' es válido: intentos de login sin tenant resoluble (documentado).
        // (required de mongoose rechazaría la cadena vacía.)
        validate: {
          validator: (value: unknown) => typeof value === 'string',
          message: 'tenantId is required',
        },
      },
      userId: { type: String, default: '' },
      sessionId: { type: String, default: '' },
      action: { type: String, required: true },
      entityType: { type: String, required: true },
      entityId: { type: String, default: null },
      requestId: { type: String, required: true },
      timestamp: { type: Date, required: true },
      previousValue: { type: Schema.Types.Mixed, default: null },
      newValue: { type: Schema.Types.Mixed, default: null },
      metadata: {
        type: new Schema(
          {
            ip: { type: String },
            userAgent: { type: String },
            reason: { type: String },
          },
          { _id: false },
        ),
        default: {},
      },
    },
    { timestamps: false, collection: 'auditLogs' },
  );
  // Listado del tenant ordenado por tiempo (patrón de consulta de database.md).
  schema.index({ tenantId: 1, timestamp: -1 });
  // Filtro por acción dentro del tenant (misma query del listado).
  schema.index({ tenantId: 1, action: 1, timestamp: -1 });
  return model<AuditLogDoc>('AuditLog', schema);
}

export const AuditLogModel = getModel();
