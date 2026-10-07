import {create} from 'zustand';
import {apiList} from '../services/api-client';
export interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  date: string;
  details?: string;
}

interface NewAuditLog {
  user: string;
  action: string;
  module: string;
  details?: string;
}


interface AuditState {logs:AuditLog[];isLoading:boolean;error:string|null;load(filters?:{entityId?:string;entityType?:string;userId?:string;action?:string;from?:string;to?:string}):Promise<void>;
  addLog(log:NewAuditLog):void;getLogsByUser(user:string):AuditLog[];getLogsByModule(module:string):AuditLog[];}
export const useAuditStore=create<AuditState>((set,get)=>({logs:[],isLoading:false,error:null,
  load:async(filters={})=>{set({isLoading:true,error:null});try{
    const query=Object.entries(filters).filter(([,v])=>v!==undefined).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v!)).join('&');
    const rows=await apiList<{id:string;userId:string|null;action:string;entityType:string;entityId:string|null;timestamp:string}>('/audit'+(query?'?'+query:''));
    set({logs:rows.map(r=>({id:r.id,user:r.userId??'Sin usuario asociado',action:r.action,module:r.entityType,date:r.timestamp,details:r.entityId??''}))});
  }catch(error){set({error:error instanceof Error ? error.message : 'No se pudo completar la operación.',logs:[]});}finally{set({isLoading:false});}},
  // Audit events are authoritative backend records; legacy UI callbacks only refresh them.
  addLog:()=>{void get().load();},getLogsByUser:user=>get().logs.filter(l=>l.user===user),getLogsByModule:module=>get().logs.filter(l=>l.module===module),
}));
