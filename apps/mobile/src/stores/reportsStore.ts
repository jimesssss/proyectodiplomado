import {create} from 'zustand';
import {apiRequest} from '../services/api-client';
import {businessApi} from '../services/business-api';
export interface ReportCard{id:string;title:string;description:string;icon:string;color:string;}
export interface ChartData{label:string;value:number;}
const REPORT_CARDS: ReportCard[] = [
  {
    id: '1',
    title: 'Ventas',
    description: 'Reporte de ventas por periodo',
    icon: 'trending-up',
    color: '#10B981',
  },
  {
    id: '2',
    title: 'Productos',
    description: 'Productos más vendidos',
    icon: 'cube',
    color: '#3B82F6',
  },
  {
    id: '3',
    title: 'Inventario',
    description: 'Estado del inventario',
    icon: 'archive',
    color: '#F59E0B',
  },
  {
    id: '4',
    title: 'Compras',
    description: 'Compras realizadas',
    icon: 'cart',
    color: '#8B5CF6',
  },
  {
    id: '5',
    title: 'Gastos',
    description: 'Gastos del periodo',
    icon: 'receipt',
    color: '#EF4444',
  },
  {
    id: '6',
    title: 'Clientes',
    description: 'Clientes frecuentes',
    icon: 'people',
    color: '#EC4899',
  },
];


interface ReportsState{reportCards:ReportCard[];salesByDay:ChartData[];topProducts:ChartData[];salesByCategory:ChartData[];isLoading:boolean;error:string|null;load():Promise<void>;}
export const useReportsStore=create<ReportsState>(set=>({reportCards:REPORT_CARDS,salesByDay:[],topProducts:[],salesByCategory:[],isLoading:false,error:null,
 load:async()=>{set({isLoading:true,error:null});try{
  const to=new Date().toISOString().slice(0,10),start=new Date();start.setDate(start.getDate()-6);const from=start.toISOString().slice(0,10);
  const report=(await apiRequest<{series:{period:string;currency:string;total:number}[]}>('/reports/sales?from='+from+'&to='+to+'&groupBy=day')).data;
  const docs=await businessApi.listInvoices();const quantities=new Map<string,{label:string;value:number}>();
  for(const doc of docs)if(!doc.archived&&['issued','paid'].includes(doc.status))for(const line of doc.lines){
    if(!line.productId)continue;const entry=quantities.get(line.productId)??{label:line.description,value:0};entry.value+=line.quantity;quantities.set(line.productId,entry);
  }
  set({salesByDay:report.series.filter(p=>p.currency==='MXN').map(p=>({label:p.period.slice(5),value:p.total})),topProducts:[...quantities.values()].sort((a,b)=>b.value-a.value).slice(0,5)});
 }catch(error){set({salesByDay:[],topProducts:[],error:error instanceof Error?error.message:'No se pudieron cargar los reportes.'});}finally{set({isLoading:false});}},
}));
