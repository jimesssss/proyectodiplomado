/**
 * SectionHeader — Encabezado de sección
 *
 * Título de sección con acción opcional a la derecha.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface SectionHeaderProps {
  title: string;
  actionText?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionText, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {actionText && onAction && (
        <Pressable onPress={onAction}>
          <Text style={styles.action}>{actionText}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  action: {
    fontSize: typography.size.sm,
    color: colors.primary[600],
    fontWeight: typography.weight.medium,
  },
});
