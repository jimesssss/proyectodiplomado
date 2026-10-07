import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./business-api', () => ({ businessApi: { listCustomers: vi.fn(), create: vi.fn() } }));
vi.mock('expo-constants', () => ({ default: {} }));
import { businessApi, type ApiParty } from './business-api';
import { ApiError } from './api-client';
import { isCommonCustomer, resolveCommonCustomer } from './common-customer';

const common: ApiParty = { id: 'common', code: 'CLIENTE-COMUN', name: 'Cliente común', type: 'company',
  email: null, phone: null, taxId: null, address: null, archived: false };
describe('Cliente común uses existing CRM contracts', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('reuses an existing generic record without create permission or writes', async () => {
    vi.mocked(businessApi.listCustomers).mockResolvedValue([common]);
    expect(await resolveCommonCustomer(false)).toEqual(common);
    expect(businessApi.create).not.toHaveBeenCalled();
  });
  it('reuses compatible Público general rather than making a duplicate', async () => {
    const existing = { ...common, code: 'MOSTRADOR', name: 'Público general' };
    vi.mocked(businessApi.listCustomers).mockResolvedValue([existing]);
    expect(await resolveCommonCustomer(true)).toEqual(existing);
    expect(businessApi.create).not.toHaveBeenCalled();
  });
  it('creates only one non-personal record, then reuses it on the next sale', async () => {
    vi.mocked(businessApi.listCustomers).mockResolvedValueOnce([]).mockResolvedValueOnce([common]);
    vi.mocked(businessApi.create).mockResolvedValue(common);
    expect(await resolveCommonCustomer(true)).toEqual(common);
    expect(await resolveCommonCustomer(true)).toEqual(common);
    expect(businessApi.create).toHaveBeenCalledTimes(1);
    expect(businessApi.create).toHaveBeenCalledWith('/customers', { code: 'CLIENTE-COMUN', name: 'Cliente común', type: 'company' });
  });
  it('handles a concurrent creation via the unique code conflict', async () => {
    vi.mocked(businessApi.listCustomers).mockResolvedValueOnce([]).mockResolvedValueOnce([common]);
    vi.mocked(businessApi.create).mockRejectedValue(new ApiError('CONFLICT', 'duplicate', 409));
    expect(await resolveCommonCustomer(true)).toEqual(common);
  });
  it('never creates without permission', async () => {
    vi.mocked(businessApi.listCustomers).mockResolvedValue([]);
    await expect(resolveCommonCustomer(false)).rejects.toMatchObject({ status: 403 });
    expect(businessApi.create).not.toHaveBeenCalled();
  });
  it('does not silently restore archived records or reuse personal identities', async () => {
    for (const customer of [{ ...common, archived: true }, { ...common, email: 'person@example.com' }, { ...common, type: 'person' as const }]) {
      vi.mocked(businessApi.listCustomers).mockResolvedValue([customer]);
      await expect(resolveCommonCustomer(true)).rejects.toMatchObject({ status: 409 });
    }
    expect(businessApi.create).not.toHaveBeenCalled();
    expect(isCommonCustomer({ ...common, code: 'CLI-1', name: 'María González', type: 'person' })).toBe(false);
  });
});
