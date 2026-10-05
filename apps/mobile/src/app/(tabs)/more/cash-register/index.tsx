/**
 * Caja — Módulo de Caja
 *
 * Muestra el estado de caja y permite registrar movimientos.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, StatCard, PrimaryButton, SecondaryButton, FormInput } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useCashRegisterStore } from '../../../../stores/cashRegisterStore';

export default function CashRegisterScreen() {
  const router = useRouter();
  const { cashRegister, openCashRegister, closeCashRegister, addEntry, addExit } =
    useCashRegisterStore();

  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<'entry' | 'exit'>('entry');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  const handleOpenMovementModal = (type: 'entry' | 'exit') => {
    setMovementType(type);
    setMovementAmount('');
    setMovementReason('');
    setShowMovementModal(true);
  };

  const handleSubmitMovement = () => {
    const amount = parseFloat(movementAmount);
    if (!amount || amount <= 0 || !movementReason.trim()) return;

    if (movementType === 'entry') {
      addEntry(amount, movementReason);
    } else {
      addExit(amount, movementReason);
    }

    setShowMovementModal(false);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Caja</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Estado de caja */}
        <View style={styles.section}>
          <View style={styles.statusRow}>
            <Text style={styles.sectionTitle}>Estado de Caja</Text>
            <View
              style={[
                styles.statusBadge,
                cashRegister.isOpen ? styles.statusOpen : styles.statusClosed,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  cashRegister.isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                ]}
              >
                {cashRegister.isOpen ? 'Abierta' : 'Cerrada'}
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <StatCard
              label="Saldo Inicial"
              value={formatCurrency(cashRegister.initialBalance)}
              backgroundColor={colors.neutral[50]}
            />
            <StatCard
              label="Ventas Efectivo"
              value={formatCurrency(cashRegister.cashSales)}
              backgroundColor="#D1FAE5"
              valueColor="#065F46"
            />
            <StatCard
              label="Entradas"
              value={formatCurrency(cashRegister.entries)}
              backgroundColor={colors.accent[50]}
            />
            <StatCard
              label="Salidas"
              value={formatCurrency(cashRegister.exits)}
              backgroundColor="#FEE2E2"
              valueColor="#991B1B"
            />
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo Actual</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(cashRegister.currentBalance)}
            </Text>
          </View>
        </View>

        {/* Acciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones</Text>
          <View style={styles.actionsGrid}>
            {cashRegister.isOpen ? (
              <>
                <PrimaryButton
                  title="Registrar Entrada"
                  onPress={() => handleOpenMovementModal('entry')}
                  style={styles.actionButton}
                  icon={
                    <Ionicons name="add-circle-outline" size={20} color={colors.neutral[0]} />
                  }
                />
                <SecondaryButton
                  title="Registrar Salida"
                  onPress={() => handleOpenMovementModal('exit')}
                  style={styles.actionButton}
                  icon={
                    <Ionicons name="remove-circle-outline" size={20} color={colors.neutral[700]} />
                  }
                />
                <SecondaryButton
                  title="Cerrar Caja"
                  onPress={closeCashRegister}
                  style={styles.actionButton}
                />
              </>
            ) : (
              <PrimaryButton
                title="Abrir Caja"
                onPress={() => openCashRegister(1000)}
                style={styles.actionButton}
                icon={
                  <Ionicons name="lock-open-outline" size={20} color={colors.neutral[0]} />
                }
              />
            )}
          </View>
        </View>

        {/* Historial de movimientos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historial de Movimientos</Text>
          {cashRegister.movements.map((movement) => (
            <View key={movement.id} style={styles.movementCard}>
              <View style={styles.movementIcon}>
                <Ionicons
                  name={movement.type === 'entry' ? 'arrow-down-outline' : 'arrow-up-outline'}
                  size={20}
                  color={movement.type === 'entry' ? colors.success : colors.error}
                />
              </View>
              <View style={styles.movementInfo}>
                <Text style={styles.movementReason}>{movement.reason}</Text>
                <Text style={styles.movementDate}>{movement.date}</Text>
              </View>
              <Text
                style={[
                  styles.movementAmount,
                  movement.type === 'entry' ? styles.entryText : styles.exitText,
                ]}
              >
                {movement.type === 'entry' ? '+' : '-'}
                {formatCurrency(movement.amount)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal de movimiento */}
      <Modal
        visible={showMovementModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMovementModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {movementType === 'entry' ? 'Registrar Entrada' : 'Registrar Salida'}
            </Text>
            <Pressable onPress={() => setShowMovementModal(false)}>
              <Ionicons name="close-outline" size={28} color={colors.neutral[600]} />
            </Pressable>
          </View>
          <View style={styles.modalContent}>
            <FormInput
              label="Monto"
              value={movementAmount}
              onChangeText={setMovementAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              required
            />
            <FormInput
              label="Motivo"
              value={movementReason}
              onChangeText={setMovementReason}
              placeholder="Motivo del movimiento"
              required
            />
            <PrimaryButton
              title="Guardar"
              onPress={handleSubmitMovement}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  balanceCard: {
    backgroundColor: colors.primary[600],
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: typography.size.sm,
    color: colors.primary[100],
    marginBottom: spacing.xs,
  },
  balanceValue: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[0],
  },
  actionsGrid: {
    gap: spacing.sm,
  },
  actionButton: {
    width: '100%',
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  movementIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  movementInfo: {
    flex: 1,
  },
  movementReason: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },
  movementDate: {
    fontSize: typography.size.xs,
    color: colors.neutral[500],
    marginTop: 2,
  },
  movementAmount: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },
  entryText: {
    color: colors.success,
  },
  exitText: {
    color: colors.error,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[200],
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
  },
  modalContent: {
    padding: spacing.lg,
  },
  modalButton: {
    marginTop: spacing.lg,
  },
});
