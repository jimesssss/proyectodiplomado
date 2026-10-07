import { Platform, StyleSheet, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { colors, radii, shadows } from './tokens';

/** Common presentation rules for existing screens; does not change their data or handlers. */
export function createScreenStyles<T extends StyleSheet.NamedStyles<T>>(source: T): T {
  const result = {} as T;
  for (const name of Object.keys(source) as Array<keyof T>) {
    const original = source[name];
    const style = { ...original } as ViewStyle & TextStyle & ImageStyle;
    const key = String(name);
    if (typeof style.fontSize === 'number') style.fontSize = Math.max(13, style.fontSize);
    if (/^(title|headerTitle|greeting)$/.test(key)) {
      style.fontSize = 26; style.fontWeight = '700'; style.letterSpacing = -0.5;
    }
    if (/sectionTitle$/.test(key)) { style.fontSize = 18; style.fontWeight = '600'; }
    // Only presentation: keep the existing layout, handlers and data contracts.
    if (typeof style.fontSize === 'number' && !style.lineHeight) {
      style.lineHeight = Math.ceil(style.fontSize * 1.4);
    }
    if (/Name$|Label$|Description$|Subtitle$|Email$|Phone$|Concept$/.test(key)) {
      style.flexShrink = 1;
    }
    if (/^(header|modalHeader)$/.test(key)) {
      style.columnGap = 12;
      style.minHeight = 76;
    }
    if (/^(filterChip|paymentMethod)$/.test(key)) {
      style.minHeight = 44;
      style.justifyContent = 'center';
    }
    if (key === 'filtersContainer' && typeof style.maxHeight === 'number') {
      style.maxHeight = Math.max(64, style.maxHeight);
    }
    if (/^(customerStats|supplierStatus|saleRight)$/.test(key)) style.marginLeft = 12;
    if (/^(detailValue|switchLabel|progressLabel)$/.test(key)) {
      style.flexShrink = 1;
    }
    if (/^(detailRow|switchRow|progressInfo)$/.test(key)) style.columnGap = 16;
    if (/Button$|^button$/.test(key) && !style.fontSize) {
      style.minHeight = Math.max(44, Number(style.minHeight) || 0);
      if (typeof style.width === 'number' && style.width < 44) style.width = 44;
      if (typeof style.height === 'number' && style.height < 44) style.height = 44;
      style.borderRadius = radii.md;
    }
    if (/input$/i.test(key) && style.fontSize) {
      style.minHeight = 48; style.borderRadius = radii.md;
    }
    if (/Card$|^card$|chartContainer$/.test(key) && style.backgroundColor && style.borderRadius) {
      style.borderRadius = radii.xl;
      style.borderWidth = style.borderWidth ?? 1;
      style.borderColor = style.borderColor ?? colors.neutral[200];
      Object.assign(style, shadows.sm);
    }
    if (/Info$|^content$|titleContainer$/.test(key)) style.minWidth = 0;
    if (/^(customerCard|supplierCard|expenseCard|purchaseCard|saleCard|userCard|logCard)$/.test(key)) {
      style.paddingVertical = 20;
    }
    if (/headerAction$|quantityButton$|clearButton$/.test(key) && !style.fontSize) {
      style.minWidth = 44; style.minHeight = 44;
      style.alignItems = 'center'; style.justifyContent = 'center';
    }
    if (Platform.OS === 'web') {
      if (key === 'container' && style.flex === 1) {
        Object.assign(style, { width: '100%', maxWidth: 1200, alignSelf: 'center' });
      }
      if (style.width === '48%' || style.width === '47%') {
        Object.assign(style, { width: undefined, flexBasis: key==='productCard'?150:240, flexGrow: 1, minWidth: 0 });
      }
      if (/modalContent$|paymentContent$|resultContent$/i.test(key)) {
        Object.assign(style, { width: '100%', maxWidth: 720, alignSelf: 'center' });
      }
    }
    result[name] = style as T[typeof name];
  }
  return StyleSheet.create(result);
}
