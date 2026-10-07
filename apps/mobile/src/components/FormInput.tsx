/**
 * FormInput — Input de formulario
 *
 * Campo de texto con etiqueta y manejo de errores.
 */
import React, { useState } from 'react';
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
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, focused ? styles.inputFocused : undefined, error ? styles.inputError : undefined, style]}
        placeholderTextColor={colors.neutral[400]}
        {...props}
        onFocus={event => { setFocused(true); props.onFocus?.(event); }}
        onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      />
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
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
    minHeight: 48,
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
  inputFocused: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  error: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },
});
