import { describe, expect, it } from 'vitest';
import { colors } from './tokens';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
describe('ERP-SC text contrast (WCAG AA)', () => {
  it.each([
    ['primary action', colors.primary[600], colors.surface],
    ['secondary text', colors.neutral[500], colors.background],
    ['muted text', colors.neutral[400], colors.background],
    ['error text', colors.error, colors.surface],
    ['success text', colors.success, colors.surface],
    ['information text', colors.accent[600], colors.surface],
    ['information status', colors.info, colors.surface],
  ])('%s has at least 4.5:1 contrast', (_name, foreground, background) => {
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    expect((light + 0.05) / (dark + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});
