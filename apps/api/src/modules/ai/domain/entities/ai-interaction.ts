/**
 * Entidad AiInteraction (FASE 20 — módulo AI, ADR-008). Registro de
 * gobernanza de CADA invocación de tool: prompt redactado, tool + args
 * (contrato Zod ya validado), resultado (o error), estado `completed` |
 * `failed`, `latencyMs` y correlación `requestId` + `userId`. Apéndice
 * INMUTABLE: no existe `PATCH` ni `DELETE` (los verbos no se publican) —
 * las herramientas de lectura NO escriben en `auditLog` (el ADR ata el
 * auditLog a la "acción final", reservada a tools de escritura futuras).
 */
export const AI_INTERACTION_STATUSES = ['completed', 'failed'] as const;
export type AiInteractionStatus = (typeof AI_INTERACTION_STATUSES)[number];

export interface AiInteraction {
  readonly id: string;
  readonly tenantId: string;
  /** Correlación con el envelope de la petición que la originó. */
  readonly requestId: string;
  readonly userId: string;
  /** Prompt redactado (controles fuera, truncado) o null si no vino. */
  readonly prompt: string | null;
  readonly tool: string;
  /** Arguments ya parseados por el contrato Zod de la tool. */
  readonly args: Record<string, unknown>;
  /** Objeto JSON devuelto por la tool (null si falló). */
  readonly result: object | null;
  readonly error: string | null;
  readonly status: AiInteractionStatus;
  readonly latencyMs: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type PublicAiInteraction = Omit<AiInteraction, 'tenantId'>;

export function toPublicAiInteraction(interaction: AiInteraction): PublicAiInteraction {
  return {
    id: interaction.id,
    requestId: interaction.requestId,
    userId: interaction.userId,
    prompt: interaction.prompt,
    tool: interaction.tool,
    args: interaction.args,
    result: interaction.result,
    error: interaction.error,
    status: interaction.status,
    latencyMs: interaction.latencyMs,
    createdAt: interaction.createdAt,
    updatedAt: interaction.updatedAt,
  };
}
