import { beforeEach, describe, expect, it, vi } from 'vitest';
const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  writeAsStringAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async () => undefined),
}));
import * as files from 'expo-file-system';
import * as sharing from 'expo-sharing';
import { saveReportPdf } from './report-download';
const pdf = { bytes: new Uint8Array([37, 80, 68, 70]), base64: 'JVBERg==' };
describe('PDF delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platform.OS = 'android';
    vi.mocked(sharing.isAvailableAsync).mockResolvedValue(true);
  });
  it('keeps separate cache files available after sharing returns', async () => {
    await saveReportPdf(pdf, 'sales-2026-10-07');
    await saveReportPdf(pdf, 'sales-2026-10-07');
    const calls = vi.mocked(files.writeAsStringAsync).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).not.toBe(calls[1]![0]);
    expect(calls[0]![0]).toMatch(/^file:\/\/\/cache\/.+erp-sc-sales-2026-10-07\.pdf$/);
    expect(sharing.shareAsync).toHaveBeenCalledWith(
      calls[0]![0],
      expect.objectContaining({ mimeType: 'application/pdf' })
    );
    expect(files.deleteAsync).not.toHaveBeenCalled();
  });
  it('does not write a file when native sharing is unavailable', async () => {
    vi.mocked(sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(saveReportPdf(pdf, 'sales')).rejects.toThrow('no permite compartir');
    expect(files.writeAsStringAsync).not.toHaveBeenCalled();
  });
  it('downloads the generated base64 PDF directly on Web', async () => {
    platform.OS = 'web';
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild } });
    try {
      await saveReportPdf(pdf, 'sales/../../2026');
      expect(link.href).toBe('data:application/pdf;base64,JVBERg==');
      expect(link.download).not.toMatch(/[/.]{2}|\//);
      expect(appendChild).toHaveBeenCalledWith(link);
      expect(link.click).toHaveBeenCalledOnce();
      expect(link.remove).toHaveBeenCalledOnce();
      expect(sharing.shareAsync).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
