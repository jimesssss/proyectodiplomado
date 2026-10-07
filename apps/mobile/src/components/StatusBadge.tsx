/**
 * StatusBadge — Insignia de estado
 *
 * Muestra un estado con colores predefinidos.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { typography, radii } from '../theme';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
}

const STATUS_COLORS: Record<StatusType, { bg: string; text: string }> = {
  success: { bg: '#EAF5EF', text: '#21634E' },
  warning: { bg: '#FFF3DA', text: '#80530C' },
  error: { bg: '#FCECEF', text: '#992C3A' },
  info: { bg: '#EAF3F4', text: '#285662' },
  neutral: { bg: '#F4EFEC', text: '#5D5360' },
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
    borderRadius: radii.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontWeight: typography.weight.medium,
  },
});
