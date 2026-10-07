import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { businessApi, type ApiDocument } from '../services/business-api';
import { listProducts, listStock } from '../services/inventory-api';
import { listAccounts, listPayments } from '../services/treasury-api';
import { useAuthStore } from '../stores/authStore';
import { StatCard } from './StatCard';
import { DataState } from './DataState';
import { SecondaryButton } from './SecondaryButton';
import { colors, spacing, typography } from '../theme';

/** Read-only overview. Missing permissions/data never become a fabricated zero. */
export function DashboardOperations() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const can = useAuthStore((s) => s.can);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    purchases?: number;
    payments?: number;
    low?: number;
    out?: number;
    recent: ApiDocument[];
  }>({ recent: [] });
  const purchasesAllowed = can('purchase.order:read');
  const paymentsAllowed = can('payment:read') && can('bank.account:read');
  const stockAllowed = can('product:read') && can('stock.movement:read');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSummary({ recent: [] });
    const month = new Date().toISOString().slice(0, 7);
    const tasks = [
      purchasesAllowed
        ? businessApi.listOrders().then((d) => ({
            purchases: d
              .filter(
                (p) =>
                  p.currency === 'MXN' && p.status !== 'cancelled' && p.issueDate.startsWith(month)
              )
              .reduce((s, p) => s + p.total, 0),
            recent: d
              .filter((p) => p.status !== 'cancelled')
              .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
              .slice(0, 3),
          }))
        : Promise.resolve({}),
      paymentsAllowed
        ? Promise.all([listPayments(), listAccounts()]).then(([p, a]) => ({
            payments: p
              .filter(
                (x) =>
                  x.status === 'posted' &&
                  x.date.startsWith(month) &&
                  a.find((y) => y.id === x.accountId)?.currency === 'MXN'
              )
              .reduce((s, x) => s + x.amount, 0),
          }))
        : Promise.resolve({}),
      stockAllowed
        ? Promise.all([listProducts(), listStock()]).then(([products, stock]) => {
            const activeProducts = products.filter((p) => !p.archived);
            const qty = (id: string) =>
              stock.filter((s) => s.productId === id).reduce((n, s) => n + s.qty, 0);
            return {
              low: activeProducts.filter(
                (p) => p.minStock !== null && qty(p.id) > 0 && qty(p.id) < p.minStock
              ).length,
              out: activeProducts.filter((p) => qty(p.id) <= 0).length,
            };
          })
        : Promise.resolve({}),
    ];
    void Promise.allSettled(tasks).then((results) => {
      if (!active) return;
      let next: {
        purchases?: number;
        payments?: number;
        low?: number;
        out?: number;
        recent: ApiDocument[];
      } = { recent: [] };
      for (const r of results) if (r.status === 'fulfilled') next = { ...next, ...r.value };
      setSummary(next);
      if (results.some((r) => r.status === 'rejected'))
        setError('No pudimos actualizar todos los indicadores. Puedes volver a intentarlo.');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user?.id, revision, purchasesAllowed, paymentsAllowed, stockAllowed]);
  const value = (v: number | undefined, money = false) =>
    loading || v === undefined
      ? '—'
      : money
        ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(v);
  if (!purchasesAllowed && !paymentsAllowed && !stockAllowed) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontSize: typography.size.lg, fontWeight: '600', color: colors.neutral[800] }}>
        Operación de tu negocio
      </Text>
      <DataState loading={loading} error={error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {purchasesAllowed && (
          <StatCard
            label="Órdenes del mes · MXN"
            value={value(summary.purchases, true)}
            style={{ flexGrow: 1, minWidth: 145 }}
          />
        )}
        {paymentsAllowed && (
          <StatCard
            label="Pagos del mes · MXN"
            value={value(summary.payments, true)}
            style={{ flexGrow: 1, minWidth: 145 }}
          />
        )}
        {stockAllowed && (
          <>
            <StatCard
              label="Productos con stock bajo"
              value={value(summary.low)}
              style={{ flexGrow: 1, minWidth: 145 }}
            />
            <StatCard
              label="Productos agotados"
              value={value(summary.out)}
              style={{ flexGrow: 1, minWidth: 145 }}
            />
          </>
        )}
      </View>
      {paymentsAllowed && (
        <Text style={{ color: colors.neutral[500], fontSize: typography.size.sm }}>
          Pagos contabilizados, incluidos los de compras. No equivalen a utilidad ni exclusivamente
          a gastos operativos.
        </Text>
      )}
      {summary.recent.map((p) => (
        <SecondaryButton
          key={p.id}
          title={`${p.number} · ${p.issueDate.slice(0, 10)} · ${p.currency} ${p.total.toLocaleString('es-MX')}`}
          onPress={() => router.push(`/more/purchases/${p.id}` as never)}
        />
      ))}
      <SecondaryButton
        title="Actualizar indicadores"
        disabled={loading}
        onPress={() => setRevision((v) => v + 1)}
      />
    </View>
  );
}
