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
  ensurePrimaryCompany,
  listOrganizations,
  listCompanies,
  OrganizationApiError,
  type ApiOrgUnit,
} from '../../../../services/organization-api';

function messageForError(error: unknown): string {
  return error instanceof OrganizationApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'No se pudo completar la operación de empresas.';
}

export default function CompaniesScreen() {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState('');
  const [organizations, setOrganizations] = useState<readonly ApiOrgUnit[]>([]);
  const [companies, setCompanies] = useState<readonly ApiOrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companiesForOrganization = useMemo(
    () => companies.filter((company) => company.parentId === organizationId),
    [companies, organizationId]
  );
  const activeCompanies = useMemo(
    () => companiesForOrganization.filter((company) => company.status === 'active'),
    [companiesForOrganization]
  );
  const primaryCodeAlreadyUsed = useMemo(
    () => companies.some((company) => company.code === 'ERP-SC'),
    [companies]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [realCompanies, realOrganizations] = await Promise.all([listCompanies(), listOrganizations()]);
      setCompanies(realCompanies); setOrganizations(realOrganizations.filter(o => o.status === 'active'));
      setOrganizationId(previous => realOrganizations.some(o => o.id === previous && o.status === 'active') ? previous : realOrganizations.find(o => o.status === 'active')?.id ?? '');
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
    if (!organizationId) { Alert.alert('Organización requerida', 'Selecciona una organización activa.'); return; }
    if (activeCompanies.length > 0 || primaryCodeAlreadyUsed) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await ensurePrimaryCompany(organizationId);
      setCompanies((currentCompanies) => [
        result.company,
        ...currentCompanies.filter((company) => company.id !== result.company.id),
      ]);
      Alert.alert(
        result.created ? 'Empresa creada' : 'Empresa existente',
        `${result.company.name} (${result.company.code}) · ${result.company.status}\nOrganización padre: ${result.company.parentId}\nID: ${result.company.id}`
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
        <Text style={styles.headerTitle}>Empresas</Text>
        <Pressable
          onPress={() => void refresh()}
          style={styles.headerAction}
          accessibilityLabel="Actualizar empresas"
        >
          <Ionicons name="refresh" size={22} color={colors.primary[600]} />
        </Pressable>
      </View>

      <View style={{padding:12}}><Text>Organización</Text><ScrollView horizontal>{organizations.map(o=><Pressable key={o.id} onPress={()=>setOrganizationId(o.id)}><Text style={{padding:10,color:organizationId===o.id?colors.primary[600]:colors.neutral[700]}}>{o.name}</Text></Pressable>)}</ScrollView></View>
      <ScrollView contentContainerStyle={styles.content}>
        {error && <Text style={styles.error}>{error}</Text>}
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <SectionHeader title="Empresas del tenant" />
              {companies.length === 0 ? (
                <EmptyState
                  icon="business-outline"
                  title="No hay empresas"
                  description="No se encontraron empresas reales en el tenant."
                />
              ) : (
                companies.map((company) => {
                  const belongsToCurrentOrganization = company.parentId === organizationId;
                  return (
                    <View key={company.id} style={styles.unitRow}>
                      <View style={styles.unitDetails}>
                        <Text style={styles.unitName}>{company.name}</Text>
                        <Text style={styles.unitSubtext}>
                          {company.code} · {company.id}
                        </Text>
                        <Text style={styles.parentText}>
                          {belongsToCurrentOrganization
                            ? 'Organización ERP-SC'
                            : `Otra organización · ${company.parentId ?? 'sin padre'}`}
                        </Text>
                      </View>
                      <StatusBadge
                        status={company.status === 'active' ? 'success' : 'neutral'}
                        label={company.status === 'active' ? 'Activo' : 'Archivado'}
                      />
                    </View>
                  );
                })
              )}
            </View>

            {activeCompanies.length > 0 ? (
              <Text style={styles.helpText}>
                Ya existe una empresa activa bajo la organización ERP-SC. No se creará otra.
              </Text>
            ) : primaryCodeAlreadyUsed ? (
              <Text style={styles.helpText}>
                El código ERP-SC ya está utilizado por otra empresa del tenant. No se enviará una
                creación duplicada.
              </Text>
            ) : (
              <View style={styles.section}>
                <SectionHeader title="Primera empresa de ERP-SC" />
                <Text style={styles.helpText}>
                  Se creará ERP-SC con código ERP-SC bajo la organización activa confirmada. El
                  backend asignará el estado activo y obtendrá el tenant de la sesión.
                </Text>
                <Text style={styles.parentText}>Organización padre: {organizationId}</Text>
                <PrimaryButton
                  title="Crear empresa ERP-SC"
                  onPress={() => void handleCreate()}
                  loading={creating}
                  style={styles.createButton}
                />
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
  parentText: {
    color: colors.neutral[600],
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
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
