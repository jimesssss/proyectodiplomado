import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Proveedor Detalle — Ver detalle de proveedor
 *
 * Muestra toda la información de un proveedor.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatusBadge, SecondaryButton } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useSuppliersStore } from '../../../../stores/suppliersStore';

export default function SupplierDetailScreen() {
  useModuleRefresh(useSuppliersStore.getState().load, () => useSuppliersStore.getState().error);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getSupplierById } = useSuppliersStore();

  const supplier = getSupplierById(id || '');

  if (!supplier) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
          <Text style={styles.errorText}>Proveedor no encontrado</Text>
          <SecondaryButton
            title="Volver"
            onPress={() => router.back()}
            style={styles.backButton}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalle de Proveedor</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Información principal */}
        <View style={styles.section}>
          <Text style={styles.supplierName}>{supplier.name}</Text>
          <Text style={styles.supplierCompany}>{supplier.company}</Text>
          <View style={styles.statusRow}>
            <StatusBadge
              status={supplier.status === 'active' ? 'success' : 'neutral'}
              label={supplier.status === 'active' ? 'Activo' : 'Inactivo'}
            />
          </View>
        </View>

        {/* Detalles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información de Contacto</Text>
          <View style={styles.detailRow}>
            <Ionicons name="call-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>Teléfono</Text>
            <Text style={styles.detailValue}>{supplier.phone}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>Correo</Text>
            <Text style={styles.detailValue}>{supplier.email}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>Dirección</Text>
            <Text style={styles.detailValue}>{supplier.address}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={20} color={colors.neutral[500]} />
            <Text style={styles.detailLabel}>RFC</Text>
            <Text style={styles.detailValue}>{supplier.rfc}</Text>
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
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  supplierName: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  supplierCompany: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
    marginTop: spacing.xs,
  },
  statusRow: {
    marginTop: spacing.md,
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
    flex: 2,
    textAlign: 'right',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
