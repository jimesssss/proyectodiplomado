/**
 * PrimaryButton — Botón principal
 *
 * Botón de acción primaria con estado de carga.
 */
import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, spacing, typography, radii } from '../theme';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
}

export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  icon,
}: PrimaryButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={colors.neutral[0]} />
      ) : (
        <>
          {icon}
          <Text style={styles.text}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pressed: {
    backgroundColor: colors.primary[700],
    opacity: 0.9,
  },
  disabled: {
    backgroundColor: colors.neutral[300],
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    color: colors.neutral[0],
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
});
