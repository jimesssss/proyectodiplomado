import {create} from 'zustand';
import {listAccounts,listAccountMovements,saveMoney} from '../services/treasury-api';
import {type ApiAccount} from '../services/business-api';
import {useAuthStore} from './authStore';
export interface CashMovement {
  id: string;
  type: 'entry' | 'exit';
  amount: number;
  reason: string;
  date: string;
  user: string;
}

export interface CashRegister {
  isOpen: boolean;
  initialBalance: number;
  cashSales: number;
  entries: number;
  exits: number;
  currentBalance: number;
  movements: CashMovement[];
}


const EMPTY:CashRegister={isOpen:false,initialBalance:0,cashSales:0,entries:0,exits:0,currentBalance:0,movements:[]};
interface CashRegisterState{cashRegister:CashRegister;accounts:ApiAccount[];accountId:string|null;isLoading:boolean;error:string|null;
 load():Promise<void>;selectAccount(id:string):Promise<void>;openCashRegister(initialBalance:number):Promise<boolean>;closeCashRegister():Promise<boolean>;
 addEntry(amount:number,reason:string):Promise<boolean>;addExit(amount:number,reason:string):Promise<boolean>;}
export const useCashRegisterStore=create<CashRegisterState>((set,get)=>({cashRegister:EMPTY,accounts:[],accountId:null,isLoading:false,error:null,
 load:async()=>{set({isLoading:true,error:null});try{const accounts=(await listAccounts()).filter(a=>a.type==='cash'&&a.currency==='MXN');
  set({accounts});const id=get().accountId??accounts[0]?.id;if(id)await get().selectAccount(id);else set({cashRegister:EMPTY});
 }catch(error){set({error:error instanceof Error?error.message:'No se pudo cargar caja.',cashRegister:EMPTY});}finally{set({isLoading:false});}},
 selectAccount:async id=>{set({isLoading:true,error:null});try{const account=get().accounts.find(a=>a.id===id);if(!account)throw Error('Selecciona una cuenta real de caja.');
  const rows=await listAccountMovements(id);const entries=rows.filter(m=>m.amount>0&&m.sourceType!=='opening').reduce((sum,m)=>sum+m.amount,0);
  const exits=rows.filter(m=>m.amount<0).reduce((sum,m)=>sum-m.amount,0);
  set({accountId:id,cashRegister:{isOpen:!account.archived,initialBalance:account.openingBalance,cashSales:entries,entries,exits,currentBalance:account.balance,
   movements:rows.map(m=>({id:m.id,type:m.amount>0?'entry':'exit',amount:Math.abs(m.amount),reason:m.reason,date:m.createdAt,user:''}))}});
 }catch(error){set({error:error instanceof Error?error.message:'No se pudo cargar el historial.'});}finally{set({isLoading:false});}},
 openCashRegister:async()=>{set({error:'El backend administra cuentas de tesorería. Aún no existe un contrato para apertura de turnos de caja.'});return false;},
 closeCashRegister:async()=>{set({error:'El backend aún no define cierre y arqueo de turnos de caja. No se ha modificado el saldo.'});return false;},
 addEntry:async(amount,reason)=>{if(!get().accountId)return false;if(!useAuthStore.getState().can('receipt:create')||!useAuthStore.getState().can('receipt:update')){set({error:'No tienes permiso para registrar cobros.'});return false;}
  try{await saveMoney('receipts',{accountId:get().accountId!,amount,notes:reason},true);await get().load();return true;}
  catch(error){set({error:error instanceof Error?error.message:'No se pudo registrar la entrada.'});return false;}},
 addExit:async(amount,reason)=>{if(!get().accountId)return false;if(!useAuthStore.getState().can('payment:create')||!useAuthStore.getState().can('payment:update')){set({error:'No tienes permiso para registrar pagos.'});return false;}
  try{await saveMoney('payments',{accountId:get().accountId!,amount,notes:reason},true);await get().load();return true;}
  catch(error){set({error:error instanceof Error?error.message:'No se pudo registrar la salida.'});return false;}},
}));
