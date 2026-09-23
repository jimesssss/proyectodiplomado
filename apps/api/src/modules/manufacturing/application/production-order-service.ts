import { nextDocumentNumber } from '../../../core/numbering/numbering.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app-error.js';
// FKs de Organization/Inventory + stock (composición FASE 11/16):
// Manufacturing → Inventory, pero NUNCA al revés: sin ciclos de módulos.
import {
  assertProductActive,
  assertWarehouseActive,
  listBalances,
  recordMovement,
} from '../../inventory/index.js';
import type { BomLine } from '../domain/entities/bom.js';
import {
  PRODUCTION_PREFIX,
  toPublicProductionOrder,
  type ProductionOrder,
  type ProductionStatus,
  type PublicProductionOrder,
} from '../domain/entities/production-order.js';
import {
  canArchive,
  canProductionTransition,
  canRestore,
  computeComponentRequirements,
  isEditable,
  validateComponentLines,
} from '../domain/rules/manufacturing-rules.js';
import {
  orderRepo,
  type OrderListFilter,
} from '../infrastructure/repositories/manufacturing-repository.js';
import { getBom } from './bom-service.js';

/**
 * Casos de uso de órdenes de producción (FASE 16). `tenantId` SIEMPRE del
 * JWT (ADR-002); FKs inexistentes/ajenas → 404 uniforme. Solo los borradores
 * son editables más allá de su estado (patrón Sales/Purchasing). El stock
 * SOLO se mueve al `completed`, con el patrón de transferencias (FASE 11):
 * 1) PRE-CHEQUEO del saldo de TODOS los componentes → 422 `DOMAIN_ERROR`
 *    SIN escribir nada si no alcanza; 2) el estado; 3) los movimientos
 *    (`production_out` −componentes, `production_in` +terminado). El estado
 *    terminal es la guarda de at-most-once sin transacciones Mongo: los
 *    movimientos se calculan del documento YA ACTUALIZADO.
 */

export interface CreateProductionOrderInput {
  readonly productId: string;
  readonly quantity: number;
  readonly warehouseId: string;
  readonly bomId?: string | undefined;
  readonly lines?: readonly BomLine[] | undefined;
  readonly notes?: string | undefined;
}

export interface PatchProductionOrderInput {
  readonly productId?: string | undefined;
  readonly quantity?: number | undefined;
  readonly warehouseId?: string | undefined;
  readonly notes?: string | null | undefined;
  readonly status?: ProductionStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ProductionOrderListQuery {
  readonly page: number;
  readonly limit: number;
  readonly status?: ProductionStatus | undefined;
  readonly archived?: boolean | undefined;
}

export interface ProductionOrderPage {
  readonly items: readonly PublicProductionOrder[];
  readonly total: number;
}

/** Campos de negocio (todo salvo `status` y `archived`): solo en borrador. */
const BUSINESS_FIELDS = new Set(['productId', 'quantity', 'warehouseId', 'notes']);

/** Saldo proyectado de (producto, almacén) vía la API pública de Inventory. */
async function availableBalance(
  tenantId: string,
  productId: string,
  warehouseId: string,
): Promise<number> {
  const page = await listBalances(tenantId, { page: 1, limit: 1, productId, warehouseId });
  return page.items[0]?.qty ?? 0;
}

function toLinePayload(lines: readonly BomLine[]): Array<{ productId: string; quantity: number }> {
  return lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
}

export async function createProductionOrder(
  tenantId: string,
  input: CreateProductionOrderInput,
): Promise<PublicProductionOrder> {
  await assertProductActive(tenantId, input.productId);
  await assertWarehouseActive(tenantId, input.warehouseId);

  let lines: readonly BomLine[];
  if (input.bomId !== undefined) {
    // Snapshot de líneas desde la BOM (validada al escribirla): los
    // componentes NO se re-validan aquí — un producto archivado DESPUÉS de
    // crear la BOM sigue siendo direccionable para consumir su stock.
    const bom = await getBom(tenantId, input.bomId); // inexistente/ajena → 404
    if (bom.archived) {
      throw new ConflictError('BOM is archived');
    }
    if (bom.productId !== input.productId) {
      throw new ConflictError('BOM does not match the output product', {
        bomProductId: bom.productId,
        productId: input.productId,
      });
    }
    lines = bom.lines;
  } else {
    lines = input.lines ?? []; // vacío → 400 defensivo vía validación de abajo
    for (const line of lines) {
      await assertProductActive(tenantId, line.productId);
    }
  }
  const check = validateComponentLines(input.productId, lines);
  if (!check.valid) {
    throw new ValidationError('Invalid component lines', { issues: check.issues });
  }

  // `number` lo asigna SIEMPRE el servidor (core/numbering `$inc` atómico),
  // al FINAL: los intentos fallidos (FK 404/409, líneas inválidas) no
  // consumen números de la secuencia (sin huecos por validaciones).
  const number = await nextDocumentNumber(tenantId, 'production.order', PRODUCTION_PREFIX);
  const order = await orderRepo.create(tenantId, {
    number,
    productId: input.productId,
    quantity: input.quantity,
    warehouseId: input.warehouseId,
    bomId: input.bomId ?? null,
    lines: toLinePayload(lines),
    status: 'draft',
    notes: input.notes?.trim() ?? null,
  });
  return toPublicProductionOrder(order);
}

export async function listProductionOrders(
  tenantId: string,
  query: ProductionOrderListQuery,
): Promise<ProductionOrderPage> {
  const filter: OrderListFilter = {
    status: query.status,
    archived: query.archived,
  };
  const page = await orderRepo.list(tenantId, filter, query.page, query.limit);
  return { items: page.items.map(toPublicProductionOrder), total: page.total };
}

export async function getProductionOrder(
  tenantId: string,
  id: string,
): Promise<PublicProductionOrder> {
  const order = await orderRepo.findById(tenantId, id);
  if (order === null) {
    throw new NotFoundError();
  }
  return toPublicProductionOrder(order);
}

export async function updateProductionOrder(
  tenantId: string,
  id: string,
  input: PatchProductionOrderInput,
): Promise<PublicProductionOrder> {
  const current = await orderRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }

