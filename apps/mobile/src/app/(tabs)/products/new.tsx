import { createScreenStyles } from '../../../theme/screen-styles';
/**
 * Nuevo Producto — Formulario de creación
 *
 * Formulario para crear un nuevo producto.
 */
import React, { useState } from 'react';
import { Alert, View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, FormInput, PrimaryButton, SecondaryButton } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';
import { useProductStore } from '../../../stores/productStore';

export default function NewProductScreen() {
  const router = useRouter();
  const { addProduct, categories, isLoading, error, clearError } = useProductStore();

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    purchasePrice: '',
    salePrice: '',
    stock: '',
    minStock: '',
    unit: 'Pza',
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (!formData.sku.trim()) newErrors.sku = 'El SKU es requerido';
    const normalizedSku = formData.sku.trim().toUpperCase().replace(/\s+/g, '-');
    if (
      formData.sku.trim() &&
      !/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(normalizedSku)
    ) {
      newErrors.sku =
        'El SKU debe tener 2–32 caracteres: letras, números, punto, guion o guion bajo';
    }
    if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
      newErrors.purchasePrice = 'Precio de compra inválido';
    }
    if (!formData.salePrice || parseFloat(formData.salePrice) <= 0) {
      newErrors.salePrice = 'Precio de venta inválido';
    }
    if (formData.stock.trim() === '' || !Number.isFinite(Number(formData.stock)) || Number(formData.stock) < 0) {
      newErrors.stock = 'Existencia inválida';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    clearError();
    const created = await addProduct({
      name: formData.name,
      sku: formData.sku,
      barcode: formData.barcode,
      category: formData.category,
      purchasePrice: parseFloat(formData.purchasePrice),
      salePrice: parseFloat(formData.salePrice),
      stock: Number(formData.stock),
      minStock: Number(formData.minStock) || 0,
      unit: formData.unit,
      description: formData.description,
      status: 'active',
    });

    if (created === null) {
      return;
    }

    const pendingFields: string[] = [];
    if (formData.category.trim()) pendingFields.push('categoría');
    if (formData.barcode.trim()) pendingFields.push('código de barras');
    if (pendingFields.length > 0) {
      Alert.alert(
        'Producto creado',
        `Se guardaron los datos compatibles con el backend. Pendiente de guardar: ${pendingFields.join(', ')}.`,
        [{ text: 'Aceptar', onPress: () => router.back() }],
      );
      return;
    }
    router.back();
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Nuevo Producto</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <FormInput
            label="Nombre"
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            placeholder="Nombre del producto"
            error={errors.name}
            required
          />

          <FormInput
            label="SKU"
            value={formData.sku}
            onChangeText={(text) => setFormData({ ...formData, sku: text })}
            placeholder="Ej: PROD-001"
            error={errors.sku}
            required
          />

          <FormInput
            label="Código de barras"
            value={formData.barcode}
            onChangeText={(text) => setFormData({ ...formData, barcode: text })}
            placeholder="Ej: 7501234567890"
            keyboardType="numeric"
          />

          {/* Categoría */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Categoría <Text style={styles.required}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
            >
              {categories.map((category) => (
                <Pressable
                  key={category}
                  style={[
                    styles.categoryChip,
                    formData.category === category && styles.categoryChipActive,
                  ]}
                  onPress={() => setFormData({ ...formData, category })}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      formData.category === category && styles.categoryChipTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {errors.category && (
              <Text style={styles.errorText}>{errors.category}</Text>
            )}
          </View>

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <FormInput
                label="Precio de compra"
                value={formData.purchasePrice}
                onChangeText={(text) => setFormData({ ...formData, purchasePrice: text })}
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={errors.purchasePrice}
                required
              />
            </View>
            <View style={styles.halfWidth}>
              <FormInput
                label="Precio de venta"
                value={formData.salePrice}
                onChangeText={(text) => setFormData({ ...formData, salePrice: text })}
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={errors.salePrice}
                required
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <FormInput
                label="Existencia"
                value={formData.stock}
                onChangeText={(text) => setFormData({ ...formData, stock: text })}
                placeholder="0"
                keyboardType="numeric"
                error={errors.stock}
                required
              />
            </View>
            <View style={styles.halfWidth}>
              <FormInput
                label="Stock mínimo"
                value={formData.minStock}
                onChangeText={(text) => setFormData({ ...formData, minStock: text })}
                placeholder="0"
                keyboardType="numeric"
              />
            </View>
          </View>

          <FormInput
            label="Unidad"
            value={formData.unit}
            onChangeText={(text) => setFormData({ ...formData, unit: text })}
            placeholder="Pza, Kg, L, etc."
          />

          <FormInput
            label="Descripción"
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            placeholder="Descripción del producto"
            multiline
            numberOfLines={4}
            style={styles.textArea}
          />

          <View style={styles.buttonContainer}>
            <SecondaryButton
              title="Cancelar"
              onPress={() => router.back()}
              style={styles.cancelButton}
            />
            <PrimaryButton
              title="Guardar"
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.saveButton}
            />
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.neutral[700],
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.error,
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginRight: spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  categoryChipText: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
    fontWeight: typography.weight.medium,
  },
  categoryChipTextActive: {
    color: colors.neutral[0],
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  halfWidth: {
    flex: 1,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
  bottomSpacer: {
    height: spacing.xxl,
  },
});
