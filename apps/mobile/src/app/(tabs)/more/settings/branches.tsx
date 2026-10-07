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
  createPrimaryBranch,
  listBranches,
  listCompanies,
  OrganizationApiError,
  type ApiOrgUnit,
} from '../../../../services/organization-api';

function messageForError(error: unknown): string {
  return error instanceof OrganizationApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'No se pudo completar la operación de sucursales.';
}

export default function BranchesScreen() {
  const router = useRouter();
  const [companies, setCompanies] = useState<readonly ApiOrgUnit[]>([]);
  const [branches, setBranches] = useState<readonly ApiOrgUnit[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCompanies = useMemo(
    () => companies.filter((company) => company.status === 'active'),
    [companies],
  );
  const activeBranches = useMemo(
    () => branches.filter((branch) => branch.status === 'active'),
    [branches],
  );
  const primaryCodeAlreadyUsed = useMemo(
    () => branches.some((branch) => branch.code === 'SUC-001'),
    [branches],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedCompanies, loadedBranches] = await Promise.all([
        listCompanies(),
        listBranches(),
      ]);
      const loadedActiveCompanies = loadedCompanies.filter(
        (company) => company.status === 'active',
      );
      setCompanies(loadedCompanies);
      setBranches(loadedBranches);
      setSelectedCompanyId((currentId) => {
        if (currentId && loadedActiveCompanies.some((company) => company.id === currentId)) {
          return currentId;
        }
        return loadedActiveCompanies.length === 1
          ? loadedActiveCompanies[0]?.id ?? null
          : null;
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
    if (
      selectedCompanyId === null ||
      activeBranches.length > 0 ||
      primaryCodeAlreadyUsed
    ) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createPrimaryBranch(selectedCompanyId);
      setBranches((current) => [
        created,
        ...current.filter((branch) => branch.id !== created.id),
      ]);
      Alert.alert(
        'Sucursal creada',
        `${created.name} (${created.code}) quedó activa.\nID: ${created.id}`,
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
        <Pressable onPress={() => router.back()} style={styles.headerAction}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Sucursales</Text>
        <Pressable
          onPress={() => void refresh()}
          style={styles.headerAction}
          accessibilityLabel="Actualizar sucursales"
        >
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
              <SectionHeader title="Sucursales registradas" />
              {branches.length === 0 ? (
                <EmptyState
                  icon="business-outline"
                  title="No hay sucursales"
                  description="Crea la primera sucursal activa para continuar con la configuración del almacén."
                />
              ) : (
                branches.map((branch) => (
                  <View key={branch.id} style={styles.unitRow}>
                    <View style={styles.unitDetails}>
                      <Text style={styles.unitName}>{branch.name}</Text>
                      <Text style={styles.unitSubtext}>
                        {branch.code} · {branch.id}
                      </Text>
                    </View>
                    <StatusBadge
                      status={branch.status === 'active' ? 'success' : 'neutral'}
                      label={branch.status === 'active' ? 'Activo' : 'Archivado'}
                    />
                  </View>
                ))
              )}
            </View>

            {activeBranches.length === 0 && (
              <View style={styles.section}>
                <SectionHeader title="Empresa de la sucursal" />
                {activeCompanies.length === 0 ? (
                  <EmptyState
                    icon="business-outline"
                    title="No hay empresas activas"
                    description="El contrato del backend exige crear cada sucursal bajo una empresa activa. No permite crearla directamente bajo el tenant."
                  />
                ) : primaryCodeAlreadyUsed ? (
                  <Text style={styles.helpText}>
                    El código SUC-001 ya está utilizado por una sucursal archivada. El backend no permite reutilizarlo; no se enviará una creación duplicada.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.helpText}>
                      Elige la empresa activa a la que pertenecerá la sucursal.
                    </Text>
                    {activeCompanies.map((company) => {
                      const selected = company.id === selectedCompanyId;
                      return (
                        <Pressable
                          key={company.id}
                          onPress={() => setSelectedCompanyId(company.id)}
                          style={[styles.companyRow, selected && styles.companyRowSelected]}
                        >
                          <View style={styles.unitDetails}>
                            <Text style={styles.unitName}>{company.name}</Text>
                            <Text style={styles.unitSubtext}>
                              {company.code} · {company.id}
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
                      Se creará “Sucursal principal” con código SUC-001. El backend la marcará activa.
                    </Text>
                    <PrimaryButton
                      title="Crear sucursal principal"
                      onPress={() => void handleCreate()}
                      loading={creating}
                      disabled={selectedCompanyId === null}
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
  headerAction: {
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
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing.sm,
  },
  companyRowSelected: {
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
