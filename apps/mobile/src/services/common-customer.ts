import { ApiError } from './api-client';
import { businessApi, type ApiParty } from './business-api';

const COMMON_CODE = 'CLIENTE-COMUN';

export function isCommonCustomer(customer: ApiParty): boolean {
  return customer.type === 'company' && !customer.email && !customer.phone && !customer.taxId && !customer.address &&
    (customer.code === COMMON_CODE || ['cliente común', 'cliente comun', 'público general', 'publico general'].includes(customer.name.trim().toLowerCase()));
}

/** The sales contract requires an ID. One tenant-scoped, non-personal CRM record is reused. */
export async function resolveCommonCustomer(canCreate: boolean): Promise<ApiParty> {
  const customers = await businessApi.listCustomers();
  const existing = customers.find(c => !c.archived && isCommonCustomer(c));
  if (existing) return existing;
  if (customers.some(c => c.code === COMMON_CODE)) {
    throw new ApiError('CONFLICT', 'El registro Cliente común está archivado o contiene datos personales. Revisa su configuración en Clientes.', 409);
  }
  if (!canCreate) throw new ApiError('FORBIDDEN', 'Un administrador debe crear Cliente común antes de usar ventas de mostrador.', 403);
  try {
    return await businessApi.create<ApiParty>('/customers', { code: COMMON_CODE, name: 'Cliente común', type: 'company' });
  } catch (error) {
    // The existing unique (tenantId, code) index also handles concurrent first-time setup.
    if (error instanceof ApiError && error.status === 409) {
      const winner = (await businessApi.listCustomers()).find(c => !c.archived && isCommonCustomer(c));
      if (winner) return winner;
    }
    throw error;
  }
}
