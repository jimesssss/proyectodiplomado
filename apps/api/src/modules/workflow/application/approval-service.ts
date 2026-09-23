import { ConflictError, NotFoundError } from '../../../core/errors/app-error.js';
import { eventBus } from '../../../core/events/event-bus.js';
import {
  toPublicApproval,
  type ApprovalStatus,
  type PublicApproval,
} from '../domain/entities/approval.js';
import type { ApprovalDecision } from '../domain/rules/workflow-rules.js';
import { approvalRepo, instanceRepo } from '../infrastructure/repositories/workflow-repository.js';

/**
 * Casos de uso de APROBACIONES (FASE 14): cola de solo lectura + decisión.
 * `tenantId` SIEMPRE del JWT; SIN creación pública (solo el motor crea),
 * SIN PATCH/DELETE → 404. La decisión (`approval:approve`) escribe DOS
 * documentos SIN transacciones Mongo, en orden INICIAL-INSTANCIA:
 *
 * 1. Instancia CONDICIONADA a `awaiting_approval` (puerta canónica). Si otra
 *    decisión ya ganó: mismo estado → la solicitud responde 409 "already";
 *    estado distinto → 409 "Invalid status transition" y NUNCA toca la
 *    solicitud ni emite eventos.
 * 2. Solicitud CONDICIONADA a `pending` (segunda puerta; en carreras con la
 *    MISMA decisión, la perdedora responde 409 y no emite).
 * 3. `WorkflowCompleted` vía bus tipado (tras el commit; ADR-007).
 *
 * Ventana documentada: un fallo tras (1) y antes de (2) deja instancia
 * decidida + solicitud `pending` → REINTENTAR la misma decisión la CURA
 * (ambas transiciones son idempotentes respecto al resultado deseado).
 * Exactly-UN-evento por decisión: solo emite quien supera (2).
 */

export interface ApprovalListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: ApprovalStatus | undefined;
  readonly workflowId?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
}

export interface ApprovalPage {
  readonly items: readonly PublicApproval[];
  readonly total: number;
}

export interface DecideApprovalInput {
  readonly decision: ApprovalDecision;
  readonly comment?: string | undefined;
}

export async function listApprovals(
  tenantId: string,
  query: ApprovalListQuery,
): Promise<ApprovalPage> {
  const filter = {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.workflowId !== undefined ? { workflowId: query.workflowId } : {}),
    ...(query.entityType !== undefined ? { entityType: query.entityType } : {}),
    ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
  };
  const page = await approvalRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicApproval), total: page.total };
}

export async function getApproval(tenantId: string, id: string): Promise<PublicApproval> {
  const approval = await approvalRepo.findById(tenantId, id);
  if (approval === null) {
    throw new NotFoundError();
  }
  return toPublicApproval(approval);
}

export async function decideApproval(
  tenantId: string,
  id: string,
  userId: string,
  input: DecideApprovalInput,
): Promise<PublicApproval> {
  const current = await approvalRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  // (1) Instancia: puerta at-most-once de la decisión.
  const transitioned = await instanceRepo.transition(
    tenantId,
    current.instanceId,
    'awaiting_approval',
    { state: input.decision },
  );
  if (transitioned === null) {
    const fresh = await instanceRepo.findById(tenantId, current.instanceId);
    if (fresh === null || fresh.state !== input.decision) {
      throw new ConflictError('Invalid status transition');
    }
    // Instancia YA en el resultado pedido: continúa y resuelve en (2).
  }

  // (2) Solicitud: segunda puerta condicionada a `pending`.
  const decided = await approvalRepo.transition(tenantId, id, 'pending', {
    status: input.decision,
    decidedBy: userId,
    decidedAt: new Date(),
    comment: input.comment?.trim() ?? null,
  });
  if (decided === null) {
    const fresh = await approvalRepo.findById(tenantId, id);
    if (fresh === null) {
      throw new NotFoundError();
    }
    if (fresh.status === input.decision) {
      throw new ConflictError('Status is already the requested one');
    }
    throw new ConflictError('Invalid status transition');
  }

  // (3) Evento de plataforma tras el commit (fallo de handler aislado por el bus).
  await eventBus.emit('WorkflowCompleted', {
    workflowInstanceId: current.instanceId,
    outcome: input.decision,
  });

  return toPublicApproval(decided);
}
