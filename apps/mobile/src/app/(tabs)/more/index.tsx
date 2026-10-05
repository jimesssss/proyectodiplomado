/**
 * Menú "Más" — Acceso a módulos secundarios
 *
 * Agrupa los módulos del ERP-SC por categorías.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../../../components';
import { colors, spacing, typography, radii } from '../../../theme';

interface ModuleItem {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
}

interface ModuleSection {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: ModuleItem[];
}

const MODULES: ModuleSection[] = [
  {
    id: 'operation',
    title: 'Operación',
    icon: 'storefront-outline',
    items: [
      {
        id: 'sales',
        title: 'Ventas',
        description: 'Historial y detalle de ventas',
        icon: 'trending-up',
        route: '/more/sales',
        color: '#10B981',
      },
      {
        id: 'purchases',
        title: 'Compras',
        description: 'Órdenes y recepciones',
        icon: 'cart',
        route: '/more/purchases',
        color: '#8B5CF6',
      },
      {
        id: 'cash',
        title: 'Caja',
        description: 'Control de efectivo',
        icon: 'cash',
        route: '/more/cash-register',
        color: '#F59E0B',
      },
      {
        id: 'expenses',
        title: 'Gastos',
        description: 'Registro y control de gastos',
        icon: 'receipt',
        route: '/more/expenses',
        color: '#EF4444',
      },
    ],
  },
  {
    id: 'contacts',
    title: 'Contactos',
    icon: 'people-outline',
    items: [
      {
        id: 'customers',
        title: 'Clientes',
        description: 'Catálogo y datos de clientes',
        icon: 'people',
        route: '/more/customers',
        color: '#EC4899',
      },
      {
        id: 'suppliers',
        title: 'Proveedores',
        description: 'Catálogo de proveedores',
        icon: 'business',
        route: '/more/suppliers',
        color: '#3B82F6',
      },
    ],
  },
  {
    id: 'administration',
    title: 'Administración',
    icon: 'settings-outline',
    items: [
      {
        id: 'reports',
        title: 'Reportes',
        description: 'Informes y estadísticas',
        icon: 'bar-chart',
        route: '/more/reports',
        color: '#6366F1',
      },
      {
        id: 'users',
        title: 'Usuarios',
        description: 'Gestión de usuarios y permisos',
        icon: 'person',
        route: '/more/users',
        color: '#14B8A6',
      },
      {
        id: 'audit',
        title: 'Auditoría',
        description: 'Historial de acciones del sistema',
        icon: 'document-text',
        route: '/more/audit',
        color: '#F97316',
      },
      {
        id: 'settings',
        title: 'Configuración',
        description: 'Ajustes generales del ERP',
        icon: 'settings',
        route: '/more/settings',
        color: '#64748B',
      },
    ],
  },
];

export default function MoreScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Encabezado */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Más</Text>
            <Text style={styles.subtitle}>
              Administra tu negocio desde un solo lugar
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Ionicons name="grid" size={25} color="#7C3AED" />
          </View>
        </View>

        {/* Tarjeta ERP-SC */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <Ionicons name="storefront" size={28} color="#7C3AED" />
          </View>

          <View style={styles.heroInfo}>
            <Text style={styles.heroTitle}>ERP-SC</Text>
            <Text style={styles.heroText}>
              Gestión integral de tu negocio
            </Text>
          </View>

          <View style={styles.status}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Activo</Text>
          </View>
        </View>

        {/* Módulos */}
        {MODULES.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name={section.icon}
                size={18}
                color={colors.neutral[500]}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <View style={styles.grid}>
              {section.items.map((item) => (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.moduleCard,
                    pressed && styles.moduleCardPressed,
                  ]}
                  onPress={() => router.push(item.route as any)}
                >
                  <View
                    style={[
                      styles.moduleIcon,
                      { backgroundColor: `${item.color}18` },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={25}
                      color={item.color}
                    />
                  </View>

                  <View style={styles.moduleInfo}>
                    <Text style={styles.moduleTitle}>
                      {item.title}
                    </Text>

                    <Text
                      style={styles.moduleDescription}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  </View>

                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={colors.neutral[400]}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>ERP-SC • Sistema de gestión</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },

  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.neutral[900],
  },

  subtitle: {
    fontSize: typography.size.sm,
    color: colors.neutral[500],
    marginTop: 4,
  },

  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#FAF5FF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },

  heroTitle: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.neutral[900],
  },

  heroText: {
    marginTop: 3,
    fontSize: typography.size.xs,
    color: colors.neutral[500],
  },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 5,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },

  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },

  sectionTitle: {
    marginLeft: 7,
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: colors.neutral[600],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  grid: {
    gap: spacing.sm,
  },

  moduleCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  moduleCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },

  moduleIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },

  moduleInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },

  moduleTitle: {
    fontSize: typography.size.base,
    fontWeight: '600',
    color: colors.neutral[900],
  },

  moduleDescription: {
    marginTop: 3,
    fontSize: typography.size.xs,
    lineHeight: 17,
    color: colors.neutral[500],
  },

  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: typography.size.xs,
    color: colors.neutral[400],
  },
});