/**
 * More Layout — Stack interno
 *
 * Define la navegación interna del tab Más.
 * Todas estas pantallas NO aparecen en el Tab Bar.
 */

import { Stack } from 'expo-router';
import { colors } from '../../../theme';

export default function MoreLayout() {
  return (
    <Stack screenOptions={{headerShown:false,headerTintColor:colors.primary[700],headerStyle:{backgroundColor:colors.surface},headerShadowVisible:false}}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="suppliers/new" options={{title:'Nuevo proveedor',headerShown:false}} />

      <Stack.Screen
        name="sales/index"
        options={{ title: 'Ventas' }}
      />
      <Stack.Screen
        name="sales/[id]"
        options={{ title: 'Detalle de venta' }}
      />

      <Stack.Screen
        name="purchases/index"
        options={{ title: 'Compras' }}
      />
      <Stack.Screen
        name="purchases/new"
        options={{ title: 'Nueva compra' }}
      />
      <Stack.Screen
        name="purchases/[id]"
        options={{ title: 'Detalle de compra' }}
      />

      <Stack.Screen
        name="suppliers/index"
        options={{ title: 'Proveedores' }}
      />
      <Stack.Screen
        name="suppliers/[id]"
        options={{ title: 'Detalle del proveedor' }}
      />

      <Stack.Screen
        name="customers/index"
        options={{ title: 'Clientes' }}
      />

      <Stack.Screen
        name="customers/new"
        options={{ title: 'Nuevo cliente',headerShown:true }}
      />

      <Stack.Screen
        name="customers/[id]"
        options={{ title: 'Detalle del cliente' }}
      />

      <Stack.Screen
        name="cash-register/index"
        options={{ title: 'Caja' }}
      />

      <Stack.Screen
        name="expenses/index"
        options={{ title: 'Gastos' }}
      />

      <Stack.Screen
        name="expenses/new"
        options={{ title: 'Nuevo gasto',headerShown:true }}
      />

      <Stack.Screen
        name="reports/index"
        options={{ title: 'Reportes' }}
      />

      <Stack.Screen
        name="users/index"
        options={{ title: 'Usuarios' }}
      />

      <Stack.Screen
        name="users/[id]"
        options={{ title: 'Detalle del usuario' }}
      />

      <Stack.Screen
        name="settings/index"
        options={{ title: 'Configuración' }}
      />

      <Stack.Screen
        name="settings/branches"
        options={{ title: 'Sucursales' }}
      />

      <Stack.Screen
        name="settings/organizations"
        options={{ title: 'Organizaciones' }}
      />

      <Stack.Screen
        name="settings/companies"
        options={{ title: 'Empresas' }}
      />

      <Stack.Screen
        name="settings/warehouses"
        options={{ title: 'Almacenes' }}
      />

      <Stack.Screen
        name="settings/profile"
        options={{ title: 'Editar perfil' }}
      />

      <Stack.Screen
        name="settings/password"
        options={{ title: 'Cambiar contraseña' }}
      />

      <Stack.Screen
        name="audit/index"
        options={{ title: 'Auditoría' }}
      />
    </Stack>
  );
}
