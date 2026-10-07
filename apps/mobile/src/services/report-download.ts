import { Platform } from 'react-native';
import type { createReportPdf } from './report-pdf';
export async function saveReportPdf(
  pdf: Awaited<ReturnType<typeof createReportPdf>>,
  name: string
): Promise<void> {
  const filename = `erp-sc-${name.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  if (Platform.OS === 'web') {
    // Browser APIs are deliberately kept out of the native DOM-free TS contract.
    type DownloadLink = { href: string; download: string; click(): void; remove(): void };
    const web = globalThis as typeof globalThis & {
      document: {
        createElement(tag: 'a'): DownloadLink;
        body: { appendChild(node: DownloadLink): void };
      };
    };
    const a = web.document.createElement('a');
    a.href = 'data:application/pdf;base64,' + pdf.base64;
    a.download = filename;
    web.document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const [files, sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  if (!files.cacheDirectory || !(await sharing.isAvailableAsync()))
    throw Error('Este dispositivo no permite compartir archivos PDF.');
  // A receiving application can still be reading after the chooser returns.
  // Keep each export distinct in the OS-managed cache instead of deleting or overwriting it.
  const uri =
    files.cacheDirectory +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    filename;
  await files.writeAsStringAsync(uri, pdf.base64, { encoding: files.EncodingType.Base64 });
  await sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Guardar o compartir reporte ERP-SC',
    UTI: 'com.adobe.pdf',
  });
}
