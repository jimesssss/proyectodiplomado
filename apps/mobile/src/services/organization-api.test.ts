import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { extra: { apiBaseUrl: 'https://erp-sc-api.onrender.com/api/v1' } },
  },
}));

import { useAuthStore } from '../stores/authStore';
import {
  createPrimaryBranch,
  createPrimaryWarehouse,
  ensurePrimaryCompany,
  ensurePrimaryOrganization,
  listBranches,
  listCompanies,
  listOrganizations,
  listOrganizationsForIdDiagnostics,
  listWarehouses,
  OrganizationApiError,
} from './organization-api';

const ERP_SC_ORGANIZATION_ID = '666666666666666666666666';

function jsonResponse(
  data: unknown,
  options: { readonly status?: number; readonly total?: number } = {}
): Response {
  const status = options.status ?? 200;
  const success = status < 400;
  return new Response(
    JSON.stringify({
      success,
      data: success ? data : null,
      meta: { ...(options.total !== undefined ? { total: options.total } : {}) },
      error: success
        ? null
        : { code: status === 403 ? 'FORBIDDEN' : 'CONFLICT', message: 'Rejected' },
    }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

const branch = {
  id: '111111111111111111111111',
  kind: 'branch',
  parentId: '222222222222222222222222',
  code: 'SUC-001',
  name: 'Sucursal principal',
  status: 'active',
};

const warehouse = {
  id: '333333333333333333333333',
  kind: 'warehouse',
  parentId: '111111111111111111111111',
  code: 'ALM-001',
  name: 'Almacén principal',
  status: 'active',
};

const company = {
  id: '222222222222222222222222',
  kind: 'company',
  parentId: ERP_SC_ORGANIZATION_ID,
  code: 'EMP-001',
  name: 'ERP-SC',
  status: 'active',
};

const organization = {
  id: ERP_SC_ORGANIZATION_ID,
  kind: 'organization',
  parentId: null,
  code: 'ERP-SC',
  name: 'ERP-SC',
  status: 'active',
};

const primaryCompany = {
  id: '666666666666666666666666',
  kind: 'company',
  parentId: ERP_SC_ORGANIZATION_ID,
  code: 'ERP-SC',
  name: 'ERP-SC',
  status: 'active',
};

describe('organization API warehouse provisioning', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      accessToken: 'test-access-token',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists branches and warehouses through the existing organization routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([branch], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([warehouse], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listBranches()).resolves.toEqual([branch]);
    await expect(listWarehouses()).resolves.toEqual([warehouse]);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://erp-sc-api.onrender.com/api/v1/branches?page=1&limit=100',
      'https://erp-sc-api.onrender.com/api/v1/warehouses?page=1&limit=100',
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer test-access-token' },
    });
  });

  it('lists organizations through the existing organization route', async () => {
    const validOrganization = {
      ...organization,
      id: '888888888888888888888888',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse([validOrganization], { total: 1 }))
    );

    await expect(listOrganizations()).resolves.toEqual([validOrganization]);
  });

  it('sends the access token from authStore as a Bearer token without logging it', async () => {
    const validOrganization = {
      ...organization,
      id: '888888888888888888888888',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([validOrganization], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await listOrganizations();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
    });
  });

  it('returns the exact organization ID from the API for temporary diagnostics', async () => {
    const responseOrganization = {
      ...organization,
      id: '6ac3ec2dcf96e2ccb994197',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([responseOrganization], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const results = await listOrganizationsForIdDiagnostics();

    expect(results[0]?.id).toBe('6ac3ec2dcf96e2ccb994197');
    expect(results[0]?.id.length).toBe(23);
    expect(typeof results[0]?.id).toBe('string');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('does not create a second organization when an active one already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse([organization], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryOrganization()).resolves.toEqual({
      organization,
      created: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('creates ERP-SC only after confirming none active, then verifies it with GET', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(organization, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([organization], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryOrganization()).resolves.toEqual({
      organization,
      created: true,
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/organizations?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/organizations', 'POST'],
      ['https://erp-sc-api.onrender.com/api/v1/organizations?page=1&limit=100', 'GET'],
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ code: 'ERP-SC', name: 'ERP-SC' }),
    });
    expect(JSON.stringify(fetchMock.mock.calls[1]?.[1]?.body)).not.toContain('tenantId');
    expect(JSON.stringify(fetchMock.mock.calls[1]?.[1]?.body)).not.toContain('status');
  });

  it('rejects organization data without a valid Mongo ID during verification', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ ...organization, id: 'bad-id' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryOrganization()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('lists real companies for the branch parent selector', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([company], { total: 1 })));

    await expect(listCompanies()).resolves.toEqual([company]);
  });

  it('does not create a second company under the confirmed active organization', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([organization], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([primaryCompany], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryCompany(ERP_SC_ORGANIZATION_ID)).resolves.toEqual({
      company: primaryCompany,
      created: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('creates ERP-SC under the confirmed organization and verifies it by GET', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([organization], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(primaryCompany, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([primaryCompany], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryCompany(ERP_SC_ORGANIZATION_ID)).resolves.toEqual({
      company: primaryCompany,
      created: true,
    });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/organizations?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/companies?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/companies', 'POST'],
      ['https://erp-sc-api.onrender.com/api/v1/companies?page=1&limit=100', 'GET'],
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        code: 'ERP-SC',
        name: 'ERP-SC',
        parentId: ERP_SC_ORGANIZATION_ID,
      }),
    });
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).not.toContain('tenantId');
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).not.toContain('status');
  });

  it('does not create a company when the confirmed organization is missing or inactive', async () => {
    const archivedOrganization = { ...organization, status: 'archived' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([archivedOrganization], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryCompany(ERP_SC_ORGANIZATION_ID)).rejects.toMatchObject({
      code: 'ACTIVE_ORGANIZATION_REQUIRED',
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate an ERP-SC company code used by another organization', async () => {
    const otherOrganizationCompany = {
      ...primaryCompany,
      parentId: '777777777777777777777777',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([organization], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([otherOrganizationCompany], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryCompany(ERP_SC_ORGANIZATION_ID)).rejects.toMatchObject({
      code: 'COMPANY_CODE_ALREADY_USED',
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects verification if the created company is not active under the confirmed organization', async () => {
    const wrongParentCompany = {
      ...primaryCompany,
      parentId: '777777777777777777777777',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([organization], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(primaryCompany, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([wrongParentCompany], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensurePrimaryCompany(ERP_SC_ORGANIZATION_ID)).rejects.toMatchObject({
      code: 'COMPANY_VERIFICATION_FAILED',
    });
  });

  it('creates SUC-001 under the selected active company and verifies the real branch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([company], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(branch, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([branch], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryBranch(company.id)).resolves.toEqual(branch);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/companies?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/branches?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/branches', 'POST'],
      ['https://erp-sc-api.onrender.com/api/v1/branches?page=1&limit=100', 'GET'],
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        code: 'SUC-001',
        name: 'Sucursal principal',
        parentId: company.id,
      }),
    });
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).not.toContain('tenantId');
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).not.toContain('status');
  });

  it('does not create a branch directly under the tenant when there is no active company', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryBranch('555555555555555555555555')).rejects.toMatchObject({
      code: 'ACTIVE_COMPANY_REQUIRED',
      status: 404,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires org:write to create branches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([company], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryBranch(company.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message:
        'No tienes permisos para esta operación. Se requiere org:write para crear o org:read para consultar.',
    });
  });

  it('creates ALM-001 under the selected branch and verifies active state by GET', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([branch], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(warehouse, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse([warehouse], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryWarehouse(branch.id)).resolves.toEqual(warehouse);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method ?? 'GET'])).toEqual([
      ['https://erp-sc-api.onrender.com/api/v1/branches?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/warehouses?page=1&limit=100', 'GET'],
      ['https://erp-sc-api.onrender.com/api/v1/warehouses', 'POST'],
      ['https://erp-sc-api.onrender.com/api/v1/warehouses?page=1&limit=100', 'GET'],
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        code: 'ALM-001',
        name: 'Almacén principal',
        parentId: branch.id,
      }),
    });
    expect(JSON.stringify(fetchMock.mock.calls[2]?.[1]?.body)).not.toContain('tenantId');
  });

  it('surfaces missing org:write permission from the API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([branch], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }))
      .mockResolvedValueOnce(jsonResponse(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryWarehouse(branch.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message:
        'No tienes permisos para esta operación. Se requiere org:write para crear o org:read para consultar.',
    } satisfies Partial<OrganizationApiError>);
  });

  it('does not create duplicates when an active warehouse already exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([branch], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([warehouse], { total: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryWarehouse(branch.id)).rejects.toMatchObject({
      code: 'ACTIVE_WAREHOUSE_ALREADY_EXISTS',
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not create a warehouse under a branch that is not active in this tenant', async () => {
    const archivedBranch = { ...branch, status: 'archived' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([archivedBranch], { total: 1 }))
      .mockResolvedValueOnce(jsonResponse([], { total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPrimaryWarehouse(branch.id)).rejects.toMatchObject({
      code: 'ACTIVE_BRANCH_REQUIRED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
