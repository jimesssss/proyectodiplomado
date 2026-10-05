/**
 * Inventario — Pantalla principal
 *
 * Muestra resumen de inventario, productos con stock bajo y movimientos recientes.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatCard, SectionHeader, StatusBadge } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';
import { useInventoryStore } from '../../../stores/inventoryStore';
import { useProductStore } from '../../../stores/productStore';

export default function InventoryScreen() {
  const router = useRouter();
  const { summary, movements } = useInventoryStore();
  const { products } = useProductStore();

  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= p.minStock);
  const outOfStockProducts = products.filter((p) => p.stock === 0);

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

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
              value={summary.lowStock.toString()}
              backgroundColor="#FEF3C7"
              valueColor="#92400E"
            />
            <StatCard
              label="Agotados"
              value={summary.outOfStock.toString()}
              backgroundColor="#FEE2E2"
              valueColor="#991B1B"
            />
            <StatCard
              label="Valor Estimado"
              value={formatCurrency(summary.estimatedValue)}
              backgroundColor="#D1FAE5"
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
          {lowStockProducts.length === 0 ? (
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
                  <Text style={styles.stockValue}>{product.stock}</Text>
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
          {outOfStockProducts.length === 0 ? (
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
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});
