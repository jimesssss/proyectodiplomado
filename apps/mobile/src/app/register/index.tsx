import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FormInput, PrimaryButton, ScreenContainer } from '../../components';
import { colors, radii, spacing, typography } from '../../theme';
import { useAuthStore } from '../../stores/authStore';

type RegistrationValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type RegistrationErrors = Partial<Record<keyof RegistrationValues, string>>;

const validateRegistration = (values: RegistrationValues): RegistrationErrors => {
  const errors: RegistrationErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = 'Ingresa tu nombre.';
  }

  if (!values.lastName.trim()) {
    errors.lastName = 'Ingresa tus apellidos.';
  }

  if (!values.email.trim()) {
    errors.email = 'Ingresa tu correo electrónico.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Ingresa un correo electrónico válido.';
  }

  if (!values.password) {
    errors.password = 'Ingresa una contraseña.';
  } else if (
    values.password.length < 12 ||
    values.password.length > 128 ||
    !/[a-z]/.test(values.password) ||
    !/[A-Z]/.test(values.password) ||
    !/[0-9]/.test(values.password)
  ) {
    errors.password = 'Usa 12 caracteres o más, con mayúscula, minúscula y número.';
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Confirma tu contraseña.';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
};

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [values, setValues] = useState<RegistrationValues>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const errors: RegistrationErrors = hasSubmitted ? validateRegistration(values) : {};

  const updateField = (field: keyof RegistrationValues, value: string) => {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
    setConfirmationMessage(null);
    clearError();
  };

  const handleCreateAccount = async () => {
    setHasSubmitted(true);
    const validationErrors = validateRegistration(values);

    if (Object.keys(validationErrors).length > 0) {
      setConfirmationMessage(null);
      return;
    }

    const displayName = `${values.firstName.trim()} ${values.lastName.trim()}`.trim();
    if (await register({ displayName, email: values.email, password: values.password })) {
      setConfirmationMessage('Revisa tu correo para verificar tu cuenta.');
    } else {
      setConfirmationMessage(null);
    }
  };

  return (
    <ScreenContainer contentContainerStyle={styles.screenContent}>
      <View style={styles.content}>
        <View style={styles.brand}>
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.brandCopy}>
            <Text style={styles.brandName}>ERP-SC</Text>
            <Text style={styles.brandDescription}>
              Sistema Integral para la Gestión de Productos Informáticos
            </Text>
          </View>
        </View>

        <View style={styles.heading}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Completa tus datos para comenzar.</Text>
        </View>

        <View style={styles.form}>
          <FormInput
            label="Nombre"
            value={values.firstName}
            onChangeText={(value) => updateField('firstName', value)}
            placeholder="Tu nombre"
            autoCapitalize="words"
            autoCorrect={false}
            required
            error={errors.firstName}
          />
          <FormInput
            label="Apellidos"
            value={values.lastName}
            onChangeText={(value) => updateField('lastName', value)}
            placeholder="Tus apellidos"
            autoCapitalize="words"
            autoCorrect={false}
            required
            error={errors.lastName}
          />
          <FormInput
            label="Correo electrónico"
            value={values.email}
            onChangeText={(value) => updateField('email', value)}
            placeholder="nombre@empresa.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            required
            error={errors.email}
          />

          <View style={styles.passwordField}>
            <FormInput
              label="Contraseña"
              value={values.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="Mínimo 12 caracteres, con letras y número"
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              required
              error={errors.password}
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              hitSlop={8}
              onPress={() => setPasswordVisible((visible) => !visible)}
              style={styles.visibilityButton}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.neutral[600]}
              />
            </Pressable>
          </View>

          <View style={styles.passwordField}>
            <FormInput
              label="Confirmar contraseña"
              value={values.confirmPassword}
              onChangeText={(value) => updateField('confirmPassword', value)}
              placeholder="Repite tu contraseña"
              secureTextEntry={!confirmationVisible}
              autoCapitalize="none"
              autoCorrect={false}
              required
              error={errors.confirmPassword}
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmationVisible ? 'Ocultar confirmación' : 'Mostrar confirmación'}
              hitSlop={8}
              onPress={() => setConfirmationVisible((visible) => !visible)}
              style={styles.visibilityButton}
            >
              <Ionicons
                name={confirmationVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.neutral[600]}
              />
            </Pressable>
          </View>

          <PrimaryButton
            title="Crear cuenta"
            onPress={handleCreateAccount}
            loading={isLoading}
            style={styles.submitButton}
          />

          {(confirmationMessage || error) && (
            <View
              accessibilityRole="alert"
              style={[styles.confirmation, Boolean(error) && styles.errorConfirmation]}
            >
              <Ionicons
                name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={20}
                color={error ? colors.error : colors.success}
              />
              <Text
                style={[
                  styles.confirmationText,
                  Boolean(error) && styles.errorConfirmationText,
                ]}
              >
                {error ?? confirmationMessage}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.loginPrompt}>
          <Text style={styles.loginPromptText}>¿Ya tienes una cuenta?</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/login')}
            hitSlop={8}
          >
            <Text style={styles.loginLink}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  errorConfirmation: {
    borderColor: colors.error,
  },
  errorConfirmationText: {
    color: colors.error,
  },
  content: {
    width: '100%',
    maxWidth: 520,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
  },
  brandCopy: {
    flex: 1,
  },
  brandName: {
    color: colors.primary[700],
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  brandDescription: {
    color: colors.neutral[600],
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.normal,
    marginTop: spacing.xs,
  },
  heading: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.neutral[900],
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: colors.neutral[600],
    fontSize: typography.size.base,
    marginTop: spacing.xs,
  },
  form: {
    width: '100%',
  },
  passwordField: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: spacing.xxl,
  },
  visibilityButton: {
    position: 'absolute',
    top: 26,
    right: spacing.sm,
    width: 40,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButton: {
    width: '100%',
    marginTop: spacing.xs,
  },
  confirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  confirmationText: {
    flex: 1,
    color: colors.success,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  loginPrompt: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  loginPromptText: {
    color: colors.neutral[600],
    fontSize: typography.size.sm,
  },
  loginLink: {
    color: colors.primary[700],
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});