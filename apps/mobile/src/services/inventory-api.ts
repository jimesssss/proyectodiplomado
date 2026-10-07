import Constants from 'expo-constants';
import { apiRequest, ApiError } from './api-client';

const PAGE_SIZE = 100;
function getApiBaseUrl(): string { return String(Constants.expoConfig?.extra?.apiBaseUrl ?? '').replace(/\/+$/, ''); }
function logRequestDiagnostic(diagnostic: Readonly<Record<string, unknown>>): void { console.error('inventory API request failed', diagnostic); }

export interface ApiProduct {
  readonly imageUrl?: string | null;
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly unit: string;
  readonly cost: number | null;
  readonly price: number | null;
  readonly minStock: number | null;
  readonly archived: boolean;
}

export interface ApiStockBalance {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly qty: number;
}

export interface ApiWarehouse {
  readonly id: string;
  readonly kind: 'warehouse';
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
}

export type ApiMovementType =
  | 'receipt'
  | 'manual_in'
  | 'manual_out'
  | 'transfer_in'
  | 'transfer_out'
  | 'count_adjustment'
  | 'production_in'
  | 'production_out';

export interface ApiStockMovement {
  readonly id: string;
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: ApiMovementType;
  readonly qty: number;
  readonly balanceAfter: number;
  readonly sourceType: string | null;
  readonly sourceId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface CreateApiMovement {
  readonly productId: string;
  readonly warehouseId: string;
  readonly type: 'manual_in' | 'manual_out';
  readonly quantity: number;
  readonly reason: string;
}

interface ApiMeta {
  readonly total?: number;
  readonly requestId?: string;
}

interface ParsedResponse {
  readonly data: unknown;
  readonly meta: ApiMeta;
}

export class InventoryApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null = null,
    readonly diagnostic: {
      readonly method?: string;
      readonly url?: string;
      readonly backendMessage?: string;
      readonly responseBody?: unknown;
    } = {},
    readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'InventoryApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMovementType(value: unknown): value is ApiMovementType {
  return (
    value === 'receipt' ||
    value === 'manual_in' ||
    value === 'manual_out' ||
    value === 'transfer_in' ||
    value === 'transfer_out' ||
    value === 'count_adjustment' ||
    value === 'production_in' ||
    value === 'production_out'
  );
}

async function request(
  path: string,
  options: { readonly method?: string; readonly body?: unknown } = {},
): Promise<ParsedResponse> {
  try {
    const result = await apiRequest<unknown>(path, options);
    return { data: result.data, meta: result.meta };
  } catch (error) {
    if (error instanceof ApiError) {
      const diagnostic=error.diagnostic;
      // eslint-disable-next-line no-console -- sanitized status only; never authorization headers or request bodies
      console.info('[ERP-SC inventory request]', { method:options.method??'GET',url:diagnostic.url??'',status:error.status,code:error.code,
        backendMessage:diagnostic.backendMessage??null,responseBody:diagnostic.responseBody??null });
      throw new InventoryApiError(error.code,error.code==='NETWORK_ERROR'?'No se pudo conectar con ERP-SC. Comprueba tu conexión e inténtalo nuevamente.':error.message,error.status,diagnostic);
    }
    throw error;
  }
}

function parseProduct(value: unknown): ApiProduct {
  if (
    !isRecord(value) ||
    !(value.imageUrl === undefined || value.imageUrl === null || typeof value.imageUrl === 'string') ||
    typeof value.id !== 'string' ||
    typeof value.code !== 'string' ||
    typeof value.name !== 'string' ||
    !(typeof value.description === 'string' || value.description === null) ||
    typeof value.unit !== 'string' ||
    !(typeof value.cost === 'number' || value.cost === null) ||
    !(typeof value.price === 'number' || value.price === null) ||
    !(typeof value.minStock === 'number' || value.minStock === null) ||
    typeof value.archived !== 'boolean'
  ) {
    throw new InventoryApiError(
      'INVALID_RESPONSE',
      'El servidor devolvió un producto con formato no válido.',
    );
  }
  return {
    id: value.id,
    imageUrl: (value.imageUrl as string | null | undefined) ?? null,
    code: value.code,
    name: value.name,
    description: value.description,
    unit: value.unit,
    cost: value.cost,
    price: value.price,
    minStock: value.minStock,
    archived: value.archived,
  };
}

