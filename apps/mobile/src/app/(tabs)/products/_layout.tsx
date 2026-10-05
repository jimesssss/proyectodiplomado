/**
 * Products Layout — Stack interno
 *
 * Define la navegación interna del tab Productos.
 * Las pantallas new y [id] NO aparecen en el Tab Bar.
 */
import { Stack } from 'expo-router';

export default function ProductsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="new" options={{ title: 'Nuevo Producto' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Detalle de producto' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Editar producto' }} />
    </Stack>
  );
}
