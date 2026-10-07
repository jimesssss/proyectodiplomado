/**
 * ScreenContainer — Contenedor base para pantallas
 *
 * Proporciona SafeAreaView y ScrollView con estilo consistente.
 */
import React from 'react';
import { Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { DataState } from './DataState';

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  refreshControl?: React.ReactElement;
  loading?: boolean;
  error?: string | null;
}

export function ScreenContainer({
  children,
  scrollable = true,
  style,
  contentContainerStyle,
  refreshControl,
  loading,
  error,
}: ScreenContainerProps) {
  const elements = React.Children.toArray(children);
  const visible = loading || error ? elements.slice(0, 1) : elements;
  const content = <>{visible[0]}<DataState loading={loading} error={error} />{visible.slice(1)}</>;
  if (!scrollable) {
    return (
      <SafeAreaView style={[styles.container, style]}>
        <View style={[styles.content, contentContainerStyle]}>{content}</View>
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
        {content}
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
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { maxWidth: 1200, minWidth: 0 } : {}),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { maxWidth: 1200, minWidth: 0 } : {}),
  },
});
