/**
 * Tab Layout — Navegación principal
 *
 * Define las pestañas principales: Inicio, POS, Productos, Inventario, Más.
 * Utiliza iconos nativos (TabBarIcon) en lugar de fuentes de iconos.
 */
import { Tabs } from 'expo-router';
import { TabBarIcon } from '../../components';
import { colors } from '../../theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colors.neutral[400],
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.neutral[200],
          borderTopWidth: 1,
          height: 65,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
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
