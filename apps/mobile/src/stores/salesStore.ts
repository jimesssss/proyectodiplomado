import { create } from 'zustand';
import { businessApi, type ApiDocument } from '../services/business-api';
export interface Sale {
  id: string;
  folio: string;
  date: string;
  time?: string;
  customer: string;
  total: number;
  discount?: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'unknown';
  currency?: string;
  customerId?: string;
  status: 'completed' | 'pending' | 'cancelled';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
}

export interface SalesSummary {
  todaySales: number;
  todayCount: number;
  averageTicket: number;
}


export function mapSale(doc:ApiDocument,names:Record<string,string>={}):Sale {
  const date=new Date(doc.issueDate);
  return {id:doc.id,folio:doc.number,date:[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),time:date.toLocaleTimeString('en-GB').slice(0,5),
    customer:names[doc.customerId??'']??doc.customerId??'',customerId:doc.customerId,total:doc.total,currency:doc.currency,
    paymentMethod:'unknown',status:doc.status==='paid'?'completed':doc.status==='cancelled'?'cancelled':'pending',
    items:doc.lines.map((line,index)=>({productId:line.productId??doc.id+':'+index,productName:line.description,quantity:line.quantity,price:line.unitPrice}))};
}
interface SalesState { sales:Sale[];summary:SalesSummary;isLoading:boolean;error:string|null;load():Promise<void>;
  getSaleById(id:string):Sale|undefined;addSale(sale:Omit<Sale,'id'>):Promise<void>;setLoading(value:boolean):void;setError(value:string|null):void; }
export const useSalesStore=create<SalesState>((set,get)=>({
  sales:[],summary:{todaySales:0,todayCount:0,averageTicket:0},isLoading:false,error:null,
  getSaleById:id=>get().sales.find(s=>s.id===id),setLoading:isLoading=>set({isLoading}),setError:error=>set({error}),
  load:async()=>{set({isLoading:true,error:null});try {
    const docs=await businessApi.listInvoices();
    const sales=docs.map(d=>mapSale(d));
    const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    const todaySales=sales.filter(s=>s.date===today&&s.status==='completed'&&s.currency==='MXN');
    const total=todaySales.reduce((sum,s)=>sum+s.total,0);
    set({sales,summary:{todaySales:total,todayCount:todaySales.length,averageTicket:todaySales.length?total/todaySales.length:0}});
  }catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.',sales:[]});}finally{set({isLoading:false});}},
  addSale:async()=>{throw new Error('Completa un pedido mediante el flujo de ventas.');},
}));
