import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppHeader,
  ScreenContainer,
  FormInput,
  PrimaryButton,
  SecondaryButton,
} from '../../../../components';
import { DataState } from '../../../../components/DataState';
import { useSuppliersStore } from '../../../../stores/suppliersStore';
import { useAuthStore } from '../../../../stores/authStore';
import { colors } from '../../../../theme';
export default function NewSupplierScreen() {
  const router = useRouter(),
    can = useAuthStore((s) => s.can);
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [rfc, setRfc] = useState(''),
    [address, setAddress] = useState(''),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (saving || !can('supplier:create')) return;
    if (!name.trim() || name.trim().length > 200) {
      setError('Escribe un nombre de proveedor de hasta 200 caracteres.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Revisa el correo electrónico.');
      return;
    }
    setSaving(true);
    setError(null);
    const saved = await useSuppliersStore
      .getState()
      .addSupplier({ name, company: name, email, phone, rfc, address, status: 'active' });
    setSaving(false);
    if (saved) router.back();
    else setError(useSuppliersStore.getState().error ?? 'No se pudo guardar el proveedor.');
  };
  return (
    <ScreenContainer>
      <AppHeader
        title="Nuevo proveedor"
        subtitle="Datos de contacto de tu proveedor"
        onBack={() => router.back()}
      />
      <View style={{ padding: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {!can('supplier:create') ? (
          <DataState error="No tienes permiso para crear proveedores." />
        ) : (
          <>
            <Text
              style={{ fontSize: 14, lineHeight: 21, color: colors.neutral[600], marginBottom: 20 }}
            >
              Completa los datos de contacto para identificar a tu proveedor en las compras.
            </Text>
            <FormInput
              label="Nombre"
              value={name}
              onChangeText={setName}
              required
              editable={!saving}
            />
            <FormInput
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving}
            />
            <FormInput
              label="Teléfono"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!saving}
            />
            <FormInput
              label="RFC"
              value={rfc}
              onChangeText={setRfc}
              autoCapitalize="characters"
              editable={!saving}
            />
            <FormInput
              label="Dirección"
              value={address}
              onChangeText={setAddress}
              multiline
              editable={!saving}
            />
            <DataState error={error} />
            <PrimaryButton
              title="Guardar proveedor"
              onPress={() => {
                void save();
              }}
              loading={saving}
            />
            <View style={{ height: 12 }} />
            <SecondaryButton title="Cancelar" onPress={() => router.back()} disabled={saving} />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}
