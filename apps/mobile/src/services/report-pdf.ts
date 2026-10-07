import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { ReportDocument } from './report-data';

const plum = rgb(0.44, 0.21, 0.32),
  ink = rgb(0.2, 0.16, 0.22),
  muted = rgb(0.4, 0.36, 0.4);
function clean(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .normalize('NFC');
}
export function formatPdfCell(value: string, header: string): string {
  if (header === 'Estado')
    return (
      (
        {
          paid: 'Pagado',
          issued: 'Emitido',
          posted: 'Contabilizado',
          draft: 'Borrador',
          cancelled: 'Anulado',
          completed: 'Completado',
        } as Record<string, string>
      )[value] ?? value
    );
  if (header === 'Origen')
    return (
      ({ receipt: 'Cobro', payment: 'Pago', opening: 'Saldo inicial' } as Record<string, string>)[
        value
      ] ?? value
    );
  if (
    ['Total', 'Precio', 'Costo', 'Valor', 'Importe', 'Saldo'].includes(header) &&
    /^-?\d+(\.\d+)?$/.test(value)
  )
    return Number(value).toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return value;
}
export function wrapPdfText(value: string, font: PDFFont, width: number, size = 9): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of clean(value).split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
    }
    for (const char of word) {
      const part = line + char;
      if (font.widthOfTextAtSize(part, size) > width && line) {
        lines.push(line);
        line = char;
      } else line = part;
    }
  }
  lines.push(line);
  return lines;
}
/** Pure JS, same tables and pagination for Web and Android. No remote HTML or scripts. */
export async function createReportPdf(
  report: ReportDocument
): Promise<{ bytes: Uint8Array; base64: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ERP-SC · ${report.title}`);
  pdf.setAuthor('ERP-SC');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([842, 595]),
    y = 0;
  const text = (value: string, x: number, top: number, size = 9, strong = false, color = ink) =>
    page.drawText(clean(value), { x, y: top, size, font: strong ? bold : font, color });
  const header = () => {
    page.drawRectangle({ x: 0, y: 519, width: 842, height: 76, color: plum });
    text('ERP-SC', 32, 562, 22, true, rgb(1, 1, 1));
    text(report.title, 32, 539, 12, true, rgb(1, 1, 1));
    for (const [i, line] of wrapPdfText(report.organization, bold, 370, 12).entries())
      text(line, 435, 558 - i * 15, 12, true, rgb(1, 1, 1));
    text(`Periodo: ${report.period}`, 32, 496, 10);
    text(
      `Generado: ${new Date(report.generatedAt).toLocaleString('es-MX')}`,
      435,
      496,
      9,
      false,
      muted
    );
    y = 472;
  };
  header();
  const nextPage = () => {
    page = pdf.addPage([842, 595]);
    header();
  };
  for (const [tableIndex, table] of report.tables.entries()) {
    if (tableIndex > 0) nextPage();
    text(table.title, 32, y, 15, true);
    y -= 23;
    for (const note of table.notes)
      for (const line of wrapPdfText(note, font, 778, 9)) {
        if (y < 75) nextPage();
        text(line, 32, y, 9, false, muted);
        y -= 13;
      }
    y -= 8;
    const weights = table.headers.map((h) =>
      ['Producto', 'Nombre', 'Concepto', 'Proveedor', 'Cliente', 'Correo'].includes(h)
        ? 2.2
        : h === 'Fecha'
          ? 1.5
          : h === 'SKU' || h === 'Código' || h === 'Folio'
            ? 1.3
            : 1
    );
    const weightTotal = weights.reduce((a, b) => a + b, 0),
      widths = weights.map((w) => (778 * w) / weightTotal);
    const left = widths.map((_, i) => 38 + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const headings = () => {
      page.drawRectangle({
        x: 32,
        y: y - 26,
        width: 778,
        height: 26,
        color: rgb(0.96, 0.92, 0.94),
      });
      table.headers.forEach((h, i) => text(h, left[i]!, y - 17, 9, true, plum));
      y -= 26;
    };
    if (y < 110) nextPage();
    headings();
    if (table.rows.length === 0) {
      text('Sin registros para este periodo.', 40, y - 24, 11, false, muted);
      y -= 40;
    }
    for (const [index, row] of table.rows.entries()) {
      const cells = table.headers.map((header, i) =>
        wrapPdfText(formatPdfCell(row[i] ?? '', header), font, widths[i]! - 14)
      );
      let offset = 0;
      const count = Math.max(1, ...cells.map((c) => c.length));
      while (offset < count) {
        if (y < 100) {
          nextPage();
          text(`${table.title} · continuación`, 32, y, 12, true);
          y -= 23;
          headings();
        }
        const chunk = Math.min(count - offset, Math.max(1, Math.floor((y - 65 - 12) / 12)));
        const height = Math.max(26, chunk * 12 + 12);
        page.drawRectangle({
          x: 32,
          y: y - height,
          width: 778,
          height,
          color: index % 2 ? rgb(0.985, 0.975, 0.965) : rgb(1, 1, 1),
        });
        cells.forEach((lines, i) =>
          lines
            .slice(offset, offset + chunk)
            .forEach((line, j) => text(line, left[i]!, y - 17 - j * 12))
        );
        y -= height;
        offset += chunk;
      }
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawLine({
      start: { x: 32, y: 42 },
      end: { x: 810, y: 42 },
      thickness: 0.5,
      color: rgb(0.88, 0.84, 0.85),
    });
    p.drawText('Datos consultados mediante la API de ERP-SC', {
      x: 32,
      y: 25,
      size: 8,
      font,
      color: muted,
    });
    p.drawText(`Página ${index + 1} de ${pages.length}`, {
      x: 700,
      y: 25,
      size: 8,
      font,
      color: muted,
    });
  });
  return { bytes: await pdf.save(), base64: await pdf.saveAsBase64() };
}