function parseStockBalance(value: unknown): ApiStockBalance {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.productId !== 'string' ||
    typeof value.warehouseId !== 'string' ||
    typeof value.qty !== 'number'
  ) {
    throw new InventoryApiError(
      'INVALID_RESPONSE',
      'El servidor devolvió un saldo de inventario con formato no válido.',
    );
  }
  return {
    id: value.id,
    productId: value.productId,
    warehouseId: value.warehouseId,
    qty: value.qty,
  };
}

function parseWarehouse(value: unknown): ApiWarehouse {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.kind !== 'warehouse' ||
    !(typeof value.parentId === 'string' || value.parentId === null) ||
    typeof value.code !== 'string' ||
    typeof value.name !== 'string' ||
    (value.status !== 'active' && value.status !== 'archived')
  ) {
    throw new InventoryApiError(
      'INVALID_RESPONSE',
      'El servidor devolvió un almacén con formato no válido.',
    );
  }
  return {
    id: value.id,
    kind: value.kind,
    parentId: value.parentId,
    code: value.code,
    name: value.name,
    status: value.status,
  };
}

function parseMovement(value: unknown): ApiStockMovement {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.productId !== 'string' ||
    typeof value.warehouseId !== 'string' ||
    !isMovementType(value.type) ||
    typeof value.qty !== 'number' ||
    typeof value.balanceAfter !== 'number' ||
    !(typeof value.sourceType === 'string' || value.sourceType === null) ||
    !(typeof value.sourceId === 'string' || value.sourceId === null) ||
    !(typeof value.reason === 'string' || value.reason === null) ||
    typeof value.createdAt !== 'string'
  ) {
    throw new InventoryApiError(
      'INVALID_RESPONSE',
      'El servidor devolvió un movimiento con formato no válido.',
    );
  }
  return {
    id: value.id,
    productId: value.productId,
    warehouseId: value.warehouseId,
    type: value.type,
    qty: value.qty,
    balanceAfter: value.balanceAfter,
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    reason: value.reason,
    createdAt: value.createdAt,
  };
}

async function listAll<T>(
  path: string,
  parse: (value: unknown) => T,
): Promise<readonly T[]> {
  const items: T[] = [];
  let page = 1;
  let total: number | undefined;

  do {
    const separator = path.includes('?') ? '&' : '?';
    const result = await request(`${path}${separator}page=${page}&limit=${PAGE_SIZE}`);
    if (!Array.isArray(result.data)) {
      throw new InventoryApiError(
        'INVALID_RESPONSE',
        'El servidor devolvió una lista con formato no válido.',
      );
    }
    items.push(...result.data.map(parse));
    total = result.meta.total;
    page += 1;

    if (page > 10_000) {
      throw new InventoryApiError(
        'INVALID_RESPONSE',
        'La lista del servidor excede el límite de paginación permitido.',
      );
    }
  } while (
    total !== undefined
      ? items.length < total
      : items.length > 0 && items.length % PAGE_SIZE === 0
  );

  return items;
}

export async function listProducts(): Promise<readonly ApiProduct[]> {
  return listAll('/inventory/products?archived=false', parseProduct);
}

export async function getProduct(id: string): Promise<ApiProduct> {
  const result = await request(`/inventory/products/${encodeURIComponent(id)}`);
  return parseProduct(result.data);
}

export async function createProduct(input: {
  readonly imageUrl?: string | null;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly unit?: string;
  readonly cost?: number;
  readonly price?: number;
  readonly minStock?: number;
}): Promise<ApiProduct> {
  const result = await request('/inventory/products', { method: 'POST', body: input });
  return parseProduct(result.data);
}

