/**
 * Ventas — Lista de ventas
 *
 * Muestra todas las ventas con resumen y filtros.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  EmptyState,
  ScreenContainer,
  SearchBar,
  SectionHeader,
  StatCard,
  StatusBadge,
} from '../../../../components';

import { colors, spacing, typography, radii } from '../../../../theme';
import { useSalesStore } from '../../../../stores/salesStore';

type StatusFilter = 'all' | 'completed' | 'pending' | 'cancelled';
type PaymentFilter = 'all' | 'cash' | 'card' | 'transfer';
type DateFilter = 'all' | 'today' | 'week';

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.filterChip,
        selected && styles.filterChipActive,
      ]}
    >
      <Text
        style={[
          styles.filterChipText,
          selected && styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatSaleDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(year, month - 1, day, 12).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getPaymentMethodLabel = (method: PaymentFilter) => {
  switch (method) {
    case 'cash':
      return 'Efectivo';

    case 'card':
      return 'Tarjeta';

    case 'transfer':
      return 'Transferencia';

    default:
      return 'Pago';
  }
};

export default function SalesScreen() {
  const router = useRouter();

  const {
    sales,
    summary,
    isLoading,
    error,
  } = useSalesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('all');

  const [paymentFilter, setPaymentFilter] =
    useState<PaymentFilter>('all');

  const [dateFilter, setDateFilter] =
    useState<DateFilter>('all');

  const now = new Date();

  const dateKey = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');

  const today = dateKey(now);

  const weekStart = dateKey(
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6,
    ),
  );

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const normalizedSearch = searchQuery
        .trim()
        .toLowerCase();

      const matchesSearch =
        sale.folio
          .toLowerCase()
          .includes(normalizedSearch) ||
        sale.customer
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesStatus =
        statusFilter === 'all' ||
        sale.status === statusFilter;

      const matchesPayment =
        paymentFilter === 'all' ||
        sale.paymentMethod === paymentFilter;

      const matchesDate =
        dateFilter === 'all' ||
        (dateFilter === 'today' &&
          sale.date === today) ||
        (dateFilter === 'week' &&
          sale.date >= weekStart &&
          sale.date <= today);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPayment &&
        matchesDate
      );
    });
  }, [
    sales,
    searchQuery,
    statusFilter,
    paymentFilter,
    dateFilter,
    today,
    weekStart,
  ]);

  return (
    <ScreenContainer>
      {/* Encabezado */}
      <View style={styles.header}>
        <Text style={styles.title}>Ventas</Text>

        <Text style={styles.subtitle}>
          Historial y seguimiento de ventas
        </Text>
      </View>

      {/* Resumen */}
      <View style={styles.summaryContainer}>
        <SectionHeader title="Resumen de hoy" />

        <View style={styles.summaryGrid}>
          <StatCard
            label="Ventas de hoy"
            value={formatCurrency(summary.todaySales)}
            backgroundColor={colors.primary[50]}
            style={styles.statCard}
          />

          <StatCard
            label="Número de ventas"
            value={summary.todayCount.toString()}
            backgroundColor={colors.accent[50]}
            style={styles.statCard}
          />

          <StatCard
            label="Ticket promedio"
            value={formatCurrency(summary.averageTicket)}
            backgroundColor={colors.neutral[50]}
            valueColor={colors.success}
            style={styles.statCard}
          />
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar por folio o cliente..."
        />
      </View>

      {/* Filtros */}
      <View style={styles.filtersContainer}>
        {/* Fecha */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>
            Fecha
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.filtersScrollContent
            }
          >
            {(
              [
                {
                  value: 'all',
                  label: 'Todas',
                },
                {
                  value: 'today',
                  label: 'Hoy',
                },
                {
                  value: 'week',
                  label: 'Últimos 7 días',
                },
              ] as {
                value: DateFilter;
                label: string;
              }[]
            ).map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                selected={
                  dateFilter === filter.value
                }
                onPress={() =>
                  setDateFilter(filter.value)
                }
              />
            ))}
          </ScrollView>
        </View>

        {/* Método de pago */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>
            Método de pago
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.filtersScrollContent
            }
          >
            {(
              [
                {
                  value: 'all',
                  label: 'Todos',
                },
                {
                  value: 'cash',
                  label: 'Efectivo',
                },
                {
                  value: 'card',
                  label: 'Tarjeta',
                },
                {
                  value: 'transfer',
                  label: 'Transferencia',
                },
              ] as {
                value: PaymentFilter;
                label: string;
              }[]
            ).map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                selected={
                  paymentFilter === filter.value
                }
                onPress={() =>
                  setPaymentFilter(filter.value)
                }
              />
            ))}
          </ScrollView>
        </View>

        {/* Estado */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>
            Estado
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={
              styles.filtersScrollContent
            }
          >
            {(
              [
                {
                  value: 'all',
                  label: 'Todos',
                },
                {
                  value: 'completed',
                  label: 'Completadas',
                },
                {
                  value: 'pending',
                  label: 'Pendientes',
                },
                {
                  value: 'cancelled',
                  label: 'Canceladas',
                },
              ] as {
                value: StatusFilter;
                label: string;
              }[]
            ).map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                selected={
                  statusFilter === filter.value
                }
                onPress={() =>
                  setStatusFilter(filter.value)
                }
              />
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Lista */}
      <View style={styles.listContainer}>
        <SectionHeader title="Ventas recientes" />

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator
              size="large"
              color={colors.primary[600]}
            />

            <Text style={styles.stateText}>
              Cargando ventas...
            </Text>
          </View>
        ) : error ? (
          <EmptyState
            icon="alert-circle-outline"
            title="No se pudieron cargar las ventas"
            description={error}
          />
        ) : sales.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="Aún no hay ventas"
            description="Las ventas registradas aparecerán aquí."
          />
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Sin resultados"
            description="Prueba con otro folio, cliente o combinación de filtros."
          />
        ) : (
          filteredSales.map((sale) => (
            <Pressable
              key={sale.id}
              style={styles.saleCard}
              onPress={() =>
                router.push(
                  `/more/sales/${sale.id}`,
                )
              }
            >
              <View style={styles.saleHeader}>
                <Text style={styles.saleFolio}>
                  #{sale.folio}
                </Text>

                <StatusBadge
                  status={
                    sale.status === 'completed'
                      ? 'success'
                      : sale.status === 'pending'
                        ? 'warning'
                        : 'error'
                  }
                  label={
                    sale.status === 'completed'
                      ? 'Completada'
                      : sale.status === 'pending'
                        ? 'Pendiente'
                        : 'Cancelada'
                  }
                />
              </View>

              <View style={styles.saleBody}>
                <View style={styles.saleInfo}>
                  <Text
                    style={styles.saleCustomer}
                    numberOfLines={1}
                  >
                    {sale.customer}
                  </Text>

                  <Text style={styles.saleDate}>
                    {formatSaleDate(sale.date)}
                    {' · '}
                    {sale.time ?? '--:--'}
                  </Text>

                  <View style={styles.paymentRow}>
                    <Ionicons
                      name={
                        sale.paymentMethod === 'cash'
                          ? 'cash-outline'
                          : sale.paymentMethod ===
                              'card'
                            ? 'card-outline'
                            : 'swap-horizontal-outline'
                      }
                      size={14}
                      color={colors.neutral[500]}
                    />

                    <Text
                      style={styles.salePayment}
                    >
                      {getPaymentMethodLabel(
                        sale.paymentMethod,
                      )}
                    </Text>
                  </View>
                </View>

                <Text style={styles.saleTotal}>
                  {formatCurrency(sale.total)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.bottomSpacer} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },

  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },

  subtitle: {
    color: colors.neutral[500],
    fontSize: typography.size.sm,
    marginTop: spacing.xs,
  },

  summaryContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },

  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  statCard: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },

  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  filtersContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },

  filterGroup: {
    marginBottom: spacing.sm,
  },

  filterLabel: {
    color: colors.neutral[600],
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.xs,
  },

  filtersScrollContent: {
    paddingRight: spacing.lg,
  },

  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginRight: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  filterChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },

  filterChipText: {
    fontSize: typography.size.xs,
    color: colors.neutral[600],
    fontWeight: typography.weight.medium,
  },

  filterChipTextActive: {
    color: colors.neutral[0],
  },

  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },

  stateContainer: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },

  stateText: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },

  saleCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  saleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  saleFolio: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },

  saleBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },

  saleInfo: {
    flex: 1,
    minWidth: 0,
  },

  saleCustomer: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },

  saleDate: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },

  salePayment: {
    fontSize: typography.size.xs,
    color: colors.neutral[600],
  },

  saleTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.neutral[900],
  },

  bottomSpacer: {
    height: 110,
  },
});