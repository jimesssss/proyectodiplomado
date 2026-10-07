import { createScreenStyles } from '../../../../theme/screen-styles';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ScreenContainer, SectionHeader, StatusBadge } from '../../../../components';
import { colors, radii, spacing, typography } from '../../../../theme';
import {
  listOrganizationsForIdDiagnostics,
  OrganizationApiError,
  type ApiOrgUnit,
} from '../../../../services/organization-api';

function messageForError(error: unknown): string {
  return error instanceof OrganizationApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'No se pudo completar la operación de organizaciones.';
}

export default function OrganizationsScreen() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<readonly ApiOrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrganizations(await listOrganizationsForIdDiagnostics());
    } catch (loadError) {
      setError(messageForError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copyId = async (id: string) => {
    try {
      await Clipboard.setStringAsync(id);
      Alert.alert('ID copiado', 'Se copió exactamente el ID recibido del API.');
    } catch {
      setError('No se pudo copiar el ID al portapapeles.');
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerAction}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Organizaciones</Text>
        <Pressable
          onPress={() => void refresh()}
          style={styles.headerAction}
          accessibilityLabel="Actualizar organizaciones"
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
              <SectionHeader title="Organizaciones registradas" />
              {organizations.length === 0 ? (
                <EmptyState
                  icon="business-outline"
                  title="No hay organizaciones"
                  description="Todavía no hay organizaciones registradas para tu negocio."
                />
              ) : (
                organizations.map((organization) => (
                  <View key={organization.id} style={styles.unitRow}>
                    <View style={styles.unitDetails}>
                      <Text style={styles.unitName}>{organization.name}</Text>
                      <Text style={styles.unitSubtext}>
                        {organization.code}
                      </Text>
                      <View style={styles.diagnostic}>
                        <Pressable
                          onPress={() => void copyId(organization.id)}
                          style={styles.copyButton}
                          accessibilityRole="button"
                        >
                          <Text style={styles.copyButtonText}>Copiar ID</Text>
                        </Pressable>
                      </View>
                    </View>
                    <StatusBadge
                      status={organization.status === 'active' ? 'success' : 'neutral'}
                      label={organization.status === 'active' ? 'Activo' : 'Archivado'}
                    />
                  </View>
                ))
              )}
            </View>
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
  helpText: {
    color: colors.neutral[600],
    fontSize: typography.size.sm,
    marginBottom: spacing.md,
  },
  diagnostic: {
    marginTop: spacing.sm,
  },
  diagnosticText: {
    color: colors.neutral[700],
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  copyButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary[600],
    borderRadius: radii.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  copyButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
});
