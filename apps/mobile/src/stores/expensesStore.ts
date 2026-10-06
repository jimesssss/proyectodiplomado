import {create} from 'zustand';
import {listAccounts,listPayments,saveMoney,paymentPatch} from '../services/treasury-api';
import {type ApiAccount,type ApiMoney} from '../services/business-api';
import {useAuthStore} from './authStore';
export interface Expense {
  id: string;
  concept: string;
  category: string;
  date: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'unknown';
  accountId?:string;
  status: 'paid' | 'pending';
}


function mapExpense(p:ApiMoney):Expense{return {id:p.id,concept:p.notes??p.number,category:p.reference??'',date:p.date.slice(0,10),amount:p.amount,paymentMethod:'unknown',status:p.status==='posted'?'paid':'pending',accountId:p.accountId};}
interface ExpensesState{expenses:Expense[];accounts:ApiAccount[];isLoading:boolean;error:string|null;totalExpenses:number;load():Promise<void>;
 addExpense(input:Omit<Expense,'id'>&{accountId:string}):Promise<boolean>;updateExpense(id:string,input:{amount?:number;notes?:string;reference?:string}):Promise<boolean>;cancelExpense(id:string):Promise<boolean>;}
export const useExpensesStore=create<ExpensesState>((set,get)=>({expenses:[],accounts:[],isLoading:false,error:null,totalExpenses:0,
 load:async()=>{set({isLoading:true,error:null});try{const accounts=await listAccounts();const payments=await listPayments();const valid=payments.filter(p=>p.status!=='cancelled');
  set({accounts,expenses:valid.map(mapExpense),totalExpenses:valid.filter(p=>p.status==='posted'&&accounts.find(a=>a.id===p.accountId)?.currency==='MXN').reduce((sum,p)=>sum+p.amount,0)});
 }catch(error){set({error:error instanceof Error?error.message:'No se pudieron cargar gastos.',expenses:[]});}finally{set({isLoading:false});}},
 addExpense:async input=>{if(!useAuthStore.getState().can('payment:create')||(input.status==='paid'&&!useAuthStore.getState().can('payment:update'))){set({error:'No tienes permiso para registrar este pago.'});return false;}
  set({isLoading:true,error:null});try{
   await saveMoney('payments',{accountId:input.accountId,amount:input.amount,date:input.date,notes:input.concept,reference:input.category},input.status==='paid');
   await get().load();return true;
  }catch(error){set({error:error instanceof Error?error.message:'No se pudo guardar el gasto. Revisa pagos pendientes antes de reintentar.'});return false;}finally{set({isLoading:false});}},
 updateExpense:async(id,input)=>{try{await paymentPatch(id,input);await get().load();return true;}catch(error){set({error:error instanceof Error?error.message:'No se pudo editar.'});return false;}},
 cancelExpense:async id=>{try{await paymentPatch(id,{status:'cancelled'});await get().load();return true;}catch(error){set({error:error instanceof Error?error.message:'No se pudo anular.'});return false;}},
}));
