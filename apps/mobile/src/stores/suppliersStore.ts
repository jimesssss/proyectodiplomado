import { create } from 'zustand';
import { businessApi, type ApiParty } from '../services/business-api';
import { useAuthStore } from './authStore';
export interface Supplier {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive';
  address?: string;
  rfc?: string;
}


function mapSupplier(c: ApiParty): Supplier { return { id:c.id, name:c.name, company:c.name, phone:c.phone??'', email:c.email??'', status:c.archived?'inactive':'active', address:c.address?.street??'', rfc:c.taxId??'' }; }
interface SuppliersState { suppliers: Supplier[]; isLoading:boolean; error:string|null; load():Promise<void>;
  getSupplierById(id:string):Supplier|undefined; addSupplier(input:Omit<Supplier,'id'> & {code?:string}):Promise<boolean>;
  updateSupplier(id:string,input:Partial<Supplier>):Promise<boolean>; }
export const useSuppliersStore=create<SuppliersState>((set,get)=>({
  suppliers:[],isLoading:false,error:null,
  getSupplierById:id=>get().suppliers.find(s=>s.id===id),
  load:async()=>{ set({isLoading:true,error:null}); try { set({suppliers:(await businessApi.listSuppliers()).map(mapSupplier)}); }
    catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.',suppliers:[]});}finally{set({isLoading:false});} },
  addSupplier:async input=>{
    if(!useAuthStore.getState().can('supplier:create')){set({error:'No tienes permiso para crear proveedores.'});return false;}
    try { const c=await businessApi.create<ApiParty>('/suppliers',{code:input.code?.trim()||'PRO-'+Date.now(),name:input.name.trim(),
      ...(input.email.trim()?{email:input.email.trim()}:{}),...(input.phone.trim()?{phone:input.phone.trim()}:{}),
      ...(input.rfc?.trim()?{taxId:input.rfc.trim()}:{}),...(input.address?.trim()?{address:{street:input.address.trim()}}:{})});
      set({suppliers:[...get().suppliers,mapSupplier(c)],error:null});return true;
    }catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.'});return false;}
  },
  updateSupplier:async(id,input)=>{
    if(!useAuthStore.getState().can('supplier:update')){set({error:'No tienes permiso para editar proveedores.'});return false;}
    try { const c=await businessApi.update<ApiParty>('/suppliers/'+id,{
      ...(input.name!==undefined?{name:input.name.trim()}:{}),...(input.email!==undefined?{email:input.email.trim()||null}:{}),
      ...(input.phone!==undefined?{phone:input.phone.trim()||null}:{}),...(input.rfc!==undefined?{taxId:input.rfc.trim()||null}:{}),
      ...(input.address!==undefined?{address:input.address.trim()?{street:input.address.trim()}:null}:{}),
      ...(input.status!==undefined?{archived:input.status==='inactive'}:{})});
      set({suppliers:get().suppliers.map(s=>s.id===id?mapSupplier(c):s),error:null});return true;
    }catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.'});return false;}
  },
}));
