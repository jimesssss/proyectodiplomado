/**
 * ModuleCard — Tarjeta de módulo
 *
 * Tarjeta clicable para acceder a módulos.
 */
import React from 'react';
import { View, Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii } from '../theme';

interface ModuleCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  description?: string;
  style?: ViewStyle;
}

export function ModuleCard({
  title,
  icon,
  onPress,
  description,
  style,
}: ModuleCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
        style,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={icon} size={28} color={colors.primary[600]} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[200],
    minHeight: 100,
  },
  pressed: {
    backgroundColor: colors.neutral[50],
  },
  iconContainer: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    textAlign: 'center',
  },
  description: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
