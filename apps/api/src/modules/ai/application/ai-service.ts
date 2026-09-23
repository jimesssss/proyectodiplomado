import { ForbiddenError, NotFoundError, ValidationError } from '../../../core/errors/app-error.js';
import {
  toPublicAiInteraction,
  type AiInteractionStatus,
  type PublicAiInteraction,
} from '../domain/entities/ai-interaction.js';
import { redactError, redactPrompt } from '../domain/rules/ai-rules.js';
import { aiRepo } from '../infrastructure/repositories/ai-repository.js';
import { getAiTool } from './tool-registry.js';

/**
 * Servicio AI (FASE 20): capa de permisos + ejecución de tools (flujo
 * ADR-008). El registro `aiInteractions` es la fuente de gobernanza:
 * correlaciona `requestId` + `userId` con la tool, sus args y el resultado.
 */

export interface AiCaller {
  readonly tenantId: string;
  readonly userId: string;
  readonly permissions: readonly string[];
}

export interface RunToolInput {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly prompt?: string | undefined;
}

export interface InteractionListQuery {
  readonly page: number;
  readonly limit: number;
  readonly tool?: string | undefined;
  readonly status?: AiInteractionStatus | undefined;
}

export interface InteractionPage {
  readonly items: readonly PublicAiInteraction[];
  readonly total: number;
}

function toIssues(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Ejecuta UNA tool y registra la interacción:
 * 1) tool registrada (desconocida → 400, sin registro);
 * 2) TODOS sus `requiredPermissions` del usuario (faltante → 403
 *    `Missing permission` con `details.permission`, sin registro);
 * 3) contrato Zod del `args` (inválido → 400 `Invalid tool arguments`,
 *    sin ejecutar ni registrar);
 * 4) ejecución con `tenantId` SIEMPRE del JWT → registro `completed`; si la
 *    tool falla → registro `failed` y se REPRODUCE el error original (el
 *    registro de gobernanza jamás lo enmascara).
 *
 * Interpretación documentada de ADR-008 "toda interacción guarda
 * aiInteractions": interacción = intento de ejecución con contrato VÁLIDO;
 * las violaciones de permiso/contrato se rechazan antes de invocar la tool.
 */
export async function runAiTool(
  caller: AiCaller,
  requestId: string,
  input: RunToolInput,
): Promise<PublicAiInteraction> {
  const tool = getAiTool(input.tool);
  if (tool === null) {
    throw new ValidationError('Unknown tool', { tool: input.tool });
  }
  for (const permission of tool.requiredPermissions) {
    if (!caller.permissions.includes(permission)) {
      throw new ForbiddenError('Missing permission', { permission });
    }
  }
  const parsed = tool.argsSchema.safeParse(input.args);
  if (!parsed.success) {
    throw new ValidationError('Invalid tool arguments', { issues: toIssues(parsed.error) });
  }

  const base = {
    requestId,
    userId: caller.userId,
    prompt: redactPrompt(input.prompt),
    tool: tool.name,
    args: parsed.data as Record<string, unknown>,
  };
  const startedAt = Date.now();

  let result: unknown;
  try {
    result = await tool.execute(caller.tenantId, parsed.data, caller.permissions);
  } catch (error) {
    try {
      await aiRepo.create(caller.tenantId, {
        ...base,
        result: null,
        error: redactError(error),
        status: 'failed',
        latencyMs: Date.now() - startedAt,
      });
    } catch {
      // El fallo al REGISTRAR nunca enmascara el error original de la tool.
    }
    throw error;
  }

  const created = await aiRepo.create(caller.tenantId, {
    ...base,
    result: result === undefined || result === null ? null : (result as object),
    error: null,
    status: 'completed',
    latencyMs: Date.now() - startedAt,
  });
  return toPublicAiInteraction(created);
}

/** Historial paginado de interacciones del tenant (orden: más reciente). */
export async function listInteractions(
  tenantId: string,
  query: InteractionListQuery,
): Promise<InteractionPage> {
  const page = await aiRepo.list(
    tenantId,
    { tool: query.tool, status: query.status },
    query.page,
    query.limit,
  );
  return { items: page.items.map(toPublicAiInteraction), total: page.total };
}

/** Detalle de UNA interacción — 404 uniforme (inexistente o de otro tenant). */
export async function getInteraction(tenantId: string, id: string): Promise<PublicAiInteraction> {
  const found = await aiRepo.findById(tenantId, id);
  if (found === null) {
    throw new NotFoundError();
  }
  return toPublicAiInteraction(found);
}