  const requested = Object.keys(input).filter(
    (key) => BUSINESS_FIELDS.has(key) && (input as Record<string, unknown>)[key] !== undefined,
  );
  if (!isEditable(current.status) && requested.length > 0) {
    throw new ConflictError('Only draft documents can be edited');
  }

  const set: Record<string, unknown> = {};

  if (input.productId !== undefined) {
    await assertProductActive(tenantId, input.productId);
    // Las líneas son inmutables, pero el nuevo producto terminado no puede
    // ser componente de su propio plan (auto-referencia).
    const check = validateComponentLines(input.productId, current.lines);
    if (!check.valid) {
      throw new ValidationError('Invalid component lines', { issues: check.issues });
    }
    set.productId = input.productId;
  }
  if (input.quantity !== undefined) {
    set.quantity = input.quantity;
  }
  if (input.warehouseId !== undefined) {
    await assertWarehouseActive(tenantId, input.warehouseId);
    set.warehouseId = input.warehouseId;
  }
  if (input.notes !== undefined) {
    set.notes = input.notes === null ? null : input.notes.trim();
  }

  if (input.status !== undefined) {
    if (input.status === current.status) {
      throw new ConflictError('Status is already the requested one');
    }
    if (!canProductionTransition(current.status, input.status)) {
      throw new ConflictError('Invalid status transition');
    }
    if (input.status === 'completed') {
      // Pre-chequeo de saldo para TODOS los componentes antes de escribir
      // nada: orden insuficiente → 422 sin estado ni movimientos parciales.
      // Usa los valores EFECTIVOS (el mismo PATCH puede cambiar cantidad y
      // almacén junto con el estado).
      const warehouseId = (set.warehouseId as string | undefined) ?? current.warehouseId;
      const units = (set.quantity as number | undefined) ?? current.quantity;
      const requirements = computeComponentRequirements(current.lines, units);
      for (const requirement of requirements) {
        const available = await availableBalance(tenantId, requirement.productId, warehouseId);
        if (available < requirement.quantity) {
          throw new DomainError('Insufficient stock', {
            productId: requirement.productId,
            warehouseId,
            available,
            required: requirement.quantity,
          });
        }
      }
    }
    set.status = input.status;
  }

  if (input.archived !== undefined) {
    if (input.archived && !canArchive(current.archived)) {
      throw new ConflictError('Production order is already archived');
    }
    if (!input.archived && !canRestore(current.archived)) {
      throw new ConflictError('Production order is not archived');
    }
    set.archived = input.archived;
  }

  if (Object.keys(set).length === 0) {
    throw new ValidationError('No valid fields to update');
  }
  const updated = await orderRepo.update(tenantId, id, set);
  if (updated === null) {
    throw new NotFoundError();
  }

  // `completed` confirmado → consumir componentes (−) y producir (+).
  if (set.status === 'completed') {
    const requirements = computeComponentRequirements(updated.lines, updated.quantity);
    for (const requirement of requirements) {
      await recordMovement({
        tenantId,
        productId: requirement.productId,
        warehouseId: updated.warehouseId,
        type: 'production_out',
        delta: -requirement.quantity,
        sourceType: 'production.order',
        sourceId: updated.id,
        reason: `Production order ${updated.number}`,
      });
    }
    await recordMovement({
      tenantId,
      productId: updated.productId,
      warehouseId: updated.warehouseId,
      type: 'production_in',
      delta: updated.quantity,
      sourceType: 'production.order',
      sourceId: updated.id,
      reason: `Production order ${updated.number}`,
    });
  }
  return toPublicProductionOrder(updated);
}

/**
 * DELETE NO está publicado para órdenes (el catálogo no define
 * `production.order:delete`): se CANCELAN (`PATCH {status:'cancelled'}`) o se
 * archivan (`PATCH {archived}`) con `production.order:update`. Implementación
 * del contrato de la fábrica CRUD.
 */
export async function archiveProductionOrder(
  tenantId: string,
  id: string,
): Promise<PublicProductionOrder> {
  const current = await orderRepo.findById(tenantId, id);
  if (current === null) {
    throw new NotFoundError();
  }
  if (!canArchive(current.archived)) {
    throw new ConflictError('Production order is already archived');
  }
  const archived = await orderRepo.update(tenantId, id, { archived: true });
  if (archived === null) {
    throw new NotFoundError();
  }
  return toPublicProductionOrder(archived);
}

/** Re-export del tipo para la capa de rutas. */
export type { ProductionOrder };
