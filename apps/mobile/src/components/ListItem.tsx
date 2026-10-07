/**
 * ListItem — Elemento de lista
 *
 * Fila de lista con título, subtítulo y acción opcional.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii } from '../theme';

interface ListItemProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightText?: string;
  showBorder?: boolean;
  style?: ViewStyle;
}

export function ListItem({
  title,
  subtitle,
  onPress,
  leftIcon,
  rightIcon = 'chevron-forward',
  rightText,
  showBorder = true,
  style,
}: ListItemProps) {
  const Container = onPress ? Pressable : View;

  return (
    <Container
      style={[styles.container, showBorder && styles.border, style]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
    >
      {leftIcon && (
        <View style={styles.leftIconContainer}>
          <Ionicons name={leftIcon} size={24} color={colors.primary[600]} />
        </View>
      )}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {rightText && <Text style={styles.rightText}>{rightText}</Text>}
      {rightIcon && (
        <Ionicons name={rightIcon} size={20} color={colors.neutral[400]} />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  border: {
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  leftIconContainer: {
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  rightText: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginRight: spacing.sm,
    flexShrink: 1,
    textAlign: 'right',
  },
});
