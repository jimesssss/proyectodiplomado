import {vi} from 'vitest';
vi.mock('expo-secure-store',()=>({isAvailableAsync:vi.fn(async()=>false),getItemAsync:vi.fn(async()=>null),setItemAsync:vi.fn(async()=>undefined),deleteItemAsync:vi.fn(async()=>undefined)}));
