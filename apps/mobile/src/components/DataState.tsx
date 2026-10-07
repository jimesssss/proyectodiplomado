import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii } from '../theme';

export function DataState({ loading, error, empty = false }: { loading?: boolean; error?: string | null; empty?: boolean }) {
  if (!loading && !error && !empty) return null;
  const denied = !!error && /permiso|permission|forbidden/i.test(error);
  const offline = !!error && /conexión|conexi[oó]n|network|offline|fetch|timeout|tardó/i.test(error);
  const title = loading ? 'Cargando información…' : denied ? 'Acceso restringido' : offline ? 'No pudimos conectar' : error ? 'No se pudo cargar la información' : 'Todavía no hay información';
  const description = denied ? 'Tu usuario no tiene acceso a esta información.' : offline ? 'Revisa tu conexión y vuelve a abrir esta sección.' : error ? 'Vuelve a abrir esta sección para intentarlo nuevamente.' : 'Los datos aparecerán aquí cuando haya registros disponibles.';
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.container, error ? styles.error : undefined]}>
    {loading ? <ActivityIndicator color={colors.primary[600]} /> : <Ionicons name={denied ? 'lock-closed-outline' : offline ? 'cloud-offline-outline' : error ? 'alert-circle-outline' : 'file-tray-outline'} size={24} color={error ? colors.error : colors.primary[600]} />}
    <View style={styles.copy}><Text style={styles.title}>{title}</Text>{!loading && <Text style={styles.description}>{description}</Text>}</View>
  </View>;
}
const styles = StyleSheet.create({
  container: { margin: spacing.md, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[100], flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  error: { backgroundColor: '#FCECEF', borderColor: '#EBCEDB' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600', color: colors.neutral[800] },
  description: { marginTop: 4, fontSize: 14, lineHeight: 21, color: colors.neutral[600] },
});