export async function updateProduct(
  id: string,
  input: {
    readonly imageUrl?: string | null;
    readonly name?: string;
    readonly description?: string | null;
    readonly unit?: string;
    readonly cost?: number | null;
    readonly price?: number | null;
    readonly minStock?: number | null;
    readonly archived?: boolean;
  },
): Promise<ApiProduct> {
  const result = await request(`/inventory/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
  });
  return parseProduct(result.data);
}

export async function archiveProduct(id: string): Promise<ApiProduct> {
  const result = await request(`/inventory/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return parseProduct(result.data);
}

export async function listStock(): Promise<readonly ApiStockBalance[]> {
  return listAll('/inventory/stock', parseStockBalance);
}

export async function listWarehouses(): Promise<readonly ApiWarehouse[]> {
  return listAll('/warehouses', parseWarehouse);
}

export async function listMovements(): Promise<readonly ApiStockMovement[]> {
  return listAll('/inventory/movements', parseMovement);
}

export async function getMovement(id: string): Promise<ApiStockMovement> {
  const result = await request(`/inventory/movements/${encodeURIComponent(id)}`);
  return parseMovement(result.data);
}

export async function createMovement(input: CreateApiMovement): Promise<ApiStockMovement> {
  const result = await request('/inventory/movements', { method: 'POST', body: input });
  return parseMovement(result.data);
}

export async function createInitialStock(
  productId: string,
  quantity: number,
): Promise<number> {
  const warehouses = await listWarehouses();
  // The API orders warehouses newest-first; use the first active warehouse consistently.
  const warehouse = warehouses.find((candidate) => candidate.status === 'active');
  if (warehouse === undefined) {
    logRequestDiagnostic({
      method: 'GET',
      url: `${getApiBaseUrl()}/warehouses`,
      status: 200,
      code: 'NO_ACTIVE_WAREHOUSE',
      backendMessage: 'No hay un almacén activo disponible.',
      responseBody: {
        success: true,
        data: {
          type: 'array',
          length: warehouses.length,
          activeCount: 0,
        },
      },
    });
    throw new InventoryApiError(
      'NO_ACTIVE_WAREHOUSE',
      'No hay un almacén activo disponible para registrar la existencia inicial.',
    );
  }

  try {
    await createMovement({
      productId,
      warehouseId: warehouse.id,
      type: 'manual_in',
      quantity,
      reason: 'Existencia inicial del producto',
    });
  } catch (movementError) {
    let stockCheckError: unknown;
    try {
      const balances = await listStock();
      const actualQuantity = balances.reduce(
        (total, balance) => total + (balance.productId === productId ? balance.qty : 0),
        0,
      );
      if (Math.abs(actualQuantity - quantity) <= Number.EPSILON * Math.max(1, Math.abs(quantity)) * 4) {
        return actualQuantity;
      }
    } catch (error) {
      stockCheckError = error;
    }

    const cause = movementError instanceof Error ? movementError : undefined;
    throw new InventoryApiError(
      'INITIAL_STOCK_MOVEMENT_FAILED',
      'No se pudo registrar la existencia inicial.',
      movementError instanceof InventoryApiError ? movementError.status : null,
      movementError instanceof InventoryApiError
        ? movementError.diagnostic
        : { method: 'POST', url: `${getApiBaseUrl()}/inventory/movements` },
      stockCheckError === undefined
        ? cause
        : { movementError: cause, stockCheckError },
    );
  }

  const balances = await listStock();
  const actualQuantity = balances.reduce(
    (total, balance) => total + (balance.productId === productId ? balance.qty : 0),
    0,
  );
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quantity)) * 4;
  if (Math.abs(actualQuantity - quantity) > tolerance) {
    throw new InventoryApiError(
      'STOCK_VERIFICATION_FAILED',
      `El movimiento se creó, pero el saldo confirmado (${actualQuantity}) no coincide con la existencia solicitada (${quantity}).`,
    );
  }
  return actualQuantity;
}
