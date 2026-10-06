import {create} from 'zustand';
import {businessApi,type ApiUser} from '../services/business-api';
import {apiList} from '../services/api-client';
import {useAuthStore} from './authStore';
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  roles?: string[];
  status: 'active' | 'inactive';
  lastLogin?: string;
}


export interface Role { id:string;key:string;name:string;permissions:string[]; }
function mapUser(u:ApiUser):User{return {id:u.id,name:u.displayName,email:u.email,role:u.roles[0]??'',roles:u.roles,status:u.status==='active'?'active':'inactive'};}
interface UsersState {users:User[];roles:Role[];isLoading:boolean;error:string|null;load():Promise<void>;loadRoles():Promise<void>;
 getUserById(id:string):User|undefined;addUser(input:Omit<User,'id'>&{password:string}):Promise<boolean>;
 updateUser(id:string,input:Partial<User>):Promise<boolean>; }
export const useUsersStore=create<UsersState>((set,get)=>({users:[],roles:[],isLoading:false,error:null,
 load:async()=>{set({isLoading:true,error:null});try{set({users:(await businessApi.listUsers()).map(mapUser)});}catch(error){set({users:[],error:error instanceof Error?error.message:'No se pudieron cargar usuarios.'});}finally{set({isLoading:false});}},
 loadRoles:async()=>{try{set({roles:await apiList<Role>('/roles')});}catch(error){set({error:error instanceof Error?error.message:'No se pudieron cargar roles.'});}},
 getUserById:id=>get().users.find(u=>u.id===id),
 addUser:async input=>{if(!useAuthStore.getState().can('user:create')){set({error:'No tienes permiso para crear usuarios.'});return false;}
  try{const u=await businessApi.create<ApiUser>('/users',{displayName:input.name.trim(),email:input.email.trim(),password:input.password,roles:input.roles??[input.role]});set({users:[...get().users,mapUser(u)],error:null});return true;}
  catch(error){set({error:error instanceof Error?error.message:'No se pudo crear el usuario.'});return false;}},
 updateUser:async(id,input)=>{if(!useAuthStore.getState().can('user:update')){set({error:'No tienes permiso para editar usuarios.'});return false;}
  try{const u=await businessApi.update<ApiUser>('/users/'+id,{
   ...(input.name!==undefined?{displayName:input.name.trim()}:{}),...(input.status!==undefined?{status:input.status==='active'?'active':'disabled'}:{}),
   ...(input.roles!==undefined?{roles:input.roles}:input.role!==undefined?{roles:[input.role]}:{})});
   set({users:get().users.map(x=>x.id===id?mapUser(u):x),error:null});return true;}
  catch(error){set({error:error instanceof Error?error.message:'No se pudo editar el usuario.'});return false;}},
}));
