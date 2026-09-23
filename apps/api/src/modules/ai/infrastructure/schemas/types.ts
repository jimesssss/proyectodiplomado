import type { AiInteractionStatus } from '../../domain/entities/ai-interaction.js';

/**
 * Documento `aiInteractions`. `args` y `result` son JSON arbitrario
 * (contrato Zod ya validado / salida de la tool) → `Schema.Types.Mixed`;
 * `unknown` en el tipo y el casteo vive SOLO en el mapper del repo.
 */
export interface AiInteractionDoc {
  _id: import('mongoose').Types.ObjectId;
  tenantId: string;
  /** Correlación con `meta.requestId` del envelope que originó la llamada. */
  requestId: string;
  userId: string;
  prompt?: string | null;
  tool: string;
  args: unknown;
  result?: unknown;
  error?: string | null;
  status: AiInteractionStatus;
  latencyMs: number;
  createdAt: Date;
  updatedAt: Date;
}
