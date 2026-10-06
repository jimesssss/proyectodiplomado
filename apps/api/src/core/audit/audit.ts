import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AuditLogModel } from './audit-log.js';

export interface AuditEvent {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly newValue?: unknown;
  readonly previousValue?: unknown;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly tenantId?: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly requestId: string;
  readonly timestamp: Date;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly metadata: {
    readonly ip?: string;
    readonly userAgent?: string;
    readonly reason?: string;
    readonly [key: string]: unknown;
  };
}

interface AuditCreateInput {
  readonly tenantId: string;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly requestId?: string;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly reason?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

function normalizeMetadata(input: { readonly reason?: string; readonly ip?: string; readonly userAgent?: string }): AuditRecord['metadata'] {
  const metadata: {reason?:string;ip?:string;userAgent?:string} = {};
  if (input.reason !== undefined) metadata.reason = input.reason;
  if (input.ip !== undefined) metadata.ip = input.ip;
  if (input.userAgent !== undefined) metadata.userAgent = input.userAgent;
  return metadata;
}

export async function recordAudit(input: AuditCreateInput): Promise<AuditRecord> {
  const modeled = await AuditLogModel.create({
    tenantId: input.tenantId,
    userId: input.userId ?? '',
    sessionId: input.sessionId ?? '',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    requestId: input.requestId ?? randomUUID(),
    timestamp: new Date(),
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    metadata: normalizeMetadata({
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent,
    }),
  });

  return {
    id: String(modeled._id),
    tenantId: modeled.tenantId,
    userId: modeled.userId,
    sessionId: modeled.sessionId,
    action: modeled.action,
    entityType: modeled.entityType,
    entityId: modeled.entityId,
    requestId: modeled.requestId,
    timestamp: modeled.timestamp,
    previousValue: modeled.previousValue,
    newValue: modeled.newValue,
    metadata: modeled.metadata,
  };
}

export async function auditFromRequest(req: Request, event: AuditEvent): Promise<AuditRecord> {
  const user = req.user as { userId?: string; tenantId?: string; sessionId?: string } | undefined;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : req.ip;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

  return recordAudit({
    tenantId: user?.tenantId ?? '',
    userId: user?.userId,
    sessionId: user?.sessionId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    requestId: typeof req.requestId === 'string' ? req.requestId : randomUUID(),
    previousValue: event.previousValue ?? null,
    newValue: event.newValue ?? null,
    reason: event.reason,
    ip,
    userAgent,
  });
}

export async function listAuditLogs(
  tenantId: string,
  query: AuditQuery = {},
): Promise<{ readonly items: readonly AuditRecord[]; readonly page: number; readonly limit: number; readonly total: number }> {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.max(1, Number(query.limit ?? 20));
  const filter: Record<string, unknown> = { tenantId };

  if (query.action !== undefined) filter.action = query.action;
  if (query.entityType !== undefined) filter.entityType = query.entityType;
  if (query.entityId !== undefined) filter.entityId = query.entityId;

  const [total, docs] = await Promise.all([
    AuditLogModel.countDocuments(filter),
    AuditLogModel.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: docs.map((doc) => ({
      id: String(doc._id),
      tenantId: doc.tenantId,
      userId: doc.userId,
      sessionId: doc.sessionId,
      action: doc.action,
      entityType: doc.entityType,
      entityId: doc.entityId,
      requestId: doc.requestId,
      timestamp: doc.timestamp,
      previousValue: doc.previousValue,
      newValue: doc.newValue,
      metadata: doc.metadata,
    })),
    page,
    limit,
    total,
  };
}
