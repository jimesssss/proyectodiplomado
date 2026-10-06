/**
 * Productos — Lista de productos
 *
 * Muestra todos los productos con buscador y filtros por categoría.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, EmptyState, StatusBadge } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';
import { useProductStore } from '../../../stores/productStore';
import { useInventoryStore } from '../../../stores/inventoryStore';

export default function ProductsScreen() {
  const router = useRouter();
  const { products, categories, isLoading, error, loadProducts } = useProductStore();
  const {
    stockLoading,
    stockError,
    loadStock,
    getStockForProduct,
  } = useInventoryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const stockAvailable = !stockLoading && stockError === null;

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadProducts(), loadStock()]);
      useProductStore.getState().setStockBalances(
        useInventoryStore.getState().stockBalances,
      );
    };
    void load();
  }, [loadProducts, loadStock]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategory || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const getStockStatus = (stock: number, minStock: number) => {
    if (stock === 0) return { label: 'Agotado', status: 'error' as const };
    if (stock <= minStock) return { label: 'Stock bajo', status: 'warning' as const };
    return { label: 'Disponible', status: 'success' as const };
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Productos</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/products/new')}
        >
          <Ionicons name="add" size={24} color={colors.neutral[0]} />
        </Pressable>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por nombre o SKU..."
        />
      </View>

      {/* Filtros por categoría */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        <Pressable
          style={[
            styles.filterChip,
            !selectedCategory && styles.filterChipActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              styles.filterChipText,
              !selectedCategory && styles.filterChipTextActive,
            ]}
          >
            Todos
          </Text>
        </Pressable>
        {categories.map((category) => (
          <Pressable
            key={category}
            style={[
              styles.filterChip,
              selectedCategory === category && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategory(category)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === category && styles.filterChipTextActive,
              ]}
            >
              {category}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista de productos */}
      {error && products.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="No se pudieron cargar los productos"
          description={error}
        />
      ) : isLoading && products.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="No se encontraron productos"
          description={error ?? 'Intenta con otros términos de búsqueda o filtros'}
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {(error || (stockError && !stockLoading)) && (
            <Text style={styles.loadError}>{error ?? stockError}</Text>
          )}
          {filteredProducts.map((product) => {
            const stock = getStockForProduct(product.id);
            const stockStatus = stockAvailable
              ? getStockStatus(stock, product.minStock)
              : { label: 'Existencia no disponible', status: 'neutral' as const };
            return (
              <Pressable
                key={product.id}
                style={styles.productCard}
                onPress={() => router.push(`/products/${product.id}`)}
              >
                <View style={styles.productImagePlaceholder}>
                  <Ionicons name="cube-outline" size={32} color={colors.neutral[400]} />
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productSku}>SKU: {product.sku}</Text>
                  <Text style={styles.productCategory}>{product.category}</Text>
                  <View style={styles.productFooter}>
                    <Text style={styles.productPrice}>
                      {product.salePriceDefined === false
                        ? 'Sin precio'
                        : `$${product.salePrice.toFixed(2)}`}
                    </Text>
                    <StatusBadge status={stockStatus.status} label={stockStatus.label} />
                  </View>
                </View>
                <View style={styles.productStock}>
                  <Text style={styles.stockLabel}>Existencia</Text>
                  <Text style={[
                    styles.stockValue,
                    stockAvailable && stock === 0 && styles.stockValueError,
                    stockAvailable && stock > 0 && product.minStockDefined !== false && stock <= product.minStock && styles.stockValueWarning,
                  ]}>
                    {stockAvailable ? stock : '—'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
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
  addButton: {
    backgroundColor: colors.primary[600],
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
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
  productCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  productImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: 2,
  },
  productSku: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginBottom: 2,
  },
  productCategory: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginBottom: spacing.xs,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.primary[600],
  },
  productStock: {
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  stockLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
  },
  stockValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  stockValueError: {
    color: colors.error,
  },
  stockValueWarning: {
    color: colors.warning,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadError: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginVertical: spacing.sm,
  },
});
