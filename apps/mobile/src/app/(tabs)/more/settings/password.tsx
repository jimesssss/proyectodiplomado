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

export default function ChangePasswordScreen() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(
        'Campos incompletos',
        'Completa todos los campos.'
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        'Contraseña muy corta',
        'La nueva contraseña debe tener al menos 6 caracteres.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Las contraseñas no coinciden',
        'Confirma nuevamente la nueva contraseña.'
      );
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        'Contraseña no válida',
        'La nueva contraseña debe ser diferente a la actual.'
      );
      return;
    }

    /*
     * Actualmente el ERP trabaja con datos mock.
     * Cuando conectemos la autenticación con la API,
     * aquí enviaremos la contraseña al backend.
     */

    Alert.alert(
      'Contraseña actualizada',
      'La contraseña se cambió correctamente.',
      [
        {
          text: 'Aceptar',
          onPress: () => router.back(),
        },
      ]
    );
  };

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

        <Text style={styles.headerTitle}>
          Cambiar contraseña
        </Text>

        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons
                name="key-outline"
                size={34}
                color={colors.primary[600]}
              />
            </View>

            <Text style={styles.title}>
              Cambia tu contraseña
            </Text>

            <Text style={styles.description}>
              Ingresa tu contraseña actual y crea una nueva
              contraseña para proteger tu cuenta.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>
              Contraseña actual
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Contraseña actual"
                placeholderTextColor={colors.neutral[400]}
                secureTextEntry={!showCurrent}
                autoCapitalize="none"
              />

              <Pressable
                onPress={() => setShowCurrent(!showCurrent)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showCurrent ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.neutral[500]}
                />
              </Pressable>
            </View>

            <Text style={styles.label}>
              Nueva contraseña
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nueva contraseña"
                placeholderTextColor={colors.neutral[400]}
                secureTextEntry={!showNew}
                autoCapitalize="none"
              />

              <Pressable
                onPress={() => setShowNew(!showNew)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showNew ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.neutral[500]}
                />
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              Mínimo 6 caracteres.
            </Text>

            <Text style={styles.label}>
              Confirmar nueva contraseña
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repite la nueva contraseña"
                placeholderTextColor={colors.neutral[400]}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
              />

              <Pressable
                onPress={() => setShowConfirm(!showConfirm)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.neutral[500]}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
            ]}
            onPress={handleChangePassword}
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.saveButtonText}>
              Cambiar contraseña
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

  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },

  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[900],
    textAlign: 'center',
  },

  description: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    textAlign: 'center',
    lineHeight: 20,
  },

  card: {
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

  eyeButton: {
    padding: spacing.xs,
  },

  helperText: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
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
});