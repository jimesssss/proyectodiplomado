/**
 * Venta Detalle — Ver detalle de venta
 *
 * Muestra toda la información de una venta.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  EmptyState,
  ScreenContainer,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from '../../../../components';

import {
  colors,
  spacing,
  typography,
  radii,
} from '../../../../theme';

import { useSalesStore } from '../../../../stores/salesStore';

/* =========================================================
   FORMATOS
========================================================= */

const formatCurrency = (value: number) =>
  `$${value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatSaleDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);

  return new Date(
    year,
    month - 1,
    day,
    12,
  ).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getPaymentMethodLabel = (method: string) => {
  switch (method) {
    case 'cash':
      return 'Efectivo';

    case 'card':
      return 'Tarjeta';

    case 'transfer':
      return 'Transferencia';

    default:
      return method;
  }
};

/* =========================================================
   PANTALLA
========================================================= */

export default function SaleDetailScreen() {
  const router = useRouter();

  const { id } = useLocalSearchParams<{
    id: string;
  }>();

  const {
    getSaleById,
    isLoading,
    error,
  } = useSalesStore();

  const sale = getSaleById(id || '');

  /* =======================================================
     CARGANDO
  ======================================================= */

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.stateContainer}>
          <ActivityIndicator
            size="large"
            color={colors.primary[600]}
          />

          <Text style={styles.stateText}>
            Cargando detalle de venta...
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  /* =======================================================
     ERROR
  ======================================================= */

  if (error || !sale) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          <EmptyState
            icon="alert-circle-outline"
            title={
              error
                ? 'No se pudo cargar la venta'
                : 'Venta no encontrada'
            }
            description={
              error ||
              'Verifica el folio e inténtalo de nuevo.'
            }
          />

          <SecondaryButton
            title="Volver"
            onPress={() => router.back()}
            style={styles.errorBackButton}
          />
        </View>
      </ScreenContainer>
    );
  }

  /* =======================================================
     CÁLCULOS
  ======================================================= */

  const subtotal = sale.items.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0,
  );

  const discount =
    sale.discount ??
    Math.max(subtotal - sale.total, 0);

  /* =======================================================
     CONTENIDO
  ======================================================= */

  return (
    <ScreenContainer>

      {/* HEADER */}

      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.neutral[800]}
          />
        </Pressable>

        <Text
          style={styles.headerTitle}
          numberOfLines={1}
        >
          Detalle de venta
        </Text>

        <View style={styles.placeholder} />
      </View>

      {/* CONTENIDO */}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={
          styles.scrollContent
        }
        showsVerticalScrollIndicator={false}
      >

        {/* INFORMACIÓN GENERAL */}

        <View style={styles.section}>
          <SectionHeader title="Información general" />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Folio
            </Text>

            <Text style={styles.detailValue}>
              #{sale.folio}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Fecha
            </Text>

            <Text style={styles.detailValue}>
              {formatSaleDate(sale.date)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Hora
            </Text>

            <Text style={styles.detailValue}>
              {sale.time ?? '--:--'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Cliente
            </Text>

            <Text
              style={styles.detailValue}
              numberOfLines={1}
            >
              {sale.customer}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>
              Método de pago
            </Text>

            <Text style={styles.detailValue}>
              {getPaymentMethodLabel(
                sale.paymentMethod,
              )}
            </Text>
          </View>

          <View
            style={[
              styles.detailRow,
              styles.lastDetailRow,
            ]}
          >
            <Text style={styles.detailLabel}>
              Estado
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
        </View>

        {/* PRODUCTOS */}

        <View style={styles.section}>
          <SectionHeader title="Productos vendidos" />

          {sale.items.map((item, index) => (
            <View
              key={`${item.productName}-${index}`}
              style={[
                styles.itemRow,
                index <
                  sale.items.length - 1 &&
                  styles.itemRowBorder,
              ]}
            >
              <View style={styles.itemInfo}>
                <Text
                  style={styles.itemName}
                  numberOfLines={2}
                >
                  {item.productName}
                </Text>

                <Text style={styles.itemPrice}>
                  {item.quantity} ×{' '}
                  {formatCurrency(item.price)} c/u
                </Text>
              </View>

              <Text
                style={styles.itemTotal}
                numberOfLines={1}
              >
                {formatCurrency(
                  item.price * item.quantity,
                )}
              </Text>
            </View>
          ))}
        </View>

        {/* RESUMEN */}

        <View style={styles.section}>
          <SectionHeader title="Resumen de importes" />

          <View style={styles.totalRow}>
            <Text style={styles.detailLabel}>
              Subtotal
            </Text>

            <Text style={styles.detailValue}>
              {formatCurrency(subtotal)}
            </Text>
          </View>

          <View
            style={[
              styles.totalRow,
              styles.discountRow,
            ]}
          >
            <Text style={styles.detailLabel}>
              Descuento
            </Text>

            <Text style={styles.discountValue}>
              −{formatCurrency(discount)}
            </Text>
          </View>

          <View style={styles.finalTotalRow}>
            <Text style={styles.totalLabel}>
              Total
            </Text>

            <Text
              style={styles.totalValue}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {formatCurrency(sale.total)}
            </Text>
          </View>
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}

/* =========================================================
   ESTILOS
========================================================= */

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
    width: 40,
    height: 40,

    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    flex: 1,

    textAlign: 'center',

    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,

    color: colors.neutral[800],
  },

  placeholder: {
    width: 40,
    height: 40,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingTop: spacing.md,

    /*
     * Espacio para evitar que la navegación
     * inferior tape el total de la venta.
     */
    paddingBottom: 120,
  },

  /* ESTADOS */

  errorContainer: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    padding: spacing.xl,
  },

  errorBackButton: {
    marginTop: spacing.md,
  },

  stateContainer: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    gap: spacing.md,
  },

  stateText: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },

  /* SECCIONES */

  section: {
    backgroundColor: colors.surface,

    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,

    padding: spacing.lg,

    borderRadius: radii.lg,

    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  /* INFORMACIÓN GENERAL */

  detailRow: {
    flexDirection: 'row',

    justifyContent: 'space-between',
    alignItems: 'center',

    gap: spacing.md,

    paddingVertical: spacing.sm,

    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },

  lastDetailRow: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },

  detailLabel: {
    flexShrink: 1,

    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },

  detailValue: {
    flexShrink: 1,

    textAlign: 'right',

    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,

    color: colors.neutral[800],
  },

  /* PRODUCTOS */

  itemRow: {
    flexDirection: 'row',

    justifyContent: 'space-between',
    alignItems: 'center',

    gap: spacing.md,

    paddingVertical: spacing.sm,
  },

  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },

  itemInfo: {
    flex: 1,
    minWidth: 0,
  },

  itemName: {
    fontSize: typography.size.base,

    fontWeight: typography.weight.medium,

    color: colors.neutral[800],
  },

  itemPrice: {
    fontSize: typography.size.sm,

    color: colors.neutral[500],

    marginTop: 2,
  },

  itemTotal: {
    flexShrink: 0,

    fontSize: typography.size.base,

    fontWeight: typography.weight.semibold,

    color: colors.neutral[800],
  },

  /* TOTALES */

  totalRow: {
    flexDirection: 'row',

    justifyContent: 'space-between',
    alignItems: 'center',

    gap: spacing.md,

    paddingVertical: spacing.xs,
  },

  discountRow: {
    marginBottom: spacing.sm,

    paddingBottom: spacing.md,

    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },

  discountValue: {
    fontSize: typography.size.base,

    fontWeight: typography.weight.medium,

    color: colors.success,
  },

  finalTotalRow: {
    flexDirection: 'row',

    justifyContent: 'space-between',
    alignItems: 'center',

    gap: spacing.md,

    paddingTop: spacing.xs,
  },

  totalLabel: {
    fontSize: typography.size.lg,

    fontWeight: typography.weight.semibold,

    color: colors.neutral[800],
  },

  totalValue: {
    flexShrink: 1,

    textAlign: 'right',

    fontSize: typography.size.xxl,

    fontWeight: typography.weight.bold,

    color: colors.primary[600],
  },
});