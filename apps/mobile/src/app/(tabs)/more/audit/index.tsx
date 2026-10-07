import { createScreenStyles } from '../../../../theme/screen-styles';
import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Auditoría — Módulo de Auditoría
 *
 * Muestra el historial de acciones del sistema.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, EmptyState, StatusBadge } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useAuditStore } from '../../../../stores/auditStore';

type ModuleFilter = 'all' | 'Productos' | 'Ventas' | 'Inventario' | 'Compras' | 'Gastos' | 'Caja' | 'Usuarios';

export default function AuditScreen() {
  useModuleRefresh(useAuditStore.getState().load, () => useAuditStore.getState().error);
  const router = useRouter();
  const { logs } = useAuditStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');

  const modules: ModuleFilter[] = ['all', 'Productos', 'Ventas', 'Inventario', 'Compras', 'Gastos', 'Caja', 'Usuarios'];

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
      return matchesSearch && matchesModule;
    });
  }, [logs, searchQuery, moduleFilter]);


  return (
    <ScreenContainer loading={useAuditStore(state => state.isLoading)} error={useAuditStore(state => state.error)}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Auditoría</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar en auditoría..."
        />
      </View>

      {/* Filtros por módulo */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {modules.map((module) => (
          <Pressable
            key={module}
            style={[
              styles.filterChip,
              moduleFilter === module && styles.filterChipActive,
            ]}
            onPress={() => setModuleFilter(module)}
          >
            <Text
              style={[
                styles.filterChipText,
                moduleFilter === module && styles.filterChipTextActive,
              ]}
            >
              {module === 'all' ? 'Todos' : module}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista de logs */}
      {filteredLogs.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No se encontraron registros"
          description="Intenta con otros términos de búsqueda o filtros"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredLogs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logHeader}>
                <View style={styles.logInfo}>
                  <Text style={styles.logAction}>{log.action}</Text>
                  <Text style={styles.logModule}>{log.module}</Text>
                </View>
                <Text style={styles.logDate}>{log.date}</Text>
              </View>
              {log.details && (
                <Text style={styles.logDetails}>{log.details}</Text>
              )}
              <View style={styles.logFooter}>
                <StatusBadge status="neutral" label={`Usuario: ${log.user}`} />
              </View>
            </View>
          ))}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = createScreenStyles({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  placeholder: {
    width: 40,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  filtersContainer: {
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  filterChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterChipText: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    fontWeight: typography.weight.medium,
  },
  filterChipTextActive: {
    color: colors.neutral[0],
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logInfo: {
    flex: 1,
  },
  logAction: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  logModule: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
  },
  logDate: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
  },
  logDetails: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  logFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[100],
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
