import { clearSessionData } from '../services/session-cache';
/**
 * Root Layout — Expo Router
 *
 * Configura el proveedor de SafeArea y la navegación raíz.
 */
import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (next.user?.id !== previous.user?.id || next.user?.tenantId !== previous.user?.tenantId) { clearSessionData(); queryClient.clear(); }
    });
    void useAuthStore.getState().hydrate();
    return unsubscribe;
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
