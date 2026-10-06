/**
 * Configuración — Módulo de Configuración
 *
 * Muestra todas las secciones de configuración.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ListItem, ScreenContainer, SectionHeader } from '../../../../components';
import { colors, spacing, typography, radii } from '../../../../theme';
import { useSettingsStore } from '../../../../stores/settingsStore';

export default function SettingsScreen() {
  const router = useRouter();

  const {
    company,
    branch,
    fiscal,
    preferences,
    notifications,
    security,
    updatePreferences,
    updateNotifications,
    updateSecurity,
  } = useSettingsStore();

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

        <Text style={styles.headerTitle}>Configuración</Text>

        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Empresa */}
        <View style={styles.section}>
          <SectionHeader title="Empresa" />

          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nombre</Text>
              <Text style={styles.detailValue}>{company.name}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>RFC</Text>
              <Text style={styles.detailValue}>{company.rfc}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dirección</Text>
              <Text style={styles.detailValue}>{company.address}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Teléfono</Text>
              <Text style={styles.detailValue}>{company.phone}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email</Text>
              <Text style={styles.detailValue}>{company.email}</Text>
            </View>
          </View>
        </View>

        {/* Sucursal */}
        <View style={styles.section}>
          <SectionHeader title="Sucursal" />

          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nombre</Text>
              <Text style={styles.detailValue}>{branch.name}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Código</Text>
              <Text style={styles.detailValue}>{branch.code}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dirección</Text>
              <Text style={styles.detailValue}>{branch.address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Estructura organizativa" />
          <ListItem
            title="Organizaciones"
            subtitle="Consultar y crear organizaciones del tenant"
            leftIcon="business-outline"
            onPress={() => router.push('/more/settings/organizations')}
          />
          <ListItem
            title="Empresas"
            subtitle="Consultar y crear empresas de ERP-SC"
            leftIcon="business"
            onPress={() => router.push('/more/settings/companies')}
          />
          <ListItem
            title="Sucursales"
            subtitle="Consultar y crear sucursales de la empresa"
            leftIcon="business-outline"
            onPress={() => router.push('/more/settings/branches')}
          />
          <ListItem
            title="Almacenes"
            subtitle="Consultar y crear almacenes del tenant"
            leftIcon="file-tray-stacked-outline"
            onPress={() => router.push('/more/settings/warehouses')}
          />
        </View>

        {/* Datos Fiscales */}
        <View style={styles.section}>
          <SectionHeader title="Datos Fiscales" />

          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Régimen Fiscal</Text>
              <Text style={styles.detailValue}>
                {fiscal.taxRegime}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>IVA</Text>
              <Text style={styles.detailValue}>
                {fiscal.defaultTax}%
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Moneda</Text>
              <Text style={styles.detailValue}>
                {fiscal.currency}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferencias */}
        <View style={styles.section}>
          <SectionHeader title="Preferencias" />

          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Alerta de stock bajo
              </Text>

              <Switch
                value={preferences.lowStockAlert}
                onValueChange={(value) =>
                  updatePreferences({
                    lowStockAlert: value,
                  })
                }
                trackColor={{
                  false: colors.neutral[300],
                  true: colors.primary[500],
                }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Stock negativo
              </Text>

              <Switch
                value={preferences.negativeStock}
                onValueChange={(value) =>
                  updatePreferences({
                    negativeStock: value,
                  })
                }
                trackColor={{
                  false: colors.neutral[300],
                  true: colors.primary[500],
                }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Precios automáticos
              </Text>

              <Switch
                value={preferences.automaticPrices}
                onValueChange={(value) =>
                  updatePreferences({
                    automaticPrices: value,
                  })
                }
                trackColor={{
                  false: colors.neutral[300],
                  true: colors.primary[500],
                }}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Mostrar precios con IVA
              </Text>

              <Switch
                value={preferences.showPricesWithTax}
                onValueChange={(value) =>
                  updatePreferences({
                    showPricesWithTax: value,
                  })
                }
                trackColor={{
                  false: colors.neutral[300],
                  true: colors.primary[500],
                }}
              />
            </View>
          </View>
        </View>

        {/* Métodos de Pago */}
        <View style={styles.section}>
          <SectionHeader title="Métodos de Pago" />

          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Ionicons
                name="cash-outline"
                size={20}
                color={colors.success}
              />
              <Text style={styles.detailValue}>Efectivo</Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons
                name="card-outline"
                size={20}
                color={colors.info}
              />
              <Text style={styles.detailValue}>Tarjeta</Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons
                name="swap-horizontal-outline"
                size={20}
                color={colors.warning}
              />
              <Text style={styles.detailValue}>
                Transferencia
              </Text>
            </View>
          </View>
        </View>

        {/* Notificaciones */}
<View style={styles.section}>
  <SectionHeader title="Notificaciones" />

  <View style={styles.card}>
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>
        Alertas de stock
      </Text>

      <Switch
        value={notifications.stockAlerts}
        onValueChange={(value) =>
          updateNotifications({
            stockAlerts: value,
          })
        }
        trackColor={{
          false: colors.neutral[300],
          true: colors.primary[500],
        }}
      />
    </View>

    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>
        Resumen diario
      </Text>

      <Switch
        value={notifications.dailySummary}
        onValueChange={(value) =>
          updateNotifications({
            dailySummary: value,
          })
        }
        trackColor={{
          false: colors.neutral[300],
          true: colors.primary[500],
        }}
      />
    </View>
  </View>
</View>

        {/* Cuenta */}
        <View style={styles.section}>
          <SectionHeader title="Cuenta" />

          <View style={styles.card}>
            <Pressable
              style={styles.menuItem}
              onPress={() =>
                router.push('/more/settings/profile')
              }
            >
              <Ionicons
                name="person-outline"
                size={20}
                color={colors.neutral[600]}
              />

              <Text style={styles.menuItemText}>
                Editar perfil
              </Text>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.neutral[400]}
              />
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => router.push('/more/settings/password')}
            >
              <Ionicons
                name="key-outline"
                size={20}
                color={colors.neutral[600]}
              />

              <Text style={styles.menuItemText}>
                Cambiar contraseña
              </Text>

              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.neutral[400]}
              />
            </Pressable>
          </View>
        </View>

        {/* Seguridad */}
<View style={styles.section}>
  <SectionHeader title="Seguridad" />

  <View style={styles.card}>
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>
        Autenticación de dos factores
      </Text>

      <Switch
        value={security.twoFactorAuth}
        onValueChange={(value) =>
          updateSecurity({
            twoFactorAuth: value,
          })
        }
        trackColor={{
          false: colors.neutral[300],
          true: colors.primary[500],
        }}
      />
    </View>

    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>
        Notificaciones de acceso
      </Text>

      <Switch
        value={security.loginNotifications}
        onValueChange={(value) =>
          updateSecurity({
            loginNotifications: value,
          })
        }
        trackColor={{
          false: colors.neutral[300],
          true: colors.primary[500],
        }}
      />
    </View>
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

  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },

  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.neutral[800],
    marginBottom: spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },

  detailLabel: {
    fontSize: typography.size.sm,
    color: colors.neutral[600],
  },

  detailValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.neutral[800],
  },

  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },

  switchLabel: {
    fontSize: typography.size.base,
    color: colors.neutral[800],
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral[100],
  },

  menuItemText: {
    flex: 1,
    fontSize: typography.size.base,
    color: colors.neutral[800],
    marginLeft: spacing.md,
  },

  bottomSpacer: {
    height: spacing.xxl,
  },
});