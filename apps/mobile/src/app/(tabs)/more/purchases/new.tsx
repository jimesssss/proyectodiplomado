import { createScreenStyles } from '../../../../theme/screen-styles';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { usePurchasesStore } from '../../../../stores/purchasesStore';
import { useSuppliersStore } from '../../../../stores/suppliersStore';
import { useProductStore } from '../../../../stores/productStore';
/**
 * Nueva Compra — Formulario visual
 *
 * Formulario para crear una nueva orden de compra.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, FormInput, PrimaryButton, SecondaryButton } from '../../../../components';
import { colors, spacing, typography } from '../../../../theme';

export default function NewPurchaseScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    supplier: '',
    expectedDate: '',
    notes: '',
  });

  const suppliers=useSuppliersStore(state=>state.suppliers);
  const products=useProductStore(state=>state.products);
  const [productId,setProductId]=useState('');const [quantity,setQuantity]=useState('1');const [cost,setCost]=useState('');
  const [saving,setSaving]=useState(false);
  useEffect(()=>{void useSuppliersStore.getState().load();void useProductStore.getState().loadProducts();},[]);
  const handleSubmit = async () => {
    const supplier=suppliers.find(x=>x.id===formData.supplier);const product=products.find(x=>x.id===productId);
    const qty=Number(quantity),price=Number(cost);
    if(!supplier||!product||!Number.isFinite(qty)||qty<=0||!cost.trim()||!Number.isFinite(price)||price<0){Alert.alert('Datos inválidos','Selecciona proveedor y producto, cantidad positiva y costo válido.');return;}
    if(saving)return;setSaving(true);
    const saved=await usePurchasesStore.getState().createOrder({supplierId:supplier.id,notes:formData.notes,lines:[{description:product.name,quantity:qty,unitPrice:price,taxRate:0,discountPct:0}]});
    setSaving(false);if(saved)router.back();else Alert.alert('No se pudo guardar',usePurchasesStore.getState().error??'Inténtalo nuevamente.');
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>Nueva Compra</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.form}>
          <Text>Selecciona proveedor</Text>
          <ScrollView horizontal>{suppliers.filter(s=>s.status==='active').map(s=><Pressable key={s.id} onPress={()=>setFormData({...formData,supplier:s.id})}><Text style={{padding:12,color:formData.supplier===s.id?colors.primary[600]:colors.neutral[700]}}>{s.name}</Text></Pressable>)}</ScrollView>
          <Text>Producto</Text>
          <ScrollView horizontal>{products.filter(p=>p.status==='active').map(p=><Pressable key={p.id} onPress={()=>{setProductId(p.id);setCost(String(p.purchasePrice));}}><Text style={{padding:12,color:productId===p.id?colors.primary[600]:colors.neutral[700]}}>{p.name}</Text></Pressable>)}</ScrollView>
          <FormInput label="Cantidad" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          <FormInput label="Costo unitario" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
          <FormInput
            label="Proveedor"
            value={suppliers.find(s=>s.id===formData.supplier)?.name??''}
            editable={false}
            onChangeText={(text) => setFormData({ ...formData, supplier: text })}
            placeholder="Seleccionar proveedor"
            required
          />

          <FormInput
            label="Fecha esperada"
            value={formData.expectedDate}
            onChangeText={(text) => setFormData({ ...formData, expectedDate: text })}
            placeholder="DD/MM/AAAA"
          />

          <FormInput
            label="Notas"
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            placeholder="Notas adicionales"
            multiline
            numberOfLines={4}
          />

          <View style={styles.buttonContainer}>
            <SecondaryButton
              title="Cancelar"
              onPress={() => router.back()}
              style={styles.cancelButton}
            />
            <PrimaryButton
              title="Guardar"
              loading={saving}
              onPress={handleSubmit}
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
