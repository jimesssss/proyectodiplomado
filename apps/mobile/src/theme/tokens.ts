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
    50: '#FCF5F8',
    100: '#F6E8EF',
    200: '#EBCEDB',
    300: '#D9A7BD',
    400: '#BD7595',
    500: '#A85278', // púrpura principal
    600: '#8B365A',
    700: '#703552',
    800: '#572C43',
    900: '#3E2231',
  },

  // Acentos (azul profundo del logo)
  accent: {
    50: '#F0F7F7',
    100: '#E2EFF0',
    200: '#BDDCDD',
    300: '#91C2C6',
    400: '#6AA7AE',
    500: '#47858F',
    600: '#316B75',
    700: '#285662',
    800: '#254752',
    900: '#213B43',
  },

  // Neutros (fondos, texto, bordes)
  neutral: {
    0: '#FFFFFF',
    50: '#FBF8F6',
    100: '#F4EFEC',
    200: '#E9E0DD',
    300: '#D8CBC7',
    400: '#786C78',
    500: '#6E6470',
    600: '#5D5360',
    700: '#493F4D',
    800: '#332A38',
    900: '#241D28',
  },

  // Semánticos
  success: '#23785F',
  warning: '#96610F',
  error: '#B53843',
  info: '#316B75',

  // Fondo de la app
  background: '#FBF8F6',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#3E2231',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#3E2231',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#3E2231',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
