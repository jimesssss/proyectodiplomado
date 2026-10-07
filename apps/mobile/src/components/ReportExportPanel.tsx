import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii } from '../theme';
import { FormInput } from './FormInput';
import { PrimaryButton } from './PrimaryButton';
import { DataState } from './DataState';
import { listOrganizations, type ApiOrgUnit } from '../services/organization-api';
import { loadPdfReport, PDF_REPORTS, type PdfReportKey } from '../services/report-data';
import { useAuthStore } from '../stores/authStore';

export function ReportExportPanel() {
  const can = useAuthStore((s) => s.can),
    user = useAuthStore((s) => s.user);
  const [key, setKey] = useState<PdfReportKey>('sales'),
    [organizations, setOrganizations] = useState<readonly ApiOrgUnit[]>([]),
    [orgId, setOrgId] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + '01'),
    [to, setTo] = useState(today),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    setOrganizations([]);
    setOrgId('');
    if (can('org:read'))
      void listOrganizations()
        .then((rows) => {
          if (active) {
            const visible = rows.filter((o) => o.status === 'active');
            setOrganizations(visible);
            if (visible.length === 1) setOrgId(visible[0]!.id);
          }
        })
        .catch(() => {
          if (active)
            setError(
              'No pudimos cargar las organizaciones. Reabre Reportes para intentarlo nuevamente.'
            );
        });
    return () => {
      active = false;
    };
  }, [user?.id, user?.tenantId, can]);
  const definition = PDF_REPORTS.find((r) => r.key === key)!;
  const authorized = can('report:export') && can('org:read') && definition.permissions.every(can);
  const generate = async () => {
    if (loading || !authorized) return;
    setLoading(true);
    setError(null);
    setSuccess('');
    const identity = useAuthStore.getState().user;
    try {
      const report = await loadPdfReport(key, from, to, orgId);
      const { createReportPdf } = await import('../services/report-pdf');
      const pdf = await createReportPdf(report);
      const current = useAuthStore.getState().user;
      if (identity?.id !== current?.id || identity?.tenantId !== current?.tenantId)
        throw Error('La sesión cambió. Vuelve a generar el reporte.');
      const { saveReportPdf } = await import('../services/report-download');
      await saveReportPdf(pdf, key + '-' + today);
      setSuccess(
        'PDF generado. En Web se inició la descarga; en Android utiliza el diálogo para guardarlo o compartirlo.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF. Inténtalo nuevamente.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Ionicons name="document-text-outline" size={25} color={colors.primary[600]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reportes PDF</Text>
          <Text style={styles.copy}>Documentos de tu negocio con datos reales</Text>
        </View>
      </View>
      <View style={styles.options}>
        {PDF_REPORTS.map((r) => (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityState={{ selected: key === r.key, disabled: loading }}
            disabled={loading}
            onPress={() => {
              setKey(r.key);
              setSuccess('');
              setError(null);
            }}
            style={[styles.chip, key === r.key && styles.selected]}
          >
            <Text style={[styles.chipText, key === r.key && { color: colors.primary[700] }]}>
              {r.title}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.copy}>{definition.description}</Text>
      <Text style={styles.label}>Organización para el encabezado</Text>
      <View style={styles.options}>
        {organizations.map((o) => (
          <Pressable
            key={o.id}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ selected: orgId === o.id }}
            onPress={() => setOrgId(o.id)}
            style={[styles.chip, orgId === o.id && styles.selected]}
          >
            <Text style={styles.chipText}>{o.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.caption}>
        Los datos corresponden a todo el negocio de tu sesión. La organización elegida identifica
        el encabezado y no restringe los registros.
      </Text>
      {definition.range ? (
        <View style={styles.dates}>
          <View style={styles.date}>
            <FormInput
              label="Desde · AAAA-MM-DD"
              value={from}
              onChangeText={setFrom}
              editable={!loading}
            />
          </View>
          <View style={styles.date}>
            <FormInput
              label="Hasta · AAAA-MM-DD"
              value={to}
              onChangeText={setTo}
              editable={!loading}
            />
          </View>
        </View>
      ) : (
        <Text style={styles.caption}>
          Este reporte muestra información actual, sin filtro de fechas.
        </Text>
      )}
      {!authorized && <DataState error="No tienes permisos para exportar este reporte." />}
      <DataState error={error} />
      {success && (
        <Text accessibilityLiveRegion="polite" style={styles.success}>
          {success}
        </Text>
      )}
      <PrimaryButton
        title="Generar y descargar PDF"
        onPress={() => {
          void generate();
        }}
        loading={loading}
        disabled={!authorized || !orgId}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  heading: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.neutral[800] },
  copy: { fontSize: 14, lineHeight: 21, color: colors.neutral[600] },
  caption: { fontSize: 13, lineHeight: 20, color: colors.neutral[600], marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.neutral[800], marginTop: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    backgroundColor: colors.background,
    maxWidth: '100%',
  },
  chipText: { fontSize: 14, color: colors.neutral[700], flexShrink: 1 },
  selected: { backgroundColor: colors.primary[50], borderColor: colors.primary[600] },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  date: { flexBasis: 220, flexGrow: 1, minWidth: 0 },
  success: { color: colors.success, fontSize: 14, lineHeight: 21, marginBottom: 16 },
});
