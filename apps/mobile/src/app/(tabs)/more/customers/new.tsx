import { createScreenStyles } from '../../../../theme/screen-styles';
/**
 * Nuevo Cliente — Registro de cliente
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { usePOSStore } from '../../../../stores/posStore';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useCustomersStore } from '../../../../stores/customersStore';
import { useAuditStore } from '../../../../stores/auditStore';

export default function NewCustomerScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { addCustomer } = useCustomersStore();
  const { addLog } = useAuditStore();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      Alert.alert(
        'Campo requerido',
        'Ingresa el nombre del cliente.'
      );
      return;
    }

    if (!cleanPhone) {
      Alert.alert(
        'Campo requerido',
        'Ingresa el teléfono del cliente.'
      );
      return;
    }

    if (!cleanEmail) {
      Alert.alert(
        'Campo requerido',
        'Ingresa el correo del cliente.'
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert(
        'Correo inválido',
        'Ingresa un correo electrónico válido.'
      );
      return;
    }

    const saved = await addCustomer({
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail,
      totalPurchases: 0,
      totalSpent: 0,
      status: 'active',
    });

    if (!saved) { Alert.alert('No se pudo guardar', useCustomersStore.getState().error ?? 'Inténtalo nuevamente.'); return; }
    // Registrar acción en Auditoría
    addLog({
      user: 'Admin',
      action: 'Cliente creado',
      module: 'Clientes',
      details: `Se registró el cliente "${cleanName}"`,
    });

    if (from === 'pos') {
      usePOSStore.getState().selectCustomer(saved.id);
      router.back();
      return;
    }

    Alert.alert(
      'Cliente registrado',
      'El cliente se agregó correctamente.',
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
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.intro}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="person-add-outline"
                size={28}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.introText}>
              <Text style={styles.title}>
                Nuevo cliente
              </Text>

              <Text style={styles.subtitle}>
                Ingresa los datos del cliente.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>
              Nombre completo
            </Text>

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
                placeholder="Ej. Laura Hernández"
                placeholderTextColor={colors.neutral[400]}
                autoCapitalize="words"
              />
            </View>

            <Text style={styles.label}>
              Teléfono
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="call-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Ej. 555-123-4567"
                placeholderTextColor={colors.neutral[400]}
                keyboardType="phone-pad"
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
                onChangeText={setEmail}
                placeholder="cliente@email.com"
                placeholderTextColor={colors.neutral[400]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.statusInfo}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={colors.success}
              />

              <View style={styles.statusTextContainer}>
                <Text style={styles.statusTitle}>
                  Cliente activo
                </Text>

                <Text style={styles.statusDescription}>
                  Los clientes nuevos se registran inicialmente como activos.
                </Text>
              </View>
            </View>
          </View>

          <Pressable
            style={styles.saveButton}
            onPress={handleSave}
          >
            <Ionicons
              name="save-outline"
              size={20}
              color={colors.neutral[0]}
            />

            <Text style={styles.saveButtonText}>
              Guardar cliente
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

const styles = createScreenStyles({
  container: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },

  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  introText: {
    flex: 1,
  },

  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },

  subtitle: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radii.lg,
    padding: spacing.lg,
  },

  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[700],
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  inputContainer: {
    minHeight: 48,
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
    marginLeft: spacing.sm,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    paddingVertical: spacing.sm,
  },

  statusInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.neutral[50],
  },

  statusTextContainer: {
    flex: 1,
    marginLeft: spacing.sm,
  },

  statusTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },

  statusDescription: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
    lineHeight: 18,
  },

  saveButton: {
    minHeight: 50,
    backgroundColor: colors.primary[600],
    borderRadius: radii.md,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  saveButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },

  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },

  cancelButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
  },
});
