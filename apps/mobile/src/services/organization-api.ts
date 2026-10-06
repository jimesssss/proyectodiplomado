import { apiRequest, ApiError } from './api-client';

const PAGE_SIZE = 100;
export const ERP_SC_ORGANIZATION_ID = '6ac3ec2dcf96e2ccb994197';

export interface ApiOrgUnit {
  readonly id: string;
  readonly kind: 'organization' | 'company' | 'branch' | 'warehouse';
  readonly parentId: string | null;
  readonly code: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
}

export class OrganizationApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
    this.name = 'OrganizationApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request(
  path: string,
  options: {
    readonly method?: 'GET' | 'POST';
    readonly body?: Readonly<Record<string, string>>;
  } = {}
): Promise<{ readonly data: unknown; readonly total?: number }> {
  try {
    const result = await apiRequest<unknown>(path, options);
    return { data: result.data, ...(result.meta.total !== undefined ? { total: result.meta.total } : {}) };
  } catch (error) {
    if (error instanceof ApiError) throw new OrganizationApiError(error.code,error.status===403?'No tienes permisos para esta operación. Se requiere org:write para crear o org:read para consultar.':error.message,error.status);
    throw error;
  }
}

function parseOrgUnit(
  value: unknown,
  expectedKind: ApiOrgUnit['kind'],
  allowNonObjectId = false
): ApiOrgUnit {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (!allowNonObjectId && !/^[0-9a-fA-F]{24}$/.test(value.id)) ||
    value.kind !== expectedKind ||
    !(
      value.parentId === null ||
      (typeof value.parentId === 'string' && /^[0-9a-fA-F]{24}$/.test(value.parentId))
    ) ||
    typeof value.code !== 'string' ||
    typeof value.name !== 'string' ||
    (value.status !== 'active' && value.status !== 'archived')
  ) {
    throw new OrganizationApiError(
      'INVALID_RESPONSE',
      'El servidor devolvió una unidad organizativa con formato no válido.'
    );
  }
  return {
    id: value.id,
    kind: expectedKind,
    parentId: value.parentId,
    code: value.code,
    name: value.name,
    status: value.status,
  };
}

async function listOrgUnits(
  kind: ApiOrgUnit['kind'],
  allowNonObjectId = false
): Promise<readonly ApiOrgUnit[]> {
  const items: ApiOrgUnit[] = [];
  let page = 1;
  let total: number | undefined;
  do {
    const path =
      kind === 'organization'
        ? 'organizations'
        : kind === 'company'
          ? 'companies'
          : kind === 'branch'
            ? 'branches'
            : 'warehouses';
    const result = await request(`/${path}?page=${page}&limit=${PAGE_SIZE}`);
    if (!Array.isArray(result.data)) {
      throw new OrganizationApiError(
        'INVALID_RESPONSE',
        'El servidor devolvió una lista organizativa con formato no válido.'
      );
    }
    items.push(...result.data.map((unit: unknown) => parseOrgUnit(unit, kind, allowNonObjectId)));
    total = result.total;
    page += 1;
    if (page > 10_000) {
      throw new OrganizationApiError(
        'INVALID_RESPONSE',
        'La lista del servidor excede el límite de paginación permitido.'
      );
    }
  } while (
    total !== undefined ? items.length < total : items.length > 0 && items.length % PAGE_SIZE === 0
  );
  return items;
}

export async function listOrganizations(): Promise<readonly ApiOrgUnit[]> {
  return listOrgUnits('organization');
}

export async function listOrganizationsForIdDiagnostics(): Promise<readonly ApiOrgUnit[]> {
  return listOrgUnits('organization', true);
}

export async function listBranches(): Promise<readonly ApiOrgUnit[]> {
  return listOrgUnits('branch');
}

export async function listCompanies(): Promise<readonly ApiOrgUnit[]> {
  return listOrgUnits('company');
}

export async function listWarehouses(): Promise<readonly ApiOrgUnit[]> {
  return listOrgUnits('warehouse');
}

export async function createOrganization(input: {
  readonly code: string;
  readonly name: string;
}): Promise<ApiOrgUnit> {
  const result = await request('/organizations', {
    method: 'POST',
    body: input,
  });
  return parseOrgUnit(result.data, 'organization');
}

export async function createCompany(input: {
  readonly code: string;
  readonly name: string;
  readonly parentId: string;
}): Promise<ApiOrgUnit> {
  const result = await request('/companies', {
    method: 'POST',
    body: input,
  });
  return parseOrgUnit(result.data, 'company');
}

