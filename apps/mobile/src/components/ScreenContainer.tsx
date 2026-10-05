/**
 * ScreenContainer — Contenedor base para pantallas
 *
 * Proporciona SafeAreaView y ScrollView con estilo consistente.
 */
import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  refreshControl?: React.ReactElement;
}

export function ScreenContainer({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  refreshControl,
}: ScreenContainerProps) {
  if (!scrollable) {
    return (
      <SafeAreaView style={[styles.container, style]}>
        <View style={[styles.content, contentContainerStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, style]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
