import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Clientes — Lista de clientes
 *
 * Muestra todos los clientes con buscador y botón de nuevo cliente.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, EmptyState, StatusBadge } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useCustomersStore } from '../../../../stores/customersStore';

export default function CustomersScreen() {
  useModuleRefresh(useCustomersStore.getState().load, () => useCustomersStore.getState().error);
  const router = useRouter();
  const { customers } = useCustomersStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone.includes(searchQuery)
    );
  }, [customers, searchQuery]);

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Clientes</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/more/customers/new')}
        >
          <Ionicons name="add" size={24} color={colors.neutral[0]} />
        </Pressable>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar cliente..."
        />
      </View>

      {/* Lista de clientes */}
      {filteredCustomers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No se encontraron clientes"
          description="Intenta con otros términos de búsqueda"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredCustomers.map((customer) => (
            <Pressable
              key={customer.id}
              style={styles.customerCard}
              onPress={() => router.push(`/more/customers/${customer.id}`)}
            >
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{customer.name}</Text>
                <View style={styles.customerContact}>
                  <Ionicons name="call-outline" size={14} color={colors.neutral[500]} />
                  <Text style={styles.customerPhone}>{customer.phone}</Text>
                </View>
                <View style={styles.customerContact}>
                  <Ionicons name="mail-outline" size={14} color={colors.neutral[500]} />
                  <Text style={styles.customerEmail}>{customer.email}</Text>
                </View>
              </View>
              <View style={styles.customerStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{customer.totalPurchases}</Text>
                  <Text style={styles.statLabel}>Compras</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{formatCurrency(customer.totalSpent)}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <StatusBadge
                  status={customer.status === 'active' ? 'success' : 'neutral'}
                  label={customer.status === 'active' ? 'Activo' : 'Inactivo'}
                />
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
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  customerCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  customerContact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  customerPhone: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginLeft: spacing.xs,
  },
  customerEmail: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginLeft: spacing.xs,
  },
  customerStats: {
    alignItems: 'flex-end',
  },
  statItem: {
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
