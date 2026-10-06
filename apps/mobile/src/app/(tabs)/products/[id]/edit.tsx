/**
 * Editar Producto — Formulario de edición
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  ScreenContainer,
  FormInput,
  PrimaryButton,
  SecondaryButton,
} from '../../../../components';

import {
  colors,
  spacing,
  typography,
  radii,
} from '../../../../theme';

import { useProductStore } from '../../../../stores/productStore';
import { useInventoryStore } from '../../../../stores/inventoryStore';

export default function EditProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    getProductById,
    loadProductById,
    updateProduct,
    categories,
    isLoading,
    error,
    clearError,
  } = useProductStore();
  const { loadStock, stockError } = useInventoryStore();

  const product = getProductById(id || '');

  const [formData, setFormData] = useState({
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    category: product?.category ?? '',
    purchasePrice: product?.purchasePriceDefined === false
      ? ''
      : product?.purchasePrice.toString() ?? '',
    salePrice: product?.salePriceDefined === false
      ? ''
      : product?.salePrice.toString() ?? '',
    stock: product?.stock.toString() ?? '',
    minStock: product?.minStockDefined === false
      ? ''
      : product?.minStock.toString() ?? '',
    unit: product?.unit ?? 'Pza',
    description: product?.description ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof id === 'string' && id.length > 0) {
      const load = async () => {
        await Promise.all([loadProductById(id), loadStock()]);
        useProductStore.getState().setStockBalances(
          useInventoryStore.getState().stockBalances,
        );
      };
      void load();
    }
  }, [id, loadProductById, loadStock]);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        category: product.category,
        purchasePrice: product.purchasePriceDefined === false
          ? ''
          : product.purchasePrice.toString(),
        salePrice: product.salePriceDefined === false
          ? ''
          : product.salePrice.toString(),
        stock: product.stock.toString(),
        minStock: product.minStockDefined === false
          ? ''
          : product.minStock.toString(),
        unit: product.unit,
        description: product.description,
      });
    }
  }, [product]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    const purchasePrice = Number(formData.purchasePrice);
    const salePrice = Number(formData.salePrice);
    const stock = Number(formData.stock);
    const minStock = Number(formData.minStock || '0');

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'El SKU es requerido';
    }

    if (
      !formData.purchasePrice.trim() ||
      Number.isNaN(purchasePrice) ||
      purchasePrice <= 0
    ) {
      newErrors.purchasePrice = 'Precio de compra inválido';
    }

    if (
      !formData.salePrice.trim() ||
      Number.isNaN(salePrice) ||
      salePrice <= 0
    ) {
      newErrors.salePrice = 'Precio de venta inválido';
    }

    if (
      !formData.stock.trim() ||
      Number.isNaN(stock) ||
      stock < 0
    ) {
      newErrors.stock = 'Existencia inválida';
    }

    if (Number.isNaN(minStock) || minStock < 0) {
      newErrors.minStock = 'Stock mínimo inválido';
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!product) {
      return;
    }

    if (!validateForm()) {
      return;
    }

    clearError();
    const updated = await updateProduct(product.id, {
      name: formData.name.trim(),
      purchasePrice: Number(formData.purchasePrice),
      salePrice: Number(formData.salePrice),
      minStock: Number(formData.minStock || '0'),
      unit: formData.unit.trim() || 'Pza',
      description: formData.description.trim(),
    });

    if (updated === null) {
      return;
    }

    const pendingFields: string[] = [];
    if (formData.sku.trim() !== product.sku) pendingFields.push('SKU (el código es inmutable en backend)');
    if (formData.barcode.trim() !== product.barcode) pendingFields.push('código de barras');
    if (formData.category.trim() !== product.category) pendingFields.push('categoría');
    if (Number(formData.stock) !== product.stock) pendingFields.push('existencia (requiere movimiento y almacén)');

    Alert.alert(
      'Producto actualizado',
      pendingFields.length > 0
        ? `Se guardaron los campos compatibles. Pendiente de guardar: ${pendingFields.join(', ')}.`
        : 'Los cambios se guardaron correctamente.',
      [
        {
          text: 'Aceptar',
          onPress: () => router.back(),
        },
      ]
    );
  };

  if (!product) {
    return (
      <ScreenContainer>
        <View style={styles.errorContainer}>
          {isLoading ? (
            <Text style={styles.productNotFoundText}>Cargando producto…</Text>
          ) : (
            <>
              <Ionicons
                name="alert-circle-outline"
                size={64}
                color={colors.error}
              />

              <Text style={styles.productNotFoundText}>
                {error ?? 'Producto no encontrado'}
              </Text>

              <SecondaryButton
                title="Volver"
                onPress={() => router.back()}
              />
            </>
          )}
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color={colors.neutral[800]}
          />
        </Pressable>

        <Text style={styles.headerTitle}>
          Editar Producto
        </Text>

        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          {error && <Text style={styles.formErrorText}>{error}</Text>}
          {stockError && <Text style={styles.formErrorText}>{stockError}</Text>}
          <FormInput
            label="Nombre"
            value={formData.name}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                name: text,
              })
            }
            placeholder="Nombre del producto"
            error={errors.name}
            required
          />

          <FormInput
            label="SKU"
            value={formData.sku}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                sku: text,
              })
            }
            placeholder="Ej: PROD-001"
            error={errors.sku}
            required
          />

          <FormInput
            label="Código de barras"
            value={formData.barcode}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                barcode: text,
              })
            }
            placeholder="Ej: 7501234567890"
            keyboardType="numeric"
          />

          {/* Categoría */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              Categoría{' '}
              <Text style={styles.required}>*</Text>
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
                    formData.category === category &&
                      styles.categoryChipActive,
                  ]}
                  onPress={() =>
                    setFormData({
                      ...formData,
                      category,
                    })
                  }
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      formData.category === category &&
                        styles.categoryChipTextActive,
                    ]}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {errors.category && (
              <Text style={styles.formErrorText}>
                {errors.category}
              </Text>
            )}
          </View>

          {/* Precios */}
          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <FormInput
                label="Precio de compra"
                value={formData.purchasePrice}
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    purchasePrice: text,
                  })
                }
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
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    salePrice: text,
                  })
                }
                placeholder="0.00"
                keyboardType="decimal-pad"
                error={errors.salePrice}
                required
              />
            </View>
          </View>

          {/* Inventario */}
          <View style={styles.row}>
            <View style={styles.halfWidth}>
              <FormInput
                label="Existencia"
                value={formData.stock}
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    stock: text,
                  })
                }
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
                onChangeText={(text) =>
                  setFormData({
                    ...formData,
                    minStock: text,
                  })
                }
                placeholder="0"
                keyboardType="numeric"
                error={errors.minStock}
              />
            </View>
          </View>

          <FormInput
            label="Unidad"
            value={formData.unit}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                unit: text,
              })
            }
            placeholder="Pza, Kg, L, etc."
          />

          <FormInput
            label="Descripción"
            value={formData.description}
            onChangeText={(text) =>
              setFormData({
                ...formData,
                description: text,
              })
            }
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
              title="Guardar cambios"
              onPress={handleSave}
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

  formErrorText: {
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

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },

  productNotFoundText: {
    fontSize: typography.size.lg,
    color: colors.neutral[600],
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});