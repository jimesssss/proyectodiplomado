import { ProductImage } from '../../../../components/ProductImage';
import { createScreenStyles } from '../../../../theme/screen-styles';
/**
 * Producto Detalle — Ver detalle de producto
 *
 * Muestra toda la información de un producto.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatusBadge, SecondaryButton } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useAuthStore } from '../../../../stores/authStore';
import { useProductStore } from '../../../../stores/productStore';
import { useInventoryStore } from '../../../../stores/inventoryStore';

export default function ProductDetailScreen() {
  const router = useRouter();
  const canArchive = useAuthStore(state => state.can('product:delete'));
  const archivePending = useRef(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getProductById,
    loadProductById,
    isLoading,
    error,
  } = useProductStore();
  const {
    loadStock,
    getStockForProduct,
    stockLoading,
    stockError,
  } = useInventoryStore();

  useEffect(() => {
    if (typeof id === 'string' && id.length > 0) {
      const load = async () => {
        await Promise.all([loadProductById(id), loadStock()]);
        useProductStore.getState().setStockBalances(
          useInventoryStore.getState().stockBalances,
        );
      };
      void load();
    }
  }, [id, loadProductById, loadStock]);

  const product = getProductById(id || '');

  if (!product) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
              <Text style={styles.errorText}>
                {error ?? 'Producto no encontrado'}
              </Text>
              <SecondaryButton
                title="Volver"
                onPress={() => router.back()}
                style={styles.backButton}
              />
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  const archive = async () => {
    if (archivePending.current || !useAuthStore.getState().can('product:delete')) return;
    archivePending.current = true;
    setArchiving(true);
    setArchiveError(null);
    try {
      if (await useProductStore.getState().deleteProduct(product.id)) {
        router.back();
      } else {
        setArchiveError(useProductStore.getState().error ?? 'No se pudo archivar el producto.');
      }
    } finally { archivePending.current = false; setArchiving(false); }
  };
  const confirmArchive = () => {
    if (archiving) return;
    const message = '¿Archivar "' + product.name + '"? Dejará de aparecer en el listado activo; su historial se conservará.';
    if (Platform.OS === 'web') {
      const browser = globalThis as unknown as { confirm(message: string): boolean };
      if (browser.confirm(message)) void archive();
    } else {
      Alert.alert('Archivar producto', message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => { void archive(); } },
      ]);
    }
  };
  const stock = getStockForProduct(product.id);
  const stockAvailable = !stockLoading && stockError === null;
  const getStockStatus = (currentStock: number, minStock: number, minStockDefined?: boolean) => {
    if (minStockDefined === false) {
      return currentStock === 0
        ? { label: 'Agotado', status: 'error' as const }
        : { label: 'En stock', status: 'success' as const };
    }
    if (currentStock === 0) return { label: 'Agotado', status: 'error' as const };
    if (currentStock <= minStock) return { label: 'Stock bajo', status: 'warning' as const };
    return { label: 'En stock', status: 'success' as const };
  };

  const stockStatus = stockAvailable
    ? getStockStatus(stock, product.minStock, product.minStockDefined)
    : { label: 'Existencia no disponible', status: 'neutral' as const };

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
          <ProductImage uri={product.imageUrl} name={product.name} size={220} large style={styles.imagePlaceholder} />
        </View>

        {/* Información principal */}
        <View style={styles.section}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.statusRow}>
            <StatusBadge
              status={product.status === 'active' ? 'success' : 'neutral'}
              label={product.status === 'active' ? 'Activo' : 'Archivado'}
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
            <Text style={styles.detailValue}>{product.barcode || 'Pendiente de soporte en backend'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Categoría</Text>
            <Text style={styles.detailValue}>{product.category || 'Pendiente de soporte en backend'}</Text>
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
              {product.purchasePriceDefined === false
                ? 'No definido'
                : `$${product.purchasePrice.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Precio de venta</Text>
            <Text style={[styles.detailValue, styles.priceHighlight]}>
              {product.salePriceDefined === false
                ? 'No definido'
                : `$${product.salePrice.toFixed(2)}`}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Margen de ganancia</Text>
            <Text style={[styles.detailValue, styles.profitHighlight]}>
              {product.purchasePriceDefined === false ||
              product.salePriceDefined === false ||
              product.purchasePrice === 0
                ? 'No definido'
                : `${(((product.salePrice - product.purchasePrice) / product.purchasePrice) * 100).toFixed(1)}%`}
            </Text>
          </View>
        </View>

        {/* Inventario */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventario</Text>
          {stockError && <Text style={styles.errorText}>{stockError}</Text>}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Existencia actual</Text>
            <Text style={[
              styles.detailValue,
              stockAvailable && stock === 0 && styles.stockError,
              stockAvailable && stock > 0 && product.minStockDefined !== false && stock <= product.minStock && styles.stockWarning,
            ]}>
              {stockLoading ? 'Cargando…' : stockAvailable ? `${stock} ${product.unit}` : '—'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Stock mínimo</Text>
            <Text style={styles.detailValue}>
              {product.minStockDefined === false
                ? 'No definido'
                : `${product.minStock} ${product.unit}`}
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

        {archiveError && <Text accessibilityRole="alert" style={styles.errorText}>{archiveError}</Text>}
        {canArchive && product.status === 'active' && (
          <View style={styles.section}>
            <SecondaryButton
              title={archiving ? 'Archivando…' : 'Archivar producto'}
              disabled={archiving || isLoading}
              onPress={confirmArchive}
              icon={<Ionicons name="trash-outline" size={20} color={colors.error} />}
            />
          </View>
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
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
    width: 220,
    height: 220,
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
