import { DataState } from '../../../../components/DataState';
import { AppHeader } from '../../../../components/AppHeader';
import { createScreenStyles } from '../../../../theme/screen-styles';
import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useUsersStore } from '../../../../stores/usersStore';

export default function UserDetailScreen() {
  useModuleRefresh(useUsersStore.getState().load, () => useUsersStore.getState().error);
  const loading = useUsersStore(state => state.isLoading);
  const loadError = useUsersStore(state => state.error);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getUserById } = useUsersStore();

  const user = getUserById(id || '');

  const roleLabels: Record<string, string> = {
    owner: 'Propietario',
    admin: 'Administrador',
    manager: 'Gerente',
    cashier: 'Cajero',
    warehouse: 'Almacén',
  };

  const statusLabels = {
    active: 'Activo',
    inactive: 'Inactivo',
  };

  if (loading || loadError) return <ScreenContainer><AppHeader title="Detalle de usuario" onBack={() => router.back()} /><DataState loading={loading} error={loadError} /></ScreenContainer>;

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.neutral[800]}
            />
          </Pressable>

          <Text style={styles.headerTitle}>Detalle del usuario</Text>

          <View style={styles.placeholder} />
        </View>

        <View style={styles.notFound}>
          <Ionicons
            name="person-outline"
            size={50}
            color={colors.neutral[400]}
          />
          <Text style={styles.notFoundText}>Usuario no encontrado</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.neutral[800]}
          />
        </Pressable>

        <Text style={styles.headerTitle}>Detalle del usuario</Text>

        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.name.charAt(0).toUpperCase()}
            </Text>
          </View>

          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.email}>{user.email}</Text>

          <View
            style={[
              styles.statusBadge,
              user.status === 'active'
                ? styles.activeBadge
                : styles.inactiveBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                user.status === 'active'
                  ? styles.activeText
                  : styles.inactiveText,
              ]}
            >
              {statusLabels[user.status]}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Información del usuario</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Nombre</Text>
              <Text style={styles.infoValue}>{user.name}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Correo electrónico</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Rol</Text>
              <Text style={styles.infoValue}>
                {(roleLabels[user.role] ?? user.role)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="time-outline"
                size={20}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Último acceso</Text>
              <Text style={styles.infoValue}>
                {user.lastLogin || 'Sin registro'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Estado</Text>
              <Text style={styles.infoValue}>
                {statusLabels[user.status]}
              </Text>
            </View>
          </View>
        </View>
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

  placeholder: {
    width: 40,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },

  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing.xl,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  avatarText: {
    fontSize: 28,
    fontWeight: typography.weight.semibold,
    color: colors.primary[600],
  },

  name: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[900],
    textAlign: 'center',
  },

  email: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  statusBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },

  activeBadge: {
    backgroundColor: '#EAF5EF',
  },

  inactiveBadge: {
    backgroundColor: colors.neutral[200],
  },

  statusText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },

  activeText: {
    color: '#047857',
  },

  inactiveText: {
    color: colors.neutral[600],
  },

  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    paddingHorizontal: spacing.lg,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },

  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  infoContent: {
    flex: 1,
    minWidth: 0,
  },

  infoLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginBottom: 2,
  },

  infoValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
    flexShrink: 1,
  },

  divider: {
    height: 1,
    backgroundColor: colors.neutral[100],
  },

  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notFoundText: {
    marginTop: spacing.md,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
});
