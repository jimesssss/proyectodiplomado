/**
 * SearchBar — Barra de búsqueda
 *
 * Input de búsqueda con icono y botón de limpiar.
 */
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radii } from '../theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Buscar...',
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.container, focused && styles.focused]}>
      <Ionicons
        name="search-outline"
        size={20}
        color={colors.neutral[400]}
        style={styles.icon}
      />
      <TextInput
        accessibilityLabel={placeholder}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.neutral[400]}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => onChangeText('')} style={styles.clearButton}>
          <Ionicons name="close-circle" size={20} color={colors.neutral[400]} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  focused: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    minHeight: 48,
    minWidth: 0,
    flex: 1,
    paddingVertical: spacing.sm + 4,
    fontSize: typography.size.base,
    color: colors.neutral[800],
  },
  clearButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
});
