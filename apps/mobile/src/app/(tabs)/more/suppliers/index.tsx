import { createScreenStyles } from '../../../../theme/screen-styles';
import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Proveedores — Lista de proveedores
 *
 * Muestra todos los proveedores con buscador.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, StatusBadge, EmptyState } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useSuppliersStore } from '../../../../stores/suppliersStore';
import { useAuthStore } from '../../../../stores/authStore';

export default function SuppliersScreen() {
  useModuleRefresh(useSuppliersStore.getState().load, () => useSuppliersStore.getState().error);
  const router = useRouter();
  const { suppliers } = useSuppliersStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplier.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [suppliers, searchQuery]);

  return (
    <ScreenContainer loading={useSuppliersStore(state => state.isLoading)} error={useSuppliersStore(state => state.error)}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Proveedores</Text>
        {useAuthStore(state=>state.can('supplier:create'))&&<Pressable accessibilityRole="button" accessibilityLabel="Nuevo proveedor" style={styles.addButton} onPress={()=>router.push('/more/suppliers/new')}><Ionicons name="add" size={24} color={colors.primary[600]}/></Pressable>}
        {/* Pendiente: implementar pantalla de nuevo proveedor */}
        {/* <Pressable
          style={styles.addButton}
          onPress={() => router.push('/more/suppliers/new')}
        >
          <Ionicons name="add" size={24} color={colors.primary[600]} />
        </Pressable> */}
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar proveedor..."
        />
      </View>

      {/* Lista de proveedores */}
      {filteredSuppliers.length === 0 ? (
        <EmptyState
          icon="business-outline"
          title="No se encontraron proveedores"
          description="Intenta con otros términos de búsqueda"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredSuppliers.map((supplier) => (
            <Pressable
              key={supplier.id}
              style={styles.supplierCard}
              onPress={() => router.push(`/more/suppliers/${supplier.id}`)}
            >
              <View style={styles.supplierInfo}>
                <Text style={styles.supplierName}>{supplier.name}</Text>
                {supplier.company!==supplier.name&&<Text style={styles.supplierCompany}>{supplier.company}</Text>}
                <View style={styles.supplierContact}>
                  <Ionicons name="call-outline" size={14} color={colors.neutral[500]} />
                  <Text style={styles.supplierPhone}>{supplier.phone}</Text>
                </View>
                <View style={styles.supplierContact}>
                  <Ionicons name="mail-outline" size={14} color={colors.neutral[500]} />
                  <Text style={styles.supplierEmail}>{supplier.email}</Text>
                </View>
              </View>
              <View style={styles.supplierStatus}>
                <StatusBadge
                  status={supplier.status === 'active' ? 'success' : 'neutral'}
                  label={supplier.status === 'active' ? 'Activo' : 'Inactivo'}
                />
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.neutral[400]}
                  style={styles.chevron}
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
  addButton: {
    padding: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  supplierCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  supplierCompany: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginTop: 2,
  },
  supplierContact: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  supplierPhone: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginLeft: spacing.xs,
  },
  supplierEmail: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginLeft: spacing.xs,
  },
  supplierStatus: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  chevron: {
    marginTop: spacing.sm,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
