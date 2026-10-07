import { createScreenStyles } from '../../../theme/screen-styles';
/**
 * Inventario — Pantalla principal
 *
 * Muestra resumen de inventario, productos con stock bajo y movimientos recientes.
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatCard, SectionHeader, StatusBadge, EmptyState } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useProductStore } from '../../../stores/productStore';
import { useAuthStore } from '../../../stores/authStore';

export default function InventoryScreen() {
  const router = useRouter();
  const {
    summary,
    movements,
    stockLoading,
    movementsLoading,
    stockError,
    movementsError,
    loadStock,
    loadMovements,
    getStockForProduct,
    refreshSummary,
    refreshMovementNames,
  } = useInventoryStore();
  const {
    products,
    isLoading: productsLoading,
    error: productsError,
    loadProducts,
  } = useProductStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;
    const load = async () => {
      await Promise.all([loadProducts(), loadStock(), loadMovements()]);
      const loadedProducts = useProductStore.getState().products;
      refreshSummary(loadedProducts);
      refreshMovementNames(loadedProducts);
    };
    void load();
  }, [
    isAuthenticated,
    loadProducts,
    loadStock,
    loadMovements,
    refreshSummary,
    refreshMovementNames,
  ]);

  const lowStockProducts = products.filter((product) => {
    const stock = getStockForProduct(product.id);
    return product.minStockDefined !== false && stock > 0 && stock <= product.minStock;
  });
  const outOfStockProducts = products.filter(
    (product) => getStockForProduct(product.id) === 0,
  );
  const loading = productsLoading || stockLoading || movementsLoading;
  const loadError = isAuthenticated
    ? productsError ?? stockError ?? movementsError
    : 'Inicia sesión para consultar el inventario.';

  const formatCurrency = (value: number | null) =>
    value === null ? 'Pendiente' : `$${value.toFixed(2)}`;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Inventario</Text>
        <Pressable
          style={styles.movementsButton}
          onPress={() => router.push('/inventory/movements')}
        >
          <Ionicons name="swap-horizontal-outline" size={24} color={colors.primary[600]} />
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator />
          </View>
        )}
        {loadError && (
          <Text style={styles.loadError}>{loadError}</Text>
        )}
        {/* Resumen */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen de Inventario</Text>
          <View style={styles.statsGrid}>
            <StatCard
              label="Total Productos"
              value={summary.totalProducts.toString()}
              backgroundColor={colors.primary[50]}
            />
            <StatCard
              label="Stock Bajo"
              value={stockError ? '—' : summary.lowStock.toString()}
              backgroundColor="#FFF3DA"
              valueColor="#92400E"
            />
            <StatCard
              label="Agotados"
              value={stockError ? '—' : summary.outOfStock.toString()}
              backgroundColor="#FCECEF"
              valueColor="#991B1B"
            />
            <StatCard
              label="Valor Estimado"
              value={formatCurrency(summary.estimatedValue)}
              backgroundColor="#EAF5EF"
              valueColor="#065F46"
            />
          </View>
        </View>

        {/* Productos con stock bajo */}
        <View style={styles.section}>
          <SectionHeader
            title="Productos con Stock Bajo"
            actionText="Ver todos"
            onAction={() => {}}
          />
          {stockError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="No se pudo cargar el stock"
              description={stockError}
            />
          ) : productsError && products.length === 0 ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="No se pudieron cargar los productos"
              description={productsError}
            />
          ) : lowStockProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay productos con stock bajo</Text>
            </View>
          ) : (
            lowStockProducts.map((product) => (
              <Pressable
                key={product.id}
                style={styles.productRow}
                onPress={() => router.push(`/products/${product.id}`)}
              >
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productSku}>SKU: {product.sku}</Text>
                </View>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockValue}>{getStockForProduct(product.id)}</Text>
                  <Text style={styles.stockLabel}>de {product.minStock} mín.</Text>
                </View>
                <StatusBadge status="warning" label="Stock bajo" />
              </Pressable>
            ))
          )}
        </View>

        {/* Productos agotados */}
        <View style={styles.section}>
          <SectionHeader
            title="Productos Agotados"
            actionText="Ver todos"
            onAction={() => {}}
          />
          {stockError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="No se pudo cargar el stock"
              description={stockError}
            />
          ) : productsError && products.length === 0 ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="No se pudieron cargar los productos"
              description={productsError}
            />
          ) : outOfStockProducts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay productos agotados</Text>
            </View>
          ) : (
            outOfStockProducts.map((product) => (
              <Pressable
                key={product.id}
                style={styles.productRow}
                onPress={() => router.push(`/products/${product.id}`)}
              >
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productSku}>SKU: {product.sku}</Text>
                </View>
                <StatusBadge status="error" label="Agotado" />
              </Pressable>
            ))
          )}
        </View>

        {/* Movimientos recientes */}
        <View style={styles.section}>
          <SectionHeader
            title="Movimientos Recientes"
            actionText="Ver todos"
            onAction={() => router.push('/inventory/movements')}
          />
          {movements.slice(0, 5).map((movement) => (
            <View key={movement.id} style={styles.movementRow}>
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
          ))}
          {!movementsLoading && movementsError && (
            <EmptyState
              icon="cloud-offline-outline"
              title="No se pudieron cargar los movimientos"
              description={movementsError}
            />
          )}
          {!movementsLoading && !movementsError && movements.length === 0 && (
            <EmptyState
              icon="swap-horizontal-outline"
              title="No hay movimientos registrados"
            />
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = createScreenStyles({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  movementsButton: {
    padding: spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  productSku: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
  },
  stockInfo: {
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  stockValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.warning,
  },
  stockLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
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
  loadingContainer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  loadError: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
});
