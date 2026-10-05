/**
 * Nueva Compra — Formulario visual
 *
 * Formulario para crear una nueva orden de compra.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, FormInput, PrimaryButton, SecondaryButton } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';

export default function NewPurchaseScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    supplier: '',
    expectedDate: '',
    notes: '',
  });

  const handleSubmit = () => {
    // Mock: guardar compra
    router.back();
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Nueva Compra</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <FormInput
            label="Proveedor"
            value={formData.supplier}
            onChangeText={(text) => setFormData({ ...formData, supplier: text })}
            placeholder="Seleccionar proveedor"
            required
          />

          <FormInput
            label="Fecha esperada"
            value={formData.expectedDate}
            onChangeText={(text) => setFormData({ ...formData, expectedDate: text })}
            placeholder="DD/MM/AAAA"
          />

          <FormInput
            label="Notas"
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            placeholder="Notas adicionales"
            multiline
            numberOfLines={4}
          />

          <View style={styles.buttonContainer}>
            <SecondaryButton
              title="Cancelar"
              onPress={() => router.back()}
              style={styles.cancelButton}
            />
            <PrimaryButton
              title="Guardar"
              onPress={handleSubmit}
              style={styles.saveButton}
            />
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
  form: {
    padding: spacing.lg,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
