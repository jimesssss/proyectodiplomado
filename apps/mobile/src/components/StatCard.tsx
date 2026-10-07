/**
 * StatCard — Tarjeta de estadística
 *
 * Muestra un valor con etiqueta y color de fondo opcional.
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, typography, radii } from '../theme';

interface StatCardProps {
  label: string;
  value: string;
  backgroundColor?: string;
  valueColor?: string;
  style?: ViewStyle;
}

export function StatCard({
  label,
  value,
  backgroundColor = colors.surface,
  valueColor = colors.neutral[800],
  style,
}: StatCardProps) {
  return (
    <View style={[styles.container, { backgroundColor }, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[styles.value, { color: valueColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radii.xl,
    minWidth: 100,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    flexShrink: 1,
  },
});
