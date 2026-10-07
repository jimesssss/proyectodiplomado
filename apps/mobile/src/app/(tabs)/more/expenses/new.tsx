import { createScreenStyles } from '../../../../theme/screen-styles';
import { useModuleRefresh } from '../../../../hooks/useModuleRefresh';
/**
 * Nuevo Gasto — Registro de gasto
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ScreenContainer } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useExpensesStore } from '../../../../stores/expensesStore';
import { useAuditStore } from '../../../../stores/auditStore';

type PaymentMethod = 'cash' | 'card' | 'transfer';
type ExpenseStatus = 'paid' | 'pending';

export default function NewExpenseScreen() {
  const router = useRouter();
  const { addExpense,accounts } = useExpensesStore();
  const [accountId,setAccountId]=useState('');
  useModuleRefresh(useExpensesStore.getState().load,()=>useExpensesStore.getState().error);
  const { addLog } = useAuditStore();

  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>('cash');
  const [status, setStatus] =
    useState<ExpenseStatus>('paid');

  const handleSave = async () => {
    const cleanConcept = concept.trim();
    const cleanCategory = category.trim();
    const cleanDate = date.trim();

    const numericAmount = Number(
      amount.replace(',', '.')
    );

    if (!cleanConcept) {
      Alert.alert(
        'Campo requerido',
        'Ingresa el concepto del gasto.'
      );
      return;
    }

    if (!cleanCategory) {
      Alert.alert(
        'Campo requerido',
        'Ingresa la categoría del gasto.'
      );
      return;
    }

    if (!cleanDate) {
      Alert.alert(
        'Campo requerido',
        'Ingresa la fecha del gasto.'
      );
      return;
    }

    if (
      !amount.trim() ||
      Number.isNaN(numericAmount) ||
      numericAmount <= 0
    ) {
      Alert.alert(
        'Monto inválido',
        'Ingresa un monto mayor a cero.'
      );
      return;
    }

    if(!accountId){Alert.alert('Cuenta requerida','Selecciona la cuenta desde la que se paga.');return;}
    const saved=await addExpense({
      accountId,
      concept: cleanConcept,
      category: cleanCategory,
      date: cleanDate,
      amount: numericAmount,
      paymentMethod,
      status,
    });

    if(!saved){Alert.alert('No se pudo guardar',useExpensesStore.getState().error??'Inténtalo nuevamente.');return;}
    addLog({
      user: 'Admin',
      action: 'Gasto registrado',
      module: 'Gastos',
      details: `${cleanConcept} por $${numericAmount.toFixed(2)}`,
    });

    Alert.alert(
      'Gasto registrado',
      'El gasto se agregó correctamente.',
      [
        {
          text: 'Aceptar',
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text>Cuenta de pago (MXN)</Text>
          <ScrollView horizontal>{accounts.filter(a=>a.currency==='MXN'&&a.type===(paymentMethod==='cash'?'cash':'bank')).map(a=><Pressable key={a.id} onPress={()=>setAccountId(a.id)}><Text style={{padding:12,color:accountId===a.id?colors.primary[600]:colors.neutral[700]}}>{a.name}</Text></Pressable>)}</ScrollView>
          <View style={styles.intro}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="receipt-outline"
                size={28}
                color={colors.primary[600]}
              />
            </View>

            <View style={styles.introText}>
              <Text style={styles.title}>
                Nuevo gasto
              </Text>

              <Text style={styles.subtitle}>
                Registra la información del gasto.
              </Text>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>
              Concepto
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={concept}
                onChangeText={setConcept}
                placeholder="Ej. Compra de papelería"
                placeholderTextColor={
                  colors.neutral[400]
                }
              />
            </View>

            <Text style={styles.label}>
              Categoría
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="pricetag-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={category}
                onChangeText={setCategory}
                placeholder="Ej. Oficina"
                placeholderTextColor={
                  colors.neutral[400]
                }
              />
            </View>

            <Text style={styles.label}>
              Fecha
            </Text>

            <View style={styles.inputContainer}>
              <Ionicons
                name="calendar-outline"
                size={20}
                color={colors.neutral[500]}
              />

              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={
                  colors.neutral[400]
                }
              />
            </View>

            <Text style={styles.label}>
              Monto
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>
                $
              </Text>

              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={
                  colors.neutral[400]
                }
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>
              Método de pago
            </Text>

            <View style={styles.optionsRow}>
              <Pressable
                style={[
                  styles.optionButton,
                  paymentMethod === 'cash' &&
                    styles.optionButtonActive,
                ]}
                onPress={() =>
                  setPaymentMethod('cash')
                }
              >
                <Ionicons
                  name="cash-outline"
                  size={18}
                  color={
                    paymentMethod === 'cash'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.optionText,
                    paymentMethod === 'cash' &&
                      styles.optionTextActive,
                  ]}
                >
                  Efectivo
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.optionButton,
                  paymentMethod === 'card' &&
                    styles.optionButtonActive,
                ]}
                onPress={() =>
                  setPaymentMethod('card')
                }
              >
                <Ionicons
                  name="card-outline"
                  size={18}
                  color={
                    paymentMethod === 'card'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.optionText,
                    paymentMethod === 'card' &&
                      styles.optionTextActive,
                  ]}
                >
                  Tarjeta
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.optionButton,
                  paymentMethod === 'transfer' &&
                    styles.optionButtonActive,
                ]}
                onPress={() =>
                  setPaymentMethod('transfer')
                }
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={18}
                  color={
                    paymentMethod === 'transfer'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.optionText,
                    paymentMethod === 'transfer' &&
                      styles.optionTextActive,
                  ]}
                >
                  Transferencia
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>
              Estado
            </Text>

            <View style={styles.statusRow}>
              <Pressable
                style={[
                  styles.statusButton,
                  status === 'paid' &&
                    styles.statusButtonActive,
                ]}
                onPress={() => setStatus('paid')}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={
                    status === 'paid'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.statusText,
                    status === 'paid' &&
                      styles.statusTextActive,
                  ]}
                >
                  Pagado
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.statusButton,
                  status === 'pending' &&
                    styles.statusButtonActive,
                ]}
                onPress={() =>
                  setStatus('pending')
                }
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={
                    status === 'pending'
                      ? colors.neutral[0]
                      : colors.neutral[600]
                  }
                />

                <Text
                  style={[
                    styles.statusText,
                    status === 'pending' &&
                      styles.statusTextActive,
                  ]}
                >
                  Pendiente
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.saveButton}
            onPress={handleSave}
          >
            <Ionicons
              name="save-outline"
              size={20}
              color={colors.neutral[0]}
            />

            <Text style={styles.saveButtonText}>
              Guardar gasto
            </Text>
          </Pressable>

          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>
              Cancelar
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = createScreenStyles({
  container: {
    flex: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },

  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },

  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  introText: {
    flex: 1,
  },

  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
  },

  subtitle: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: spacing.xs,
  },

  formCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: radii.lg,
    padding: spacing.lg,
  },

  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[700],
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  inputContainer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },

  input: {
    flex: 1,
    marginLeft: spacing.sm,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    paddingVertical: spacing.sm,
  },

  currencySymbol: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[700],
  },

  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  optionButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },

  optionButtonActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },

  optionText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
    marginTop: 4,
  },

  optionTextActive: {
    color: colors.neutral[0],
  },

  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  statusButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    gap: spacing.xs,
  },

  statusButtonActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },

  statusText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
  },

  statusTextActive: {
    color: colors.neutral[0],
  },

  saveButton: {
    minHeight: 50,
    backgroundColor: colors.primary[600],
    borderRadius: radii.md,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  saveButtonText: {
    color: colors.neutral[0],
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },

  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },

  cancelButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[600],
  },
});