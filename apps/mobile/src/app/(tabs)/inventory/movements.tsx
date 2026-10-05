/**
 * Movimientos de Inventario — Lista completa
 *
 * Muestra todos los movimientos de inventario con filtros.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, EmptyState } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';
import { useInventoryStore } from '../../../stores/inventoryStore';

type MovementFilter = 'all' | 'entry' | 'exit' | 'adjustment';

export default function InventoryMovementsScreen() {
  const router = useRouter();
  const { movements } = useInventoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<MovementFilter>('all');

  const filteredMovements = useMemo(() => {
    return movements.filter((movement) => {
      const matchesSearch =
        movement.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.reason.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'all' || movement.type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [movements, searchQuery, filter]);

  const getFilterLabel = (type: MovementFilter) => {
    switch (type) {
      case 'all': return 'Todos';
      case 'entry': return 'Entradas';
      case 'exit': return 'Salidas';
      case 'adjustment': return 'Ajustes';
    }
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Movimientos de Inventario</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por producto o motivo..."
        />
      </View>

      {/* Filtros */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {(['all', 'entry', 'exit', 'adjustment'] as MovementFilter[]).map((type) => (
          <Pressable
            key={type}
            style={[
              styles.filterChip,
              filter === type && styles.filterChipActive,
            ]}
            onPress={() => setFilter(type)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === type && styles.filterChipTextActive,
              ]}
            >
              {getFilterLabel(type)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista de movimientos */}
      {filteredMovements.length === 0 ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="No se encontraron movimientos"
          description="Intenta con otros términos de búsqueda o filtros"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredMovements.map((movement) => (
            <View key={movement.id} style={styles.movementCard}>
              <View style={styles.movementHeader}>
                <View style={styles.movementIcon}>
                  <Ionicons
                    name={
                      movement.type === 'entry'
                        ? 'arrow-down-outline'
                        : movement.type === 'exit'
                        ? 'arrow-up-outline'
                        : 'swap-horizontal-outline'
                    }
                    size={20}
                    color={
                      movement.type === 'entry'
                        ? colors.success
                        : movement.type === 'exit'
                        ? colors.error
                        : colors.warning
                    }
                  />
                </View>
                <View style={styles.movementInfo}>
                  <Text style={styles.movementProduct}>{movement.productName}</Text>
                  <Text style={styles.movementReason}>{movement.reason}</Text>
                  <Text style={styles.movementDate}>{movement.date}</Text>
                </View>
                <View style={styles.movementQuantity}>
                  <Text
                    style={[
                      styles.movementQuantityText,
                      movement.type === 'entry' && styles.entryText,
                      movement.type === 'exit' && styles.exitText,
                    ]}
                  >
                    {movement.type === 'entry' ? '+' : movement.type === 'exit' ? '-' : '='}
                    {Math.abs(movement.quantity)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  movementCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  movementIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  movementInfo: {
    flex: 1,
  },
  movementProduct: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  movementReason: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginTop: 2,
  },
  movementDate: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
  },
  movementQuantity: {
    alignItems: 'center',
  },
  movementQuantityText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  entryText: {
    color: colors.success,
  },
  exitText: {
    color: colors.error,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
