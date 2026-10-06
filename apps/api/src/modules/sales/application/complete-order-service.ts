import { atomic } from '../../../core/db/transaction.js';
import { ConflictError, ValidationError } from '../../../core/errors/app-error.js';
import { getTreasuryAccount, createReceipt, updateReceipt } from '../../treasury/index.js';
import { createSale, getSale, updateSale } from './sale-service.js';

/** Complete a confirmed commercial order using its delivery, invoice and receipt.
 * All stock, money and document writes commit together. Order state prevents duplicate charges.
 */
export async function completeOrder(tenantId: string, orderId: string, input: { warehouseId: string; accountId: string }) {
  return atomic(async () => {
    const order = await getSale(tenantId, 'sales.order', orderId);
    if (order.archived || order.status !== 'confirmed') throw new ConflictError('Only a confirmed active order can be completed');
    if (order.lines.some(line => !line.productId)) throw new ValidationError('Every order line must reference a product');
    const account = await getTreasuryAccount(tenantId, input.accountId);
    if (account.archived || account.currency !== order.currency) throw new ConflictError('Select an active account in the order currency');
    // Claim the order in the same transaction: concurrent completion retries observe fulfilled.
    const fulfilled = await updateSale(tenantId, 'sales.order', orderId, { status: 'fulfilled' });
    const lines = order.lines.map(line => ({ description: line.description, productId: line.productId!,
      quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, discountPct: line.discountPct }));
    const delivery = await createSale(tenantId, 'sales.delivery', { orderId, warehouseId: input.warehouseId, lines, currency: order.currency });
    const shipped = await updateSale(tenantId, 'sales.delivery', delivery.id, { status: 'shipped' });
    const invoice = await createSale(tenantId, 'sales.invoice', { customerId: order.customerId, orderId, lines, currency: order.currency, ...(order.notes ? { notes: order.notes } : {}) });
    await updateSale(tenantId, 'sales.invoice', invoice.id, { status: 'issued' });
    if (invoice.total > 0) {
      const receipt = await createReceipt(tenantId, { accountId: input.accountId, invoiceId: invoice.id, amount: invoice.total });
      await updateReceipt(tenantId, receipt.id, { status: 'posted' });
    }
    const paid = await updateSale(tenantId, 'sales.invoice', invoice.id, { status: 'paid' });
    return { order: fulfilled, delivery: shipped, invoice: paid };
  });
}
