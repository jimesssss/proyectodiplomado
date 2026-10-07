/**
 * Tab Layout — Navegación principal
 *
 * Define las pestañas principales: Inicio, POS, Productos, Inventario, Más.
 * Utiliza iconos nativos (TabBarIcon) en lugar de fuentes de iconos.
 */
import { useAuthStore } from '../../stores/authStore';
import { ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { TabBarIcon } from '../../components';
import { colors } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isAuthenticated, isHydrated } = useAuthStore();
  if (!isHydrated) return <ActivityIndicator />;
  if (!isAuthenticated) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.neutral[400],
        tabBarLabelPosition: width < 600 ? 'below-icon' : 'beside-icon',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.neutral[200],
          borderTopWidth: 1,
          height: 64 + Math.max(8, insets.bottom),
          paddingBottom: Math.max(8, insets.bottom),
          paddingTop: 8,
          ...(Platform.OS === 'web' ? { maxWidth: 1200, width: '100%', alignSelf: 'center' as const } : {}),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => (
            <TabBarIcon type="home" color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="pos/index"
        options={{
          title: 'POS',
          tabBarIcon: ({ color }) => (
            <TabBarIcon type="pos" color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Productos',
          tabBarIcon: ({ color }) => (
            <TabBarIcon type="products" color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color }) => (
            <TabBarIcon type="inventory" color={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Más',
          tabBarIcon: ({ color }) => (
            <TabBarIcon type="more" color={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
