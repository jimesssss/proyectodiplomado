/**
 * AppHeader — Encabezado de pantalla
 *
 * Muestra título, subtítulo y acciones opcionales.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
}

export function AppHeader({ title, subtitle, onBack, rightAction }: AppHeaderProps) {
  return (
    <View style={styles.container}>
      {onBack && (
        <Pressable onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
      )}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {rightAction && (
        <Pressable onPress={rightAction.onPress} style={styles.actionButton}>
          <Ionicons name={rightAction.icon} size={24} color={colors.neutral[800]} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  backButton: {
    marginRight: spacing.md,
    padding: spacing.xs,
  },
  titleContainer: {
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
    marginTop: 2,
  },
  actionButton: {
    padding: spacing.xs,
  },
});
