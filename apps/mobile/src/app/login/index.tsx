import { createScreenStyles } from '../../theme/screen-styles';
/**
 * Pantalla de Login — ERP-SC
 *
 * Formulario de autenticación con email y password.
 * Usa el store de auth (mock) para simular el login.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { colors, spacing, typography, radii } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLocalError(null);

    if (!email.trim() || !password.trim()) {
      setLocalError('Por favor, completa todos los campos');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setLocalError('Ingresa un correo electrónico válido.');
      return;
    }

    const success = await login(email, password);
    if (success) {
      router.replace('/(tabs)/dashboard');
    }
  };

  const displayError = localError || error;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* Título */}
          <Text style={styles.brand}>ERP-SC · DULCERÍA</Text>
          <Text style={styles.title}>Bienvenido a tu negocio</Text>
          <Text style={styles.subtitle}>
            Tus ventas, productos e inventario en un solo lugar.
          </Text>

          {/* Formulario */}
          <View style={styles.formContainer}>
            {/* Email */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                accessibilityLabel="Correo electrónico"
                style={styles.input}
                placeholder="tu@email.com"
                placeholderTextColor={colors.neutral[400]}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setLocalError(null);
                  clearError();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={styles.passwordRow}>
              <TextInput
                style={styles.passwordInput}
                accessibilityLabel="Contraseña"
                placeholder="••••••••"
                placeholderTextColor={colors.neutral[400]}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setLocalError(null);
                  clearError();
                }}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
              />
              <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={styles.visibilityButton} onPress={() => setPasswordVisible(!passwordVisible)}>
                <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.neutral[600]} />
              </Pressable>
              </View>
            </View>
            <Pressable accessibilityRole="link" style={styles.helpLink} onPress={()=>router.push('/forgot-password')}><Text style={styles.registerLink}>Olvidé mi contraseña</Text></Pressable>

            {/* Error */}
            {displayError && (
              <View style={styles.errorContainer}>
                <Text accessibilityRole="alert" style={styles.errorText}>{displayError}</Text>
              </View>
            )}

            {/* Botón de login */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleLogin}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoading, busy: isLoading }}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.neutral[0]} />
              ) : (
                <Text style={styles.buttonText}>Iniciar sesión</Text>
              )}
            </Pressable>

            <View style={styles.registerPrompt}>
              <Text style={styles.registerPromptText}>¿No tienes una cuenta?</Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/register')}
                hitSlop={8}
              >
                <Text style={styles.registerLink}>Crear una cuenta</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="link" style={styles.helpLink} onPress={()=>router.push('/resend-verification')}><Text style={styles.helpText}>Reenviar verificación de correo</Text></Pressable>
          </View>

          {/* Footer */}
          <Text style={styles.footer}>
            © 2026 ERP-SC. Todos los derechos reservados.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = createScreenStyles({
  brand: { fontSize: 13, fontWeight: '700', letterSpacing: 1.8, color: colors.primary[700], marginBottom: spacing.md },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.neutral[300], borderRadius: radii.md, backgroundColor: colors.surface },
  passwordInput: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: spacing.md, fontSize: 16, color: colors.neutral[800] },
  visibilityButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  helpLink: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  helpText: { fontSize: 14, color: colors.neutral[600] },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  logoContainer: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.neutral[800],
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 440,
    fontSize: typography.size.base,
    color: colors.neutral[500],
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    marginBottom: spacing.xl,
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
  input: {
    borderWidth: 1,
    borderColor: colors.neutral[300],
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    backgroundColor: colors.surface,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    ...{
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
  },
  buttonPressed: {
    backgroundColor: colors.primary[700],
    opacity: 0.9,
  },
  buttonText: {
    color: colors.neutral[0],
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  registerPrompt: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  registerPromptText: {
    color: colors.neutral[600],
    fontSize: typography.size.sm,
  },
  registerLink: {
    color: colors.primary[700],
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  footer: {
    fontSize: typography.size.xs,
    color: colors.neutral[400],
    textAlign: 'center',
  },
});
