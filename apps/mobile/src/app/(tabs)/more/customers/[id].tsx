import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Cliente Detalle — Ver detalle de cliente
 *
 * Muestra toda la información de un cliente y su historial de compras.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatusBadge } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useCustomersStore } from '../../../../stores/customersStore';

export default function CustomerDetailScreen() {
  useModuleRefresh(useCustomersStore.getState().load, () => useCustomersStore.getState().error);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getCustomerById } = useCustomersStore();

  const customer = getCustomerById(id || '');

  if (!customer) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={styles.errorText}>Cliente no encontrado</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Volver</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalle de Cliente</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Información principal */}
        <View style={styles.section}>
          <Text style={styles.customerName}>{customer.name}</Text>
          <View style={styles.statusRow}>
            <StatusBadge
              status={customer.status === 'active' ? 'success' : 'neutral'}
              label={customer.status === 'active' ? 'Activo' : 'Inactivo'}
            />
          </View>
        </View>

        {/* Datos de contacto */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contacto</Text>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>Teléfono</Text>
            <Text style={styles.detailValue}>{customer.phone}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>Correo</Text>
            <Text style={styles.detailValue}>{customer.email}</Text>
          </View>
        </View>

        {/* Estadísticas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estadísticas</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{customer.totalPurchases}</Text>
              <Text style={styles.statLabel}>Compras</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{formatCurrency(customer.totalSpent)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>
        </View>

        {/* Historial de compras */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Última Compra</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Fecha</Text>
            <Text style={styles.detailValue}>{customer.lastPurchase || 'N/A'}</Text>
          </View>
        </View>

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
  placeholder: {
    width: 40,
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
  backButtonText: {
    fontSize: typography.size.base,
    color: colors.primary[600],
    fontWeight: typography.weight.medium,
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  customerName: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  statusRow: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  detailLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginLeft: spacing.sm,
    flex: 1,
  },
  detailValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.neutral[50],
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
