import { Types, type Model } from 'mongoose';
import { ConflictError } from '../../../../core/errors/app-error.js';
import type { Project, ProjectStatus } from '../../domain/entities/project.js';
import type { Task, TaskStatus } from '../../domain/entities/task.js';
import { ProjectModel, TaskModel } from '../schemas/collections.js';
import type { ProjectDoc, TaskDoc } from '../schemas/types.js';

/**
 * Repositorio Projects — único camino a MongoDB del módulo (2
 * colecciones). TODA operación filtra por `tenantId` (nunca llega del
 * cliente, ADR-002). Único punto de casteo: payload/$set de create/update y
 * ObjectId en filtros/mappers.
 */

export interface ProjectListFilter {
  readonly status?: ProjectStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface TaskListFilter {
  readonly status?: TaskStatus | undefined;
  readonly projectId?: string | undefined;
  readonly archived?: boolean | undefined;
}

export interface RepoPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function mapProject(doc: ProjectDoc): Project {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    code: doc.code,
    name: doc.name,
    description: doc.description ?? null,
    status: doc.status,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    managerId: doc.managerId == null ? null : String(doc.managerId),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function mapTask(doc: TaskDoc): Task {
  return {
    id: String(doc._id),
    tenantId: doc.tenantId,
    projectId: String(doc.projectId),
    title: doc.title,
    description: doc.description ?? null,
    status: doc.status,
    priority: doc.priority,
    assigneeId: doc.assigneeId == null ? null : String(doc.assigneeId),
    dueDate: doc.dueDate ?? null,
    dependsOn: (doc.dependsOn ?? []).map((dep) => String(dep)),
    archived: doc.archived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Listado paginado desc con `createdAt` + `_id` como desempate estable. */
async function paged<TDoc, TEntity>(
  model: Model<TDoc>,
  tenantId: string,
  extra: Record<string, unknown>,
  page: number,
  limit: number,
  map: (doc: TDoc) => TEntity,
): Promise<RepoPage<TEntity>> {
  const skip = (page - 1) * limit;
  const mongoFilter = { tenantId, ...extra };
  const [docs, total] = await Promise.all([
    model.find(mongoFilter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(mongoFilter),
  ]);
  return {
    items: docs.map((doc) => map(doc as unknown as TDoc)),
    total,
  };
}

export interface ProjectRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Project>;
  findById(tenantId: string, id: string): Promise<Project | null>;
  list(
    tenantId: string,
    filter: ProjectListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Project>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Project | null>;
}

export interface TaskRepo {
  create(tenantId: string, payload: Record<string, unknown>): Promise<Task>;
  findById(tenantId: string, id: string): Promise<Task | null>;
  list(
    tenantId: string,
    filter: TaskListFilter,
    page: number,
    limit: number,
  ): Promise<RepoPage<Task>>;
  update(tenantId: string, id: string, set: Record<string, unknown>): Promise<Task | null>;
  /** Grafo de dependencias del proyecto: taskId → sus `dependsOn` guardados. */
  dependencyEdges(
    tenantId: string,
    projectId: string,
  ): Promise<ReadonlyMap<string, readonly string[]>>;
}

export const projectRepo: ProjectRepo = {
  async create(tenantId, payload) {
    try {
      const doc = await ProjectModel.create({
        tenantId,
        archived: false,
        ...payload,
      } as unknown as ProjectDoc);
      return mapProject(doc.toObject() as unknown as ProjectDoc);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new ConflictError('Code already exists');
      }
      throw error;
    }
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await ProjectModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapProject(doc as unknown as ProjectDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      ProjectModel,
      tenantId,
      {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      (doc) => mapProject(doc as unknown as ProjectDoc),
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await ProjectModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapProject(doc as unknown as ProjectDoc);
  },
};

export const taskRepo: TaskRepo = {
  async create(tenantId, payload) {
    const doc = await TaskModel.create({
      tenantId,
      archived: false,
      ...payload,
    } as unknown as TaskDoc);
    return mapTask(doc.toObject() as unknown as TaskDoc);
  },

  async findById(tenantId, id) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await TaskModel.findOne({ _id: new Types.ObjectId(id), tenantId }).lean();
    return doc === null ? null : mapTask(doc as unknown as TaskDoc);
  },

  async list(tenantId, filter, page, limit) {
    return paged(
      TaskModel,
      tenantId,
      {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.projectId !== undefined ? { projectId: filter.projectId } : {}),
        ...(filter.archived !== undefined ? { archived: filter.archived } : {}),
      },
      page,
      limit,
      (doc) => mapTask(doc as unknown as TaskDoc),
    );
  },

  async update(tenantId, id, set) {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    const doc = await TaskModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), tenantId },
      { $set: set as Record<string, never> },
      { returnDocument: 'after' },
    ).lean();
    return doc === null ? null : mapTask(doc as unknown as TaskDoc);
  },

  async dependencyEdges(tenantId, projectId) {
    const edges = new Map<string, readonly string[]>();
    if (!Types.ObjectId.isValid(projectId)) {
      return edges;
    }
    const docs = await TaskModel.find(
      { tenantId, projectId: new Types.ObjectId(projectId) },
      { dependsOn: 1 },
    ).lean();
    for (const doc of docs) {
      const row = doc as unknown as Pick<TaskDoc, '_id' | 'dependsOn'>;
      edges.set(
        String(row._id),
        (row.dependsOn ?? []).map((dep) => String(dep)),
      );
    }
    return edges;
  },
};
