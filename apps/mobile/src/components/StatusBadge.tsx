/**
 * StatusBadge — Insignia de estado
 *
 * Muestra un estado con colores predefinidos.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, radii } from '../theme';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
}

const STATUS_COLORS: Record<StatusType, { bg: string; text: string }> = {
  success: { bg: '#D1FAE5', text: '#065F46' },
  warning: { bg: '#FEF3C7', text: '#92400E' },
  error: { bg: '#FEE2E2', text: '#991B1B' },
  info: { bg: '#DBEAFE', text: '#1E40AF' },
  neutral: { bg: '#F3F4F6', text: '#4B5563' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const colorScheme = STATUS_COLORS[status];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colorScheme.bg },
      ]}
    >
      <Text style={[styles.text, { color: colorScheme.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
});
