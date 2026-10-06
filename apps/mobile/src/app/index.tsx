import { Redirect } from 'expo-router';
import { ActivityIndicator, Platform } from 'react-native';
import { useAuthStore } from '../stores/authStore';
export default function Index() {
  const { isHydrated, isAuthenticated } = useAuthStore();
  if (!isHydrated) return <ActivityIndicator />;
  return <Redirect href={isAuthenticated ? '/(tabs)/dashboard' : Platform.OS === 'web' ? '/login' : '/welcome'} />;
}
