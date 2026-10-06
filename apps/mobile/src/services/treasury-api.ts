import {apiList,apiRequest} from './api-client';
import {businessApi,type ApiAccount,type ApiMoney} from './business-api';
export interface ApiCashMovement{id:string;amount:number;reason:string;sourceType:string;sourceId:string;createdAt:string;balanceAfter:number;}
export const listAccounts=()=>businessApi.listAccounts();
export const listPayments=()=>apiList<ApiMoney>('/treasury/payments');
export const listAccountMovements=(id:string)=>apiList<ApiCashMovement>('/treasury/accounts/'+id+'/movements');
const pendingMoney=new Map<string,string>();
export function clearPendingMoney(): void { pendingMoney.clear(); }
export async function saveMoney(kind:'payments'|'receipts',input:{accountId:string;amount:number;date?:string;notes?:string;reference?:string},post:boolean):Promise<ApiMoney>{
 const key=kind+':'+JSON.stringify(input);
 let id=pendingMoney.get(key);
 if(!id){const document=await businessApi.create<ApiMoney>('/treasury/'+kind,input);if(!post)return document;id=document.id;pendingMoney.set(key,id);}
 const current=(await apiRequest<ApiMoney>('/treasury/'+kind+'/'+id)).data;
 if(current.status==='posted'){pendingMoney.delete(key);return current;}
 const posted=await businessApi.update<ApiMoney>('/treasury/'+kind+'/'+id,{status:'posted'});
 pendingMoney.delete(key);return posted;
}
export async function archiveAccount(id:string,archived:boolean):Promise<ApiAccount>{return businessApi.update<ApiAccount>('/treasury/accounts/'+id,{archived});}
export async function paymentPatch(id:string,body:{amount?:number;notes?:string;reference?:string;status?:'cancelled'}):Promise<ApiMoney>{
 return (await apiRequest<ApiMoney>('/treasury/payments/'+id,{method:'PATCH',body})).data;
}
