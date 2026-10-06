import {apiRequest,apiList,ApiError} from './api-client';
import {businessApi,type ApiDocument,type ApiLine} from './business-api';
export const COMPLETE_ORDER_PERMISSIONS = ['sales.order:create','sales.order:update','sales.order:read','sales.delivery:create','sales.delivery:update','sales.invoice:create','sales.invoice:update','receipt:create','receipt:update','bank.account:read','product:read','stock.movement:create'] as const;
export async function completePosOrder(orderId:string,warehouseId:string,accountId:string):Promise<ApiDocument> {
  const order=(await apiRequest<ApiDocument>('/sales/orders/'+orderId)).data;
  if(order.status==='fulfilled') {
    const invoices=await apiList<ApiDocument>('/sales/invoices?orderId='+orderId);
    const invoice=invoices.find(i=>i.status==='paid'&&!i.archived);
    if(invoice)return invoice;
    throw new ApiError('CONFLICT','El pedido está completado. Revisa la factura antes de intentar otra venta.',409);
  }
  if(order.status==='draft')await businessApi.update('/sales/orders/'+orderId,{status:'confirmed'});
  const result=(await apiRequest<{invoice:ApiDocument}>('/sales/orders/'+orderId+'/complete',{method:'POST',body:{warehouseId,accountId}})).data;
  return result.invoice;
}
export async function createPosOrder(customerId:string,lines:ApiLine[],paymentMethod:string):Promise<ApiDocument> {
  return businessApi.create('/sales/orders',{customerId,lines,currency:'MXN',notes:'POS payment method:'+paymentMethod});
}
