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
      <View style={styles.icon}><Ionicons name={icon} size={32} color={colors.primary[600]} /></View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 68, height: 68, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[50] },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 25,
  },
  description: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 21,
    maxWidth: 480,
  },
});
