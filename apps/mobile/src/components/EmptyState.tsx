/**
 * EmptyState — Estado vacío
 *
 * Muestra un mensaje cuando no hay datos.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
}

export function EmptyState({
  icon = 'folder-open-outline',
  title,
  description,
}: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={64} color={colors.neutral[300]} />
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
    marginTop: spacing.md,
    textAlign: 'center',
  },
  description: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
