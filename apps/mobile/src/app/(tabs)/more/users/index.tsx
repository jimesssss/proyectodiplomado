import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Usuarios — Lista de usuarios
 *
 * Muestra todos los usuarios con sus roles.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, StatusBadge, EmptyState } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useUsersStore } from '../../../../stores/usersStore';

const ROLES: Record<string, { label: string; status: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  admin: { label: 'Administrador', status: 'error' },
  manager: { label: 'Gerente', status: 'warning' },
  cashier: { label: 'Cajero', status: 'info' },
  warehouse: { label: 'Almacén', status: 'success' },
};

export default function UsersScreen() {
  useModuleRefresh(useUsersStore.getState().load, () => useUsersStore.getState().error);
  const router = useRouter();
  const { users } = useUsersStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Usuarios</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar usuario..."
        />
      </View>

      {/* Lista de usuarios */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No se encontraron usuarios"
          description="Intenta con otros términos de búsqueda"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredUsers.map((user) => {
            const role = ROLES[user.role];
            return (
              <Pressable
                key={user.id}
                style={styles.userCard}
                onPress={() => router.push(`/more/users/${user.id}`)}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  {user.lastLogin && (
                    <Text style={styles.userLastLogin}>
                      Último acceso: {user.lastLogin}
                    </Text>
                  )}
                </View>
                <View style={styles.userStatus}>
                  <StatusBadge
                    status={role?.status || 'neutral'}
                    label={role?.label || user.role}
                  />
                  <StatusBadge
                    status={user.status === 'active' ? 'success' : 'neutral'}
                    label={user.status === 'active' ? 'Activo' : 'Inactivo'}
                  />
                </View>
              </Pressable>
            );
          })}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
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
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  userAvatarText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primary[700],
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  userEmail: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  userLastLogin: {
    fontSize: typography.size.xs,
    color: colors.neutral[400],
    marginTop: 2,
  },
  userStatus: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
