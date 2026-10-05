/**
 * Compras — Lista de compras
 *
 * Muestra todas las compras/órdenes de compra.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, EmptyState, StatusBadge } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { usePurchasesStore } from '../../../../stores/purchasesStore';

type StatusFilter = 'all' | 'pending' | 'received' | 'cancelled';

export default function PurchasesScreen() {
  const router = useRouter();
  const { purchases } = usePurchasesStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      const matchesSearch =
        purchase.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.supplier.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || purchase.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [purchases, searchQuery, statusFilter]);

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Compras</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/more/purchases/new')}
        >
          <Ionicons name="add" size={24} color={colors.neutral[0]} />
        </Pressable>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por orden o proveedor..."
        />
      </View>

      {/* Filtros por estado */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {(['all', 'pending', 'received', 'cancelled'] as StatusFilter[]).map((status) => (
          <Pressable
            key={status}
            style={[
              styles.filterChip,
              statusFilter === status && styles.filterChipActive,
            ]}
            onPress={() => setStatusFilter(status)}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === status && styles.filterChipTextActive,
              ]}
            >
              {status === 'all'
                ? 'Todos'
                : status === 'pending'
                ? 'Pendientes'
                : status === 'received'
                ? 'Recibidas'
                : 'Canceladas'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista de compras */}
      {filteredPurchases.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="No se encontraron compras"
          description="Intenta con otros términos de búsqueda o filtros"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredPurchases.map((purchase) => (
            <Pressable
              key={purchase.id}
              style={styles.purchaseCard}
              onPress={() => router.push(`/more/purchases/${purchase.id}`)}
            >
              <View style={styles.purchaseHeader}>
                <Text style={styles.purchaseOrder}>{purchase.orderNumber}</Text>
                <StatusBadge
                  status={
                    purchase.status === 'received'
                      ? 'success'
                      : purchase.status === 'pending'
                      ? 'warning'
                      : 'error'
                  }
                  label={
                    purchase.status === 'received'
                      ? 'Recibida'
                      : purchase.status === 'pending'
                      ? 'Pendiente'
                      : 'Cancelada'
                  }
                />
              </View>
              <View style={styles.purchaseBody}>
                <View style={styles.purchaseInfo}>
                  <Text style={styles.purchaseSupplier}>{purchase.supplier}</Text>
                  <Text style={styles.purchaseDate}>{purchase.date}</Text>
                  <Text style={styles.purchaseItems}>
                    {purchase.items.length} producto(s)
                  </Text>
                </View>
                <Text style={styles.purchaseTotal}>
                  {formatCurrency(purchase.total)}
                </Text>
              </View>
            </Pressable>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  addButton: {
    backgroundColor: '#9333EA',
    width: 40,
    height: 40,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  filtersContainer: {
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#9333EA',
    borderColor: '#9333EA',
  },
  filterChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  purchaseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  purchaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  purchaseOrder: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  purchaseBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  purchaseInfo: {
    flex: 1,
  },
  purchaseSupplier: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  purchaseDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  purchaseItems: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  purchaseTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  bottomSpacer: {
    height: 48,
  },
});
