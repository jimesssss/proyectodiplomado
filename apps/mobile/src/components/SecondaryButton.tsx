/**
 * SecondaryButton — Botón secundario
 *
 * Botón de acción secundaria con borde.
 */
import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, radii } from '../theme';

interface SecondaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  style,
  icon,
}: SecondaryButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
    >
      {icon}
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[300],
  },
  pressed: {
    backgroundColor: colors.neutral[50],
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: colors.neutral[700],
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    flexShrink: 1,
    textAlign: 'center',
  },
});
