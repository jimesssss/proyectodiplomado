/**
 * Pantalla de Bienvenida — ERP-SC
 *
 * Primera pantalla que ve el usuario. Muestra el logo y un botón
 * para ir al login.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radii } from '../../theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
        <Text style={styles.title}>ERP-SC</Text>
        <Text style={styles.subtitle}>
          Sistema de gestión empresarial
        </Text>

        {/* Descripción */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>
            Administra tu empresa desde cualquier lugar. Controla inventario,
            ventas, clientes y más con una plataforma integral diseñada
            para tu negocio.
          </Text>
        </View>

        {/* Botón de acción */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.buttonText}>Comenzar</Text>
          </Pressable>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          © 2026 ERP-SC. Todos los derechos reservados.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  logoContainer: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  logo: {
    width: 160,
    height: 160,
    borderRadius: radii.full,
  },
  title: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.primary[700],
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.lg,
    color: colors.neutral[500],
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  descriptionContainer: {
    marginBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.neutral[600],
    textAlign: 'center',
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
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
  footer: {
    fontSize: typography.size.xs,
    color: colors.neutral[400],
    textAlign: 'center',
  },
});
