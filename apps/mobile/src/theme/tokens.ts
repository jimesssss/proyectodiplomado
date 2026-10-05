/**
 * Design Tokens — ERP-SC
 *
 * Paleta derivada del logo oficial (esfera púrpura/magenta con acentos
 * azules y estrella dorada). Todos los colores, espaciados y tipografías
 * del design system viven aquí para mantener consistencia.
 */

// ── Color ──────────────────────────────────────────────────────────────
export const colors = {
  // Primarios (púrpura/magenta del logo)
  primary: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7', // púrpura principal
    600: '#9333EA',
    700: '#7C3AED',
    800: '#6B21A8',
    900: '#581C87',
  },

  // Acentos (azul profundo del logo)
  accent: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },

  // Neutros (fondos, texto, bordes)
  neutral: {
    0: '#FFFFFF',
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Semánticos
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Fondo de la app
  background: '#F9FAFB',
  surface: '#FFFFFF',
} as const;

// ── Espaciado (escala 4px) ────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// ── Tipografía ────────────────────────────────────────────────────────
export const typography = {
  // Familias (usando las nativas de RN para evitar assets extra)
  fontFamily: {
    regular: undefined, // System default
    medium: undefined,
    bold: undefined,
  },

  // Tamaños
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 40,
  },

  // Pesos
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Alturas de línea
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

// ── Bordes y sombras ──────────────────────────────────────────────────
export const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// ── Exportar todo como objeto unificado ───────────────────────────────
export const theme = {
  colors,
  spacing,
  typography,
  radii,
  shadows,
} as const;

export type Theme = typeof theme;
