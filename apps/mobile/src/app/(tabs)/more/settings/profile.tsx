import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useAuthStore } from '../../../../stores/authStore';
import { apiRequest } from '../../../../services/api-client';

export default function ProfileScreen() {
  const router = useRouter();
  const currentUser = useAuthStore(state => state.user);



  const [name, setName] = useState(currentUser?.name ?? '');
  const [email] = useState(currentUser?.email ?? '');

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName || !cleanEmail) {
      Alert.alert(
        'Campos incompletos',
        'Ingresa el nombre y el correo electrónico.'
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert(
        'Correo no válido',
        'Ingresa un correo electrónico válido.'
      );
      return;
    }

    try {
      await apiRequest('/auth/me', {method:'PATCH',body:{displayName:cleanName}});
      useAuthStore.setState(state=>({user:state.user?{...state.user,name:cleanName}:null}));
    } catch(error) { Alert.alert('No se pudo guardar',error instanceof Error?error.message:'Inténtalo nuevamente.'); return; }

    Alert.alert(
      'Perfil actualizado',
      'Los datos se guardaron correctamente.',
      [
        {
          text: 'Aceptar',
          onPress: () => router.back(),
        },
      ]
    );
  };

  if (!currentUser) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.neutral[800]}
            />
          </Pressable>

          <Text style={styles.headerTitle}>Editar perfil</Text>

          <View style={styles.placeholder} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons
            name="person-outline"
            size={48}
            color={colors.neutral[400]}
          />

          <Text style={styles.emptyText}>
            Usuario no encontrado
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.neutral[800]}
          />
        </Pressable>

        <Text style={styles.headerTitle}>Editar perfil</Text>

        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {name.trim()
                  ? name.trim().charAt(0).toUpperCase()
                  : 'U'}
              </Text>
            </View>

            <Text style={styles.profileName}>
              {name || 'Usuario'}
            </Text>

            <Text style={styles.profileRole}>
              {currentUser.roles.join(', ')}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>
            Información personal
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.label}>Nombre</Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Nombre"
                placeholderTextColor={colors.neutral[400]}
              />
            </View>

            <Text style={styles.label}>
              Correo electrónico
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={email}
                editable={false}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={colors.neutral[400]}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.label}>Rol</Text>

            <View style={styles.readOnlyContainer}>
              <Ionicons
                name="shield-checkmark-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <Text style={styles.readOnlyText}>
                Administrador
              </Text>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
            ]}
            onPress={handleSave}
          >
            <Ionicons
              name="save-outline"
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.saveButtonText}>
              Guardar cambios
            </Text>
          </Pressable>

          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>
              Cancelar
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

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

  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },

  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.xl,
    alignItems: 'center',
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

  profileName: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[900],
    textAlign: 'center',
  },

  profileRole: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },

  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
  },

  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[700],
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },

  input: {
    flex: 1,
    paddingVertical: spacing.md,
    marginLeft: spacing.sm,
    fontSize: typography.size.base,
    color: colors.neutral[800],
  },

  readOnlyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.neutral[50],
  },

  readOnlyText: {
    marginLeft: spacing.sm,
    fontSize: typography.size.base,
    color: colors.neutral[600],
  },

  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary[600],
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },

  saveButtonPressed: {
    opacity: 0.85,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },

  cancelButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },

  cancelButtonText: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyText: {
    marginTop: spacing.md,
    fontSize: typography.size.sm,
    color: colors.neutral[500],
  },
});