export async function ensurePrimaryCompany(organizationId: string): Promise<{
  readonly company: ApiOrgUnit;
  readonly created: boolean;
}> {
  if (!/^[0-9a-fA-F]{24}$/.test(organizationId)) {
    throw new OrganizationApiError(
      'INVALID_ORGANIZATION_ID',
      'La organización seleccionada no tiene un ID válido.'
    );
  }

  const [organizations, companies] = await Promise.all([listOrganizations(), listCompanies()]);
  const parentOrganization = organizations.find(
    (organization) => organization.id === organizationId && organization.status === 'active'
  );
  if (parentOrganization === undefined) {
    throw new OrganizationApiError(
      'ACTIVE_ORGANIZATION_REQUIRED',
      'La organización ERP-SC no está disponible o no está activa. Actualiza la lista e inténtalo de nuevo.',
      404
    );
  }

  const organizationCompanies = companies.filter(
    (company) => company.parentId === parentOrganization.id
  );
  const activeCompany = organizationCompanies.find((company) => company.status === 'active');
  if (activeCompany !== undefined) {
    return { company: activeCompany, created: false };
  }

  const primaryCodeOwner = companies.find((company) => company.code === 'ERP-SC');
  if (primaryCodeOwner !== undefined) {
    throw new OrganizationApiError(
      'COMPANY_CODE_ALREADY_USED',
      'El código ERP-SC ya está utilizado por otra empresa de este tenant y no se puede duplicar.',
      409
    );
  }

  const created = await createCompany({
    code: 'ERP-SC',
    name: 'ERP-SC',
    parentId: parentOrganization.id,
  });
  const refreshedCompanies = await listCompanies();
  const verified = refreshedCompanies.find((company) => company.id === created.id);
  if (
    verified === undefined ||
    verified.status !== 'active' ||
    verified.parentId !== parentOrganization.id ||
    verified.code !== 'ERP-SC' ||
    verified.name !== 'ERP-SC'
  ) {
    throw new OrganizationApiError(
      'COMPANY_VERIFICATION_FAILED',
      'La empresa se creó, pero no fue posible confirmar sus datos y su organización padre.'
    );
  }
  return { company: verified, created: true };
}

export async function ensurePrimaryOrganization(): Promise<{
  readonly organization: ApiOrgUnit;
  readonly created: boolean;
}> {
  const existingOrganizations = await listOrganizations();
  const activeOrganization = existingOrganizations.find(
    (organization) => organization.status === 'active'
  );
  if (activeOrganization !== undefined) {
    return { organization: activeOrganization, created: false };
  }

  const created = await createOrganization({
    code: 'ERP-SC',
    name: 'ERP-SC',
  });
  const organizations = await listOrganizations();
  const verified = organizations.find((organization) => organization.id === created.id);
  if (verified === undefined || verified.status !== 'active' || verified.parentId !== null) {
    throw new OrganizationApiError(
      'ORGANIZATION_VERIFICATION_FAILED',
      'La organización se creó, pero no fue posible confirmar que esté activa.'
    );
  }
  return { organization: verified, created: true };
}

export async function createBranch(input: {
  readonly code: string;
  readonly name: string;
  readonly parentId: string;
}): Promise<ApiOrgUnit> {
  const result = await request('/branches', {
    method: 'POST',
    body: input,
  });
  return parseOrgUnit(result.data, 'branch');
}

export async function createPrimaryBranch(parentId: string): Promise<ApiOrgUnit> {
  const [companies, existingBranches] = await Promise.all([listCompanies(), listBranches()]);
  if (!companies.some((company) => company.id === parentId && company.status === 'active')) {
    throw new OrganizationApiError(
      'ACTIVE_COMPANY_REQUIRED',
      'Selecciona una empresa activa para crear la sucursal.',
      404
    );
  }
  if (existingBranches.some((branch) => branch.status === 'active')) {
    throw new OrganizationApiError(
      'ACTIVE_BRANCH_ALREADY_EXISTS',
      'Ya existe una sucursal activa. Actualiza la lista y selecciona la sucursal existente.',
      409
    );
  }

  const created = await createBranch({
    code: 'SUC-001',
    name: 'Sucursal principal',
    parentId,
  });
  const branches = await listBranches();
  const verified = branches.find((branch) => branch.id === created.id);
  if (verified === undefined || verified.status !== 'active' || verified.parentId !== parentId) {
    throw new OrganizationApiError(
      'BRANCH_VERIFICATION_FAILED',
      'La sucursal se creó, pero no fue posible confirmar que esté activa bajo la empresa seleccionada.'
    );
  }
  return verified;
}

export async function createWarehouse(input: {
  readonly code: string;
  readonly name: string;
  readonly parentId: string;
}): Promise<ApiOrgUnit> {
  const result = await request('/warehouses', {
    method: 'POST',
    body: input,
  });
  return parseOrgUnit(result.data, 'warehouse');
}

export async function createPrimaryWarehouse(parentId: string): Promise<ApiOrgUnit> {
  const [branches, existingWarehouses] = await Promise.all([listBranches(), listWarehouses()]);
  if (!branches.some((branch) => branch.id === parentId && branch.status === 'active')) {
    throw new OrganizationApiError(
      'ACTIVE_BRANCH_REQUIRED',
      'Selecciona una sucursal activa para crear el almacén.',
      404
    );
  }
  if (existingWarehouses.some((warehouse) => warehouse.status === 'active')) {
    throw new OrganizationApiError(
      'ACTIVE_WAREHOUSE_ALREADY_EXISTS',
      'Ya existe un almacén activo. Actualiza la lista y selecciona el almacén existente.',
      409
    );
  }

  const created = await createWarehouse({
    code: 'ALM-001',
    name: 'Almacén principal',
    parentId,
  });
  const warehouses = await listWarehouses();
  const verified = warehouses.find((warehouse) => warehouse.id === created.id);
  if (verified === undefined || verified.status !== 'active') {
    throw new OrganizationApiError(
      'WAREHOUSE_VERIFICATION_FAILED',
      'El almacén se creó, pero no fue posible confirmar que esté activo.'
    );
  }
  return verified;
}
