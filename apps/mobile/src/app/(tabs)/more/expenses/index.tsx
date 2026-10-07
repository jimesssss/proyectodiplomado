import { createScreenStyles } from '../../../../theme/screen-styles';
import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Gastos — Lista de gastos
 *
 * Muestra todos los gastos con filtros y total.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, SearchBar, StatCard, EmptyState } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useExpensesStore } from '../../../../stores/expensesStore';

export default function ExpensesScreen() {
  useModuleRefresh(useExpensesStore.getState().load,()=>useExpensesStore.getState().error);
  const router = useRouter();
  const { expenses, totalExpenses } = useExpensesStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExpenses = useMemo(() => {
    return expenses.filter(
      (expense) =>
        expense.concept.toLowerCase().includes(searchQuery.toLowerCase()) ||
        expense.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [expenses, searchQuery]);

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  return (
    <ScreenContainer loading={useExpensesStore(state => state.isLoading)} error={useExpensesStore(state => state.error)}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Gastos</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push('/more/expenses/new')}
        >
          <Ionicons name="add" size={24} color={colors.primary[600]} />
        </Pressable>
      </View>

      {/* Total de gastos */}
      <View style={styles.totalContainer}>
        <StatCard
          label="Total de Gastos"
          value={formatCurrency(totalExpenses)}
          backgroundColor="#FCECEF"
          valueColor="#991B1B"
        />
      </View>

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar gasto..."
        />
      </View>

      {/* Lista de gastos */}
      {filteredExpenses.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No se encontraron gastos"
          description="Intenta con otros términos de búsqueda"
        />
      ) : (
        <ScrollView
          style={styles.listContainer}
          showsVerticalScrollIndicator={false}
        >
          {filteredExpenses.map((expense) => (
            <View key={expense.id} style={styles.expenseCard}>
              <View style={styles.expenseInfo}>
                <Text style={styles.expenseConcept}>{expense.concept}</Text>
                <Text style={styles.expenseCategory}>{expense.category}</Text>
                <Text style={styles.expenseDate}>{expense.date}</Text>
              </View>
              <View style={styles.expenseRight}>
                <Text style={styles.expenseAmount}>
                  {formatCurrency(expense.amount)}
                </Text>
                <Text style={styles.expensePayment}>
                  {expense.paymentMethod === 'cash'
                    ? 'Efectivo'
                    : expense.paymentMethod === 'card'
                    ? 'Tarjeta'
                    : 'Transferencia'}
                </Text>
              </View>
            </View>
          ))}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = createScreenStyles({
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
  addButton: {
    padding: spacing.xs,
  },
  totalContainer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  expenseCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  expenseInfo: {
    flex: 1,
  },
  expenseConcept: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  expenseCategory: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    marginTop: 2,
  },
  expenseDate: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 2,
  },
  expenseRight: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.error,
  },
  expensePayment: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
