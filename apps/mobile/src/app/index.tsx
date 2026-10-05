/**
 * Index — Redirige a la pantalla de bienvenida.
 */
import { Redirect } from 'expo-router';

export default function Index() {
  return <Redirect href="/welcome" />;
}
