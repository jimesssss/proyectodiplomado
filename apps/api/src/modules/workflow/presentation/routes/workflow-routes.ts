import type { Permission } from '@erp/permissions';
import { Router, type RequestHandler } from 'express';
import { auditFromRequest } from '../../../../core/audit/audit.js';
import { requireAuth } from '../../../../core/auth/middleware.js';
import { requirePermission } from '../../../../core/auth/require-permission.js';
import { successListResponse, successResponse } from '../../../../core/http/envelope.js';
import {
  createCrudRouter,
  crudIdParamsSchema,
  currentUser,
  type CrudListQueryBase,
  type CrudPatchBase,
  type CrudResourceSpec,
  type CrudRouterDeps,
} from '../../../../core/http/crud-router.js';
import { validate } from '../../../../core/validation/validate.js';
import type { PublicWorkflow } from '../../domain/entities/workflow.js';
import {
  decideApproval,
  getApproval,
  listApprovals,
  type ApprovalListQuery,
  type DecideApprovalInput,
} from '../../application/approval-service.js';
import {
  listWorkflowInstances,
  runWorkflow,
  type InstanceListQuery,
  type RunWorkflowInput,
} from '../../application/engine-service.js';
import {
  archiveWorkflow,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflow,
  type CreateWorkflowInput,
  type PatchWorkflowInput,
  type WorkflowListQuery,
} from '../../application/workflow-service.js';
import {
  approvalListQuerySchema,
  createWorkflowBodySchema,
  decisionBodySchema,
  instanceListQuerySchema,
  patchWorkflowBodySchema,
  runWorkflowBodySchema,
  workflowListQuerySchema,
} from '../validators/workflow-validators.js';

export type WorkflowRouterDeps = CrudRouterDeps;

/**
 * Montaje único bajo `/api/v1/workflows` (convenciones §4, fila 14): definiciones
 * (CRUD vía fábrica, SIN DELETE — el catálogo no define `workflow:delete`;
 * archivar via `PATCH {archived}`) + motor (`POST /:id/run`, `GET /:id/instances`
 * con `workflow:update`/`workflow:read`) + cola de aprobaciones
 * (`GET /approvals[/:id]` con `approval:read` y `POST /approvals/:id/decision`
 * con `approval:approve` — separación explícita leer ≠ decidir).
 *
 * ORDEN DE MONTAJE CRÍTICO: el router del motor va PRIMERO para que
 * `GET /workflows/approvals` no caiga en el `GET /:id` del CRUD (y dentro del
 * motor, `/approvals*` se declara antes que `/:id/…`).
 */
export const WORKFLOW_ROUTE_PATHS = {
  workflows: '/api/v1/workflows',
} as const;

function workflowSpec(): CrudResourceSpec<
  PublicWorkflow,
  CreateWorkflowInput,
  PatchWorkflowInput & CrudPatchBase,
  WorkflowListQuery & CrudListQueryBase
> {
  return {
    permissions: {
      read: 'workflow:read',
      create: 'workflow:create',
      update: 'workflow:update',
      // Sin `workflow:delete` en el catálogo → DELETE no publicado.
      delete: undefined,
    },
    entity: 'workflow',
    createSchema: createWorkflowBodySchema,
    patchSchema: patchWorkflowBodySchema,
    listQuerySchema: workflowListQuerySchema,
    handlers: {
      create: (tenantId, body) => createWorkflow(tenantId, body),
      list: (tenantId, query) => listWorkflows(tenantId, query),
      get: (tenantId, id) => getWorkflow(tenantId, id),
      update: (tenantId, id, patch) => updateWorkflow(tenantId, id, patch),
      archive: (tenantId, id) => archiveWorkflow(tenantId, id),
    },
  };
}

/**
 * Motor y cola de aprobaciones: 5 rutas a mano. SIN creación/PATCH/DELETE de
 * aprobaciones (solo el motor las crea; decidir es un POST aislado) y SIN
 * detalle de instancias individuales (la lista `/…/instances` las cubre).
 */
function createWorkflowEngineRouter(deps: WorkflowRouterDeps): Router {
  const router = Router();
  const auth: RequestHandler = requireAuth(deps.jwt, deps.isSessionActive);

  // `/approvals*` ANTES de cualquier `/:id…` (el CRUD se monta después de ESTE router).
  router.get(
    '/approvals',
    auth,
    requirePermission('approval:read'),
    validate({ query: approvalListQuerySchema }),
    async (req, res) => {
      const query = req.query as unknown as ApprovalListQuery;
      const result = await listApprovals(currentUser(req).tenantId, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  router.get(
    '/approvals/:id',
    auth,
    requirePermission('approval:read'),
    validate({ params: crudIdParamsSchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const approval = await getApproval(currentUser(req).tenantId, params.id);
      res.status(200).json(successResponse(req.requestId, approval));
    },
  );

  router.post(
    '/approvals/:id/decision',
    auth,
    requirePermission('approval:approve'),
    validate({ params: crudIdParamsSchema, body: decisionBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as DecideApprovalInput;
      const user = currentUser(req);
      const approval = await decideApproval(user.tenantId, params.id, user.userId, body);
      await auditFromRequest(req, {
        action: 'approval.decide',
        entityType: 'approval',
        entityId: approval.id,
        previousValue: { status: 'pending' },
        newValue: approval,
        reason: `decision:${approval.status}`,
      });
      res.status(200).json(successResponse(req.requestId, approval));
    },
  );

  router.post(
    '/:id/run',
    auth,
    requirePermission('workflow:update'),
    validate({ params: crudIdParamsSchema, body: runWorkflowBodySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const body = req.body as RunWorkflowInput;
      const instance = await runWorkflow(currentUser(req).tenantId, params.id, body);
      await auditFromRequest(req, {
        action: 'workflow.instance.create',
        entityType: 'workflow.instance',
        entityId: instance.id,
        newValue: instance,
        reason: `state:${instance.state}`,
      });
      res.status(201).json(successResponse(req.requestId, instance));
    },
  );

  router.get(
    '/:id/instances',
    auth,
    requirePermission('workflow:read'),
    validate({ params: crudIdParamsSchema, query: instanceListQuerySchema }),
    async (req, res) => {
      const params = req.params as { id: string };
      const query = req.query as unknown as InstanceListQuery;
      const result = await listWorkflowInstances(currentUser(req).tenantId, params.id, query);
      res.status(200).json(
        successListResponse(req.requestId, result.items, {
          page: query.page,
          limit: query.limit,
          total: result.total,
        }),
      );
    },
  );

  return router;
}

/** Los 2 montajes del módulo (MISMO path, orden importa), para la composition root. */
export function createWorkflowRouters(
  deps: WorkflowRouterDeps,
): readonly { path: string; router: Router }[] {
  return [
    // Motor + aprobaciones PRIMERO: `/approvals` no debe caer en `/:id` del CRUD.
    { path: WORKFLOW_ROUTE_PATHS.workflows, router: createWorkflowEngineRouter(deps) },
    { path: WORKFLOW_ROUTE_PATHS.workflows, router: createCrudRouter(deps, workflowSpec()) },
  ];
}

/** Re-export para la matriz de permisos (permisos usados por recurso). */
export type WorkflowPermission = Extract<Permission, `workflow:${string}` | `approval:${string}`>;
