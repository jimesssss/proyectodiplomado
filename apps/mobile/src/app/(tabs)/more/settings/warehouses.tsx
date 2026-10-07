import { createScreenStyles } from '../../../../theme/screen-styles';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  EmptyState,
  PrimaryButton,
  ScreenContainer,
  SectionHeader,
  StatusBadge,
} from '../../../../components';
import { colors, radii, spacing, typography } from '../../../../theme';
import {
  createPrimaryWarehouse,
  listBranches,
  listWarehouses,
  OrganizationApiError,
  type ApiOrgUnit,
} from '../../../../services/organization-api';

function messageForError(error: unknown): string {
  if (error instanceof OrganizationApiError) {
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'No se pudo completar la operación de almacenes.';
}

export default function WarehousesScreen() {
  const router = useRouter();
  const [branches, setBranches] = useState<readonly ApiOrgUnit[]>([]);
  const [warehouses, setWarehouses] = useState<readonly ApiOrgUnit[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === 'active'),
    [branches],
  );
  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.status === 'active'),
    [warehouses],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedBranches, loadedWarehouses] = await Promise.all([
        listBranches(),
        listWarehouses(),
      ]);
      const nextActiveBranches = loadedBranches.filter((branch) => branch.status === 'active');
      setBranches(loadedBranches);
      setWarehouses(loadedWarehouses);
      setSelectedBranchId((currentId) => {
        if (currentId && nextActiveBranches.some((branch) => branch.id === currentId)) {
          return currentId;
        }
        return nextActiveBranches.length === 1 ? nextActiveBranches[0]?.id ?? null : null;
      });
    } catch (loadError) {
      setError(messageForError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (selectedBranchId === null || activeWarehouses.length > 0) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createPrimaryWarehouse(selectedBranchId);
      setWarehouses((current) => [
        created,
        ...current.filter((warehouse) => warehouse.id !== created.id),
      ]);
      Alert.alert(
        'Almacén creado',
        `${created.name} (${created.code}) quedó activo.\nID: ${created.id}`,
      );
    } catch (createError) {
      setError(messageForError(createError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Almacenes</Text>
        <Pressable onPress={() => void refresh()} style={styles.backButton} accessibilityLabel="Actualizar">
          <Ionicons name="refresh" size={22} color={colors.primary[600]} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <SectionHeader title="Almacenes registrados" />
              {warehouses.length === 0 ? (
                <EmptyState
                  icon="file-tray-outline"
                  title="No hay almacenes"
                  description="Crea el primer almacén activo para poder registrar existencias."
                />
              ) : (
                warehouses.map((warehouse) => (
                  <View key={warehouse.id} style={styles.unitRow}>
                    <View style={styles.unitDetails}>
                      <Text style={styles.unitName}>{warehouse.name}</Text>
                      <Text style={styles.unitSubtext}>
                        {warehouse.code} · {warehouse.id}
                      </Text>
                    </View>
                    <StatusBadge
                      status={warehouse.status === 'active' ? 'success' : 'neutral'}
                      label={warehouse.status === 'active' ? 'Activo' : 'Archivado'}
                    />
                  </View>
                ))
              )}
            </View>

            {activeWarehouses.length === 0 && (
              <View style={styles.section}>
                <SectionHeader title="Sucursal del almacén" />
                {activeBranches.length === 0 ? (
                  <EmptyState
                    icon="business-outline"
                    title="No hay sucursales activas"
                    description="El backend exige una sucursal activa para crear un almacén. No se puede crear desde el tenant sin esa unidad padre."
                  />
                ) : (
                  <>
                    <Text style={styles.helpText}>
                      El almacén debe pertenecer a una sucursal activa. Selecciona la sucursal correspondiente.
                    </Text>
                    {activeBranches.map((branch) => {
                      const selected = branch.id === selectedBranchId;
                      return (
                        <Pressable
                          key={branch.id}
                          onPress={() => setSelectedBranchId(branch.id)}
                          style={[styles.branchRow, selected && styles.branchRowSelected]}
                        >
                          <View style={styles.unitDetails}>
                            <Text style={styles.unitName}>{branch.name}</Text>
                            <Text style={styles.unitSubtext}>
                              {branch.code} · {branch.id}
                            </Text>
                          </View>
                          <Ionicons
                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={selected ? colors.primary[600] : colors.neutral[400]}
                          />
                        </Pressable>
                      );
                    })}
                    <Text style={styles.helpText}>
                      Se creará “Almacén principal” con código ALM-001. El backend lo marcará activo.
                    </Text>
                    <PrimaryButton
                      title="Crear almacén principal"
                      onPress={() => void handleCreate()}
                      loading={creating}
                      disabled={selectedBranchId === null}
                      style={styles.createButton}
                    />
                  </>
                )}
              </View>
            )}
          </>
        )}
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
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  loading: {
    padding: spacing.xxl,
  },
  error: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing.sm,
  },
  unitDetails: {
    flex: 1,
  },
  unitName: {
    color: colors.neutral[800],
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
  },
  unitSubtext: {
    color: colors.neutral[500],
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing.sm,
  },
  branchRowSelected: {
    borderColor: colors.primary[600],
  },
  helpText: {
    color: colors.neutral[600],
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  createButton: {
    marginTop: spacing.md,
  },
});
