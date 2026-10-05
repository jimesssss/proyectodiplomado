/**
 * Reportes — Módulo de Reportes
 *
 * Muestra tarjetas de reportes y gráficas simples (mock visual).
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, ModuleCard } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useReportsStore } from '../../../../stores/reportsStore';

export default function ReportsScreen() {
  const router = useRouter();
  const { reportCards, salesByDay, topProducts } = useReportsStore();

  const maxValue = Math.max(...salesByDay.map((d) => d.value));
  const maxProductValue = Math.max(...topProducts.map((p) => p.value));

  const handleReportPress = (reportId: string) => {
  switch (reportId) {
    case '1':
      router.push('/more/sales');
      break;

    case '2':
      router.push('/products');
      break;

    case '3':
      router.push('/inventory');
      break;

    case '4':
      router.push('/more/purchases');
      break;

    case '5':
      router.push('/more/expenses');
      break;

    case '6':
      router.push('/more/customers');
      break;
  }
};

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Reportes</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Tarjetas de reportes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reportes Disponibles</Text>
          <View style={styles.cardsGrid}>
            {reportCards.map((card) => (
              <ModuleCard
                key={card.id}
                title={card.title}
                icon={card.icon as any}
                onPress={() => handleReportPress(card.id)}
                description={card.description}
                style={styles.reportCard}
              />
            ))}
          </View>
        </View>

        {/* Gráfica de ventas por día */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ventas por Día</Text>
          <View style={styles.chartContainer}>
            <View style={styles.chart}>
              {salesByDay.map((item, index) => (
                <View key={index} style={styles.barContainer}>
                  <View style={styles.barWrapper}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: (item.value / maxValue) * 120,
                          backgroundColor: colors.primary[500],
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Productos más vendidos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Productos Más Vendidos</Text>
          <View style={styles.chartContainer}>
            {topProducts.map((product, index) => (
              <View key={index} style={styles.progressItem}>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressLabel}>{product.label}</Text>
                  <Text style={styles.progressValue}>{product.value}</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${(product.value / maxProductValue) * 100}%`,
                        backgroundColor: colors.primary[500],
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  reportCard: {
    width: '48%',
    marginHorizontal: '1%',
    marginBottom: spacing.sm,
  },
  chartContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
  },
  barWrapper: {
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 24,
    borderRadius: radii.sm,
  },
  barLabel: {
    fontSize: typography.size.xs,
    color: colors.neutral[600],
    marginTop: spacing.xs,
  },
  progressItem: {
    marginBottom: spacing.md,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[700],
  },
  progressValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.neutral[100],
    borderRadius: radii.full,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: radii.full,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
