import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { extra: { apiBaseUrl: 'https://erp-sc-api.onrender.com/api/v1' } },
  },
}));

import { useAuthStore } from '../stores/authStore';
import {
  archiveProduct,
  createProduct,
  createInitialStock,
  createMovement,
  getMovement,
  getProduct,
  InventoryApiError,
  listMovements,
  listProducts,
  listStock,
  updateProduct,
} from './inventory-api';

function product(id: string) {
  return {
    id,
    code: `SKU-${id}`,
    name: `Producto ${id}`,
    description: null,
    unit: 'Pza',
    cost: 10,
    price: 20,
    minStock: 2,
    archived: false,
  };
}

function jsonResponse(
  data: unknown,
  options: { readonly status?: number; readonly meta?: Record<string, unknown> } = {},
): Response {
  const status = options.status ?? 200;
  return new Response(
    JSON.stringify(
      status >= 400
        ? {
            success: false,
            data: null,
            meta: { requestId: 'test-request' },
            error: { code: 'FORBIDDEN', message: 'Forbidden' },
          }
        : {
            success: true,
            data,
            meta: { requestId: 'test-request', ...(options.meta ?? {}) },
            error: null,
          },
    ),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('inventory API service', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: 'access-token-for-test',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sends the current access token and follows API pagination', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([product('1')], { meta: { page: 1, limit: 100, total: 2 } }))
      .mockResolvedValueOnce(jsonResponse([product('2')], { meta: { page: 2, limit: 100, total: 2 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProducts()).resolves.toMatchObject([
      { id: '1', code: 'SKU-1' },
      { id: '2', code: 'SKU-2' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://erp-sc-api.onrender.com/api/v1/inventory/products?archived=false&page=1&limit=100',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer access-token-for-test' },
    });
  });

  it('does not send unsupported product fields to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(product('1'), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await createProduct({
      code: 'SKU-1',
      name: 'Producto',
      description: '',
      unit: 'Pza',
      cost: 10,
      price: 20,
      minStock: 2,
    });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token-for-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: 'SKU-1',
        name: 'Producto',
        description: '',
        unit: 'Pza',
        cost: 10,
        price: 20,
        minStock: 2,
      }),
    });
  });

  it('uses the existing product detail, update, and archive routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(product('1')))
      .mockResolvedValueOnce(jsonResponse(product('1')))
      .mockResolvedValueOnce(jsonResponse({ ...product('1'), archived: true }));
    vi.stubGlobal('fetch', fetchMock);

    await getProduct('product-id');
    await updateProduct('product-id', { name: 'Nombre actualizado' });
    await archiveProduct('product-id');

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/inventory/products/product-id', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/products/product-id', 'PATCH'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/products/product-id', 'DELETE'],
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({ name: 'Nombre actualizado' }),
    });
  });

  it('uses the existing stock and movement routes and their response contracts', async () => {
    const balance = {
      id: 'balance-id',
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      qty: 8,
    };
    const movement = {
      id: 'movement-id',
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      type: 'manual_in',
      qty: 3,
      balanceAfter: 8,
      sourceType: null,
      sourceId: null,
      reason: 'Recepción manual',
      createdAt: '2026-10-05T12:00:00.000Z',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([balance], { meta: { page: 1, limit: 100, total: 1 } }))
      .mockResolvedValueOnce(jsonResponse([movement], { meta: { page: 1, limit: 100, total: 1 } }))
      .mockResolvedValueOnce(jsonResponse(movement))
      .mockResolvedValueOnce(jsonResponse(movement, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listStock()).resolves.toEqual([balance]);
    await expect(listMovements()).resolves.toMatchObject([{ id: 'movement-id' }]);
    await expect(getMovement('movement-id')).resolves.toMatchObject({ id: 'movement-id' });
    await createMovement({
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      type: 'manual_in',
      quantity: 3,
      reason: 'Recepción manual',
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/inventory/stock?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/movements?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/movements/movement-id', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/movements', 'POST'],
    ]);
  });

  it('creates and confirms initial stock in an active warehouse', async () => {
    const warehouses = [
      {
        id: 'archived-warehouse',
        kind: 'warehouse',
        parentId: 'branch-id',
        code: 'OLD',
        name: 'Almacén archivado',
        status: 'archived',
      },
      {
        id: 'warehouse-id',
        kind: 'warehouse',
        parentId: 'branch-id',
        code: 'MAIN',
        name: 'Almacén principal',
        status: 'active',
      },
    ];
    const movement = {
      id: 'movement-id',
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      type: 'manual_in',
      qty: 25,
      balanceAfter: 25,
      sourceType: null,
      sourceId: null,
      reason: 'Existencia inicial del producto',
      createdAt: '2026-10-05T12:00:00.000Z',
    };
    const balance = {
      id: 'balance-id',
      productId: 'product-id',
      warehouseId: 'warehouse-id',
      qty: 25,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(warehouses, { meta: { page: 1, limit: 100, total: 2 } }))
      .mockResolvedValueOnce(jsonResponse(movement, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([balance], { meta: { page: 1, limit: 100, total: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createInitialStock('product-id', 25)).resolves.toBe(25);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/warehouses?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/movements', 'POST'],
      ['https://erp-sc-api.onrender.com/api/v1/inventory/stock?page=1&limit=100', 'GET'],
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify({
        productId: 'product-id',
        warehouseId: 'warehouse-id',
        type: 'manual_in',
        quantity: 25,
        reason: 'Existencia inicial del producto',
      }),
    });
  });

  it('does not create a movement when no active warehouse exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        [
          {
            id: 'archived-warehouse',
            kind: 'warehouse',
            parentId: 'branch-id',
            code: 'OLD',
            name: 'Almacén archivado',
            status: 'archived',
          },
        ],
        { meta: { page: 1, limit: 100, total: 1 } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createInitialStock('product-id', 25)).rejects.toMatchObject({
      code: 'NO_ACTIVE_WAREHOUSE',
      message: expect.stringContaining('No hay un almacén activo'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces movement creation failures without claiming stock was recorded', async () => {
    const warehouse = {
      id: 'warehouse-id',
      kind: 'warehouse',
      parentId: 'branch-id',
      code: 'MAIN',
      name: 'Almacén principal',
      status: 'active',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([warehouse], { meta: { page: 1, limit: 100, total: 1 } }))
      .mockResolvedValueOnce(jsonResponse(null, { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse([], { meta: { page: 1, limit: 100, total: 0 } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createInitialStock('product-id', 25)).rejects.toMatchObject({
      code: 'INITIAL_STOCK_MOVEMENT_FAILED',
      status: 500,
      diagnostic: {
        method: 'POST',
        url: 'https://erp-sc-api.onrender.com/api/v1/inventory/movements',
        backendMessage: 'Forbidden',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      'https://erp-sc-api.onrender.com/api/v1/inventory/stock?page=1&limit=100',
    );
  });

  it('accepts the persisted balance when the movement response fails after commit', async () => {
    const warehouse = {
      id: 'warehouse-id',
      kind: 'warehouse',
      parentId: 'branch-id',
      code: 'MAIN',
      name: 'Almacén principal',
      status: 'active',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([warehouse], { meta: { page: 1, limit: 100, total: 1 } }))
      .mockResolvedValueOnce(jsonResponse(null, { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse(
          [{ id: 'balance-id', productId: 'product-id', warehouseId: 'warehouse-id', qty: 25 }],
          { meta: { page: 1, limit: 100, total: 1 } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createInitialStock('product-id', 25)).resolves.toBe(25);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('logs request failures with endpoint and sanitized envelope, never authorization headers', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProducts()).rejects.toMatchObject({ status: 500 });

    expect(logSpy).toHaveBeenCalledWith(
      '[ERP-SC inventory request]',
      expect.objectContaining({
        method: 'GET',
        url: 'https://erp-sc-api.onrender.com/api/v1/inventory/products?archived=false&page=1&limit=100',
        status: 500,
        code: 'FORBIDDEN',
        backendMessage: 'Forbidden',
        responseBody: {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Forbidden' },
          meta: { requestId: 'test-request' },
        },
      }),
    );
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('access-token-for-test');
  });

  it('maps permission failures to an explicit 403 error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProducts()).rejects.toMatchObject({
      status: 403,
      message: 'No tienes permisos para realizar esta operación.',
    });
  });

  it.each([
    [400, 'La solicitud no cumple el formato esperado. Forbidden'],
    [404, 'No se encontró el registro solicitado.'],
    [409, 'La operación entra en conflicto con los datos actuales. Forbidden'],
    [422, 'Los datos no se pueden procesar. Forbidden'],
    [500, 'El servidor tuvo un problema. Inténtalo nuevamente más tarde.'],
  ])('maps HTTP %i to a user-facing API error', async (status, message) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, { status }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await listProducts().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(InventoryApiError);
    if (error instanceof InventoryApiError) {
      expect(error.status).toBe(status);
      expect(error.message).toContain(message);
    }
  });

  it('reports a connection failure explicitly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(listProducts()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'No se pudo conectar con ERP-SC. Comprueba tu conexión e inténtalo nuevamente.',
    });
  });

  it('clears the local session when the backend returns 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          meta: { requestId: 'test-request' },
          error: { code: 'UNAUTHENTICATED', message: 'Unauthenticated' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(listProducts()).rejects.toBeInstanceOf(InventoryApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('reports a timeout instead of disguising it as a network failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pendingRequest = listProducts();
    const timeoutAssertion = expect(pendingRequest).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await timeoutAssertion;
  });
});
