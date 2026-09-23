import { Schema, model, models, type Model } from 'mongoose';
import { AI_INTERACTION_STATUSES } from '../../domain/entities/ai-interaction.js';
import { ERROR_MAX, PROMPT_MAX } from '../../domain/rules/ai-rules.js';
import type { AiInteractionDoc } from './types.js';

/**
 * Colección `aiInteractions` (ADR-003: registro de gobernanza propio,
 * listado y filtrado independiente de la auditoría). Apéndice: solo
 * `create` + lecturas — el repositorio NO expone update/delete.
 */
export const AI_INTERACTIONS_COLLECTION = 'aiInteractions';

const aiInteractionSchema = new Schema<AiInteractionDoc>(
  {
    tenantId: { type: String, required: true },
    /** Correlación con el envelope (`meta.requestId`) de la petición. */
    requestId: { type: String, required: true },
    userId: { type: String, required: true },
    prompt: { type: String, default: null, maxlength: PROMPT_MAX },
    tool: { type: String, required: true, maxlength: 64 },
    args: { type: Schema.Types.Mixed, required: true },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null, maxlength: ERROR_MAX },
    status: { type: String, required: true, enum: [...AI_INTERACTION_STATUSES] },
    latencyMs: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: AI_INTERACTIONS_COLLECTION },
);

// Listado por defecto: GET /ai/interactions (desc por creación).
aiInteractionSchema.index({ tenantId: 1, createdAt: -1 });
// Historial por herramienta: GET /ai/interactions?tool=.
aiInteractionSchema.index({ tenantId: 1, tool: 1, createdAt: -1 });
// Historial por resultado: GET /ai/interactions?status=failed|completed.
aiInteractionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

function getModel<T>(name: string, schema: Schema<T>): Model<T> {
  const existing = models[name] as Model<T> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  return model<T>(name, schema);
}

export const AiInteractionModel = getModel<AiInteractionDoc>('AiInteraction', aiInteractionSchema);
