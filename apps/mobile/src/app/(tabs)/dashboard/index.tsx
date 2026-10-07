import { createScreenStyles } from '../../../theme/screen-styles';
/**
 * Dashboard — Pantalla principal
 *
 * Muestra resumen de ventas, productos top y ventas recientes.
 * Diseñado para una dulcería con jerarquía visual clara.
 */
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, typography, radii } from '../../../theme';
import { useAuthStore } from '../../../stores/authStore';
import { useDashboardStore } from '../../../stores/dashboardStore';
import { useSalesStore } from '../../../stores/salesStore';
import { DataState } from '../../../components/DataState';
import { StatCard } from '../../../components/StatCard';
import { DashboardOperations } from '../../../components/DashboardOperations';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { salesSummary, topProducts, recentSales, isLoading, refresh } =
    useDashboardStore();
  const error = useSalesStore(state => state.error);

  useEffect(() => {
    refresh();
  }, []);

  const handleLogout = () => {
    logout();
    router.replace('/welcome');
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>Hola, {user?.name || 'Usuario'}</Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color={colors.neutral[600]} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} />
        }
      >
        <DataState loading={isLoading} error={error} />
        {/* Resumen de ventas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ventas de tu dulcería · MXN</Text>
          <View style={styles.summaryGrid}>
            <StatCard label="Ventas del día" value={isLoading || error ? '—' : formatCurrency(salesSummary.today)} backgroundColor={colors.primary[50]} valueColor={colors.primary[700]} style={styles.summaryCard} />
            <StatCard label="Esta semana" value={isLoading || error ? '—' : formatCurrency(salesSummary.week)} style={styles.summaryCard} />
            <StatCard label="Este mes" value={isLoading || error ? '—' : formatCurrency(salesSummary.month)} style={styles.summaryCard} />
            <StatCard label="Este año" value={isLoading || error ? '—' : formatCurrency(salesSummary.year)} style={styles.summaryCard} />
          </View>
        </View>

        <View style={styles.section}><DashboardOperations /></View>
        {/* Productos top */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Productos Más Vendidos</Text>
          {!isLoading && !error && topProducts.length === 0 && <DataState empty />}
          <View style={styles.card}>
            {topProducts.map((product, index) => (
              <View
                key={product.id}
                style={[
                  styles.productRow,
                  index < topProducts.length - 1 && styles.productRowBorder,
                ]}
              >
                <View style={styles.productRank}>
                  <Text style={styles.productRankText}>{index + 1}</Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productQuantity}>
                    {product.quantity} unidades
                  </Text>
                </View>
                <Text style={styles.productRevenue}>
                  {formatCurrency(product.revenue)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Ventas recientes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ventas Recientes</Text>
          {!isLoading && !error && recentSales.length === 0 && <DataState empty />}
          <View style={styles.card}>
            {recentSales.map((sale, index) => (
              <View
                key={sale.id}
                style={[
                  styles.saleRow,
                  index < recentSales.length - 1 && styles.saleRowBorder,
                ]}
              >
                <View style={styles.saleInfo}>
                  <Text style={styles.saleCustomer}>{sale.customer}</Text>
                  <Text style={styles.saleDate}>{sale.date}</Text>
                </View>
                <View style={styles.saleRight}>
                  <Text style={styles.saleTotal}>
                    {formatCurrency(sale.total)}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      sale.status === 'completed' && styles.statusCompleted,
                      sale.status === 'pending' && styles.statusPending,
                      sale.status === 'cancelled' && styles.statusCancelled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        sale.status === 'completed' && styles.statusTextCompleted,
                        sale.status === 'pending' && styles.statusTextPending,
                        sale.status === 'cancelled' && styles.statusTextCancelled,
                      ]}
                    >
                      {sale.status === 'completed'
                        ? 'Completada'
                        : sale.status === 'pending'
                        ? 'Pendiente'
                        : 'Cancelada'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Espacio inferior */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = createScreenStyles({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  date: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  logoutButton: {
    padding: spacing.sm,
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  summaryCard: {
    width: '48%',
    padding: spacing.md,
    borderRadius: radii.lg,
    marginHorizontal: '1%',
    marginBottom: spacing.sm,
  },
  cardToday: {
    backgroundColor: colors.primary[50],
  },
  cardWeek: {
    backgroundColor: colors.surface,
  },
  cardMonth: {
    backgroundColor: colors.surface,
  },
  cardYear: {
    backgroundColor: colors.surface,
  },
  summaryLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  productRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  productRank: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  productRankText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.primary[700],
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  productQuantity: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  productRevenue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  saleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },
  saleInfo: {
    flex: 1,
  },
  saleCustomer: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  saleDate: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  saleRight: {
    alignItems: 'flex-end',
  },
  saleTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusCompleted: {
    backgroundColor: '#EAF5EF',
  },
  statusPending: {
    backgroundColor: '#FFF3DA',
  },
  statusCancelled: {
    backgroundColor: '#FCECEF',
  },
  statusText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  statusTextCompleted: {
    color: '#065F46',
  },
  statusTextPending: {
    color: '#92400E',
  },
  statusTextCancelled: {
    color: '#991B1B',
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
