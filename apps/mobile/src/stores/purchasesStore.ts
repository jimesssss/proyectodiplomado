import {create} from 'zustand';
import {businessApi,type ApiDocument,type ApiLine} from '../services/business-api';
export interface Purchase {
  id: string;
  orderNumber: string;
  supplier: string;
  date: string;
  total: number;
  status: 'pending' | 'received' | 'cancelled';
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
  }[];
}


function mapPurchase(d:ApiDocument,names:Record<string,string>):Purchase {return {id:d.id,orderNumber:d.number,supplier:names[d.supplierId??'']??d.supplierId??'',date:d.issueDate.slice(0,10),total:d.total,
  status:d.status==='completed'?'received':d.status==='cancelled'?'cancelled':'pending',items:d.lines.map((l,i)=>({productId:l.productId??d.id+':'+i,productName:l.description,quantity:l.quantity,price:l.unitPrice}))};}
interface PurchasesState {purchases:Purchase[];isLoading:boolean;error:string|null;load():Promise<void>;getPurchaseById(id:string):Purchase|undefined;
  createOrder(input:{supplierId:string;lines:ApiLine[];notes?:string}):Promise<boolean>;addPurchase(input:Omit<Purchase,'id'>):Promise<void>;}
export const usePurchasesStore=create<PurchasesState>((set,get)=>({purchases:[],isLoading:false,error:null,
  getPurchaseById:id=>get().purchases.find(p=>p.id===id),
  load:async()=>{set({isLoading:true,error:null});try{const docs=await businessApi.listOrders();const suppliers=await businessApi.listSuppliers();
    const names=Object.fromEntries(suppliers.map(s=>[s.id,s.name]));set({purchases:docs.map(d=>mapPurchase(d,names))});}
    catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.',purchases:[]});}finally{set({isLoading:false});}},
  createOrder:async input=>{set({isLoading:true,error:null});try{
    await businessApi.create('/purchasing/orders',{...input,currency:'MXN'});await get().load();return true;
  }catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.'});return false;}finally{set({isLoading:false});}},
  addPurchase:async()=>{throw Error('Usa la creación de órdenes de compra.');},
}));
