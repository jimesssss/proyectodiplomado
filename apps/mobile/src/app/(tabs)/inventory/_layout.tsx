/**
 * Inventory Layout — Stack interno
 *
 * Define la navegación interna del tab Inventario.
 * La pantalla movements NO aparece en el Tab Bar.
 */
import { Stack } from 'expo-router';

export default function InventoryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="movements" options={{ title: 'Movimientos' }} />
    </Stack>
  );
}
