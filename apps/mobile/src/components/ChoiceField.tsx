import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SearchBar } from './SearchBar';
import { EmptyState } from './EmptyState';
import { colors, spacing, radii } from '../theme';
export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}
export function ChoiceField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange(value: string): void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        (o.label + ' ' + (o.description ?? ''))
          .toLocaleLowerCase('es-MX')
          .includes(search.toLocaleLowerCase('es-MX'))
      ),
    [options, search]
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((o) => o.value === value)?.label ?? 'Seleccionar'}`}
        onPress={() => {
          setSearch('');
          setOpen(true);
        }}
        style={[styles.trigger, disabled && { opacity: 0.5 }]}
      >
        <Text style={styles.value}>
          {options.find((o) => o.value === value)?.label ?? 'Seleccionar'}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.primary[600]} />
      </Pressable>
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.panel}>
            <View style={styles.heading}>
              <Text style={styles.title}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar selección"
                style={styles.close}
                onPress={() => setOpen(false)}
              >
                <Ionicons name="close" size={24} color={colors.neutral[700]} />
              </Pressable>
            </View>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder={`Buscar ${label.toLocaleLowerCase('es-MX')}`}
            />
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={12}
              windowSize={5}
              contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}
              ListEmptyComponent={
                <EmptyState
                  title="No hay coincidencias"
                  description="Prueba con otro término de búsqueda."
                />
              }
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === item.value }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.option, value === item.value && styles.selected]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.value}>{item.label}</Text>
                    {item.description && <Text style={styles.description}>{item.description}</Text>}
                  </View>
                  {value === item.value && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary[600]} />
                  )}
                </Pressable>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.neutral[700],
    marginBottom: 6,
  },
  trigger: {
    minHeight: 48,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  value: { fontSize: 16, lineHeight: 23, color: colors.neutral[800], flexShrink: 1, flex: 1 },
  modal: { flex: 1, backgroundColor: colors.background },
  panel: {
    flex: 1,
    padding: spacing.lg,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { maxWidth: 720 } : {}),
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.neutral[800], flexShrink: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  option: {
    minHeight: 64,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: 16,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  selected: { backgroundColor: colors.primary[50], borderColor: colors.primary[600] },
  description: { fontSize: 14, lineHeight: 20, color: colors.neutral[600], marginTop: 4 },
});
