/**
 * FormInput — Input de formulario
 *
 * Campo de texto con etiqueta y manejo de errores.
 */
import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, spacing, typography, radii } from '../theme';

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string;
  required?: boolean;
}

export function FormInput({
  label,
  error,
  required = false,
  style,
  ...props
}: FormInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.neutral[400]}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.error,
  },
  error: {
    color: colors.error,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
});
