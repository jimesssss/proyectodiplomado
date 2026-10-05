/**
 * Producto Detalle — Ver detalle de producto
 *
 * Muestra toda la información de un producto.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatusBadge, SecondaryButton } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useProductStore } from '../../../../stores/productStore';

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getProductById } = useProductStore();

  const product = getProductById(id || '');

  if (!product) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={styles.errorText}>Producto no encontrado</Text>
          <SecondaryButton
            title="Volver"
            onPress={() => router.back()}
            style={styles.backButton}
          />
        </View>
      </ScreenContainer>
    );
  }

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock === 0) return { label: 'Agotado', status: 'error' as const };
    if (stock <= minStock) return { label: 'Stock bajo', status: 'warning' as const };
    return { label: 'En stock', status: 'success' as const };
  };

  const stockStatus = getStockStatus(product.stock, product.minStock);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalle de Producto</Text>
        <Pressable
          onPress={() => router.push(`/products/${product.id}/edit`)}
          style={styles.editButton}
        >
          <Ionicons name="create-outline" size={24} color={colors.primary[600]} />
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Imagen placeholder */}
        <View style={styles.imageContainer}>
          <View style={styles.imagePlaceholder}>
            <Ionicons name="cube-outline" size={64} color={colors.neutral[400]} />
          </View>
        </View>

        {/* Información principal */}
        <View style={styles.section}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.statusRow}>
            <StatusBadge
              status={product.status === 'active' ? 'success' : 'neutral'}
              label={product.status === 'active' ? 'Activo' : 'Inactivo'}
            />
            <StatusBadge status={stockStatus.status} label={stockStatus.label} />
          </View>
        </View>

        {/* Detalles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información General</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>SKU</Text>
            <Text style={styles.detailValue}>{product.sku}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Código de barras</Text>
            <Text style={styles.detailValue}>{product.barcode}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Categoría</Text>
            <Text style={styles.detailValue}>{product.category}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Unidad</Text>
            <Text style={styles.detailValue}>{product.unit}</Text>
          </View>
        </View>

        {/* Precios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Precios</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Precio de compra</Text>
            <Text style={styles.detailValue}>
              ${product.purchasePrice.toFixed(2)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Precio de venta</Text>
            <Text style={[styles.detailValue, styles.priceHighlight]}>
              ${product.salePrice.toFixed(2)}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Margen de ganancia</Text>
            <Text style={[styles.detailValue, styles.profitHighlight]}>
              {(((product.salePrice - product.purchasePrice) / product.purchasePrice) * 100).toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Inventario */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventario</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Existencia actual</Text>
            <Text style={[
              styles.detailValue,
              product.stock === 0 && styles.stockError,
              product.stock > 0 && product.stock <= product.minStock && styles.stockWarning,
            ]}>
              {product.stock} {product.unit}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stock mínimo</Text>
            <Text style={styles.detailValue}>
              {product.minStock} {product.unit}
            </Text>
          </View>
        </View>

        {/* Descripción */}
        {product.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Descripción</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  editButton: {
    padding: spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: typography.size.lg,
    color: colors.neutral[600],
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    borderRadius: radii.lg,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  productName: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  detailLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },
  detailValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  priceHighlight: {
    color: colors.primary[600],
    fontWeight: typography.weight.bold,
  },
  profitHighlight: {
    color: colors.success,
    fontWeight: typography.weight.bold,
  },
  stockError: {
    color: colors.error,
  },
  stockWarning: {
    color: colors.warning,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
