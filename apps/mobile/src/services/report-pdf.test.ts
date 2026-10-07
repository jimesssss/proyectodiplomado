import { describe, it, expect, vi } from 'vitest';
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { apiBaseUrl: 'https://example.test/api/v1' } } },
}));
import { PDFDocument } from 'pdf-lib';
import { parseReportCsv, validateReportPeriod, loadPdfReport } from './report-data';
import { configureApiSession } from './api-client';
import { createReportPdf, formatPdfCell } from './report-pdf';
import { productClassification } from './product-classification';
import { customerMetrics } from './customer-metrics';
import type { ApiDocument } from './business-api';
describe('PDF reports preserve actual source data', () => {
  it('keeps opening balances separate from cash income and resolves real account names', async () => {
    configureApiSession({ token: () => 'test-token', refresh: async () => {}, expire: () => {} });
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const data = url.includes('/organizations')
        ? [
            {
              id: '012345678901234567890123',
              kind: 'organization',
              parentId: null,
              code: 'DUL',
              name: 'Dulcería real',
              status: 'active',
            },
          ]
        : url.includes('/treasury/accounts')
          ? [
              {
                id: 'cash',
                name: 'Caja real',
                code: 'CAJA',
                type: 'cash',
                currency: 'MXN',
                balance: 120,
                openingBalance: 100,
                archived: false,
              },
            ]
          : {
              csv: 'createdAt,accountId,currency,sourceType,amount,balanceAfter,reason\n2026-10-01,cash,MXN,opening,100,100,Apertura\n2026-10-02,cash,MXN,receipt,25,125,Cobro\n2026-10-03,cash,MXN,payment,-5,120,Pago',
              rowCount: 3,
              truncated: false,
            };
      return new Response(JSON.stringify({ success: true, data, meta: { total: 1 } }), {
        status: 200,
      });
    });
    try {
      const report = await loadPdfReport(
        'cashflow',
        '2026-10-01',
        '2026-10-07',
        '012345678901234567890123'
      );
      expect(report.tables[0]!.notes).toContain('MXN · Ingresos: 25.00 · Egresos: 5.00');
      expect(report.tables[0]!.notes).toContain(
        'Aperturas registradas en el periodo · MXN: 100.00'
      );
      expect(report.tables[0]!.rows.every((row) => row[1] === 'Caja real')).toBe(true);
    } finally {
      mock.mockRestore();
    }
  });
  it('formats money and known statuses without changing identifiers or unknown values', () => {
    expect(formatPdfCell('1612', 'Total')).toBe('1,612.00');
    expect(formatPdfCell('0012', 'SKU')).toBe('0012');
    expect(formatPdfCell('paid', 'Estado')).toBe('Pagado');
    expect(formatPdfCell('custom', 'Estado')).toBe('custom');
    expect(formatPdfCell('Sin costo', 'Costo')).toBe('Sin costo');
  });
  it('parses quoted commas, escaped quotes, CRLF and embedded line breaks', () => {
    expect(
      parseReportCsv('name,amount\r\n"Dulces, \"\"México\"\"",15\r\n"Dos\nlíneas",20')
    ).toEqual([
      ['name', 'amount'],
      ['Dulces, "México"', '15'],
      ['Dos\nlíneas', '20'],
    ]);
    expect(() => parseReportCsv('"incomplete')).toThrow();
  });
  it('rejects invalid/reversed/oversized periods', () => {
    expect(() => validateReportPeriod('2026-02-30', '2026-03-01')).toThrow();
    expect(() => validateReportPeriod('2026-10-10', '2026-10-01')).toThrow();
    expect(() => validateReportPeriod('2000-01-01', '2026-01-01')).toThrow();
    expect(() => validateReportPeriod('2026-01-01', '2026-10-07')).not.toThrow();
  });
  it('creates a readable multipage PDF for long rows with accented names', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => [
      String(i),
      'María Fernanda López · Dulcería mexicana ' + 'Descripción extensa '.repeat(15),
      '25.50',
    ]);
    const result = await createReportPdf({
      title: 'Productos',
      organization: 'Dulcería ERP-SC',
      generatedAt: '2026-10-07T12:00:00Z',
      period: 'Información actual',
      tables: [
        {
          title: 'Catálogo',
          headers: ['SKU', 'Nombre', 'Precio'],
          rows,
          notes: ['120 productos consultados'],
        },
      ],
    });
    expect(String.fromCharCode(...result.bytes.slice(0, 5))).toBe('%PDF-');
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getTitle()).toContain('Productos');
    expect(result.base64).toMatch(/^JVBER/);
  });
  it('renders a true empty state without invented values', async () => {
    const result = await createReportPdf({
      title: 'Ventas',
      organization: 'Dulcería ERP-SC',
      generatedAt: '2026-10-07T12:00:00Z',
      period: '2026-10-07',
      tables: [{ title: 'Ventas', headers: ['Folio', 'Total'], rows: [], notes: [] }],
    });
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
  });
  it('only derives categories from known persisted description metadata', () => {
    expect(
      productClassification('Clasificación comercial: Gomitas. Precio expresado en MXN.')
    ).toBe('Gomitas');
    expect(productClassification('Clasificación comercial: Dulces.')).toBe('Dulces tradicionales');
    expect(productClassification('Clasificación comercial: Electrónica.')).toBe('');
    expect(productClassification(null)).toBe('');
  });
  it('customer history excludes cancelled/archived invoices and never mixes currencies', () => {
    const document = {
      id: 'a',
      number: 'F1',
      customerId: 'c',
      archived: false,
      status: 'paid',
      currency: 'MXN',
      issueDate: '2026-10-06',
      total: 25,
      lines: [],
      subtotal: 25,
      tax: 0,
    } satisfies ApiDocument;
    const metrics = customerMetrics('c', [
      document,
      { ...document, id: 'b', currency: 'USD', total: 100 },
      { ...document, id: 'd', status: 'cancelled' },
      { ...document, id: 'e', archived: true },
      { ...document, id: 'f', customerId: 'other' },
    ]);
    expect(metrics.totalSpent).toBe(25);
    expect(metrics.totalPurchases).toBe(2);
    expect(metrics.lastPurchase).toBe('2026-10-06');
  });
  it('exports from existing routes and exposes truncation without mixing currencies', async () => {
    const calls: string[] = [];
    configureApiSession({ token: () => 'test-token', refresh: async () => {}, expire: () => {} });
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      const data = url.includes('/organizations')
        ? [
            {
              id: '012345678901234567890123',
              kind: 'organization',
              parentId: null,
              code: 'DUL',
              name: 'Dulcería real',
              status: 'active',
            },
          ]
        : {
            csv: 'number,customer,issueDate,status,currency,total\nF1,Cliente común,2026-10-01,paid,MXN,25\nF2,María,2026-10-02,issued,USD,10',
            rowCount: 2,
            truncated: true,
          };
      return new Response(JSON.stringify({ success: true, data, meta: { total: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    try {
      const report = await loadPdfReport(
        'sales',
        '2026-10-01',
        '2026-10-07',
        '012345678901234567890123'
      );
      expect(
        calls.some((u) =>
          u.includes('/reports/sales/export?format=csv&limit=5000&from=2026-10-01&to=2026-10-07')
        )
      ).toBe(true);
      expect(report.organization).toBe('Dulcería real');
      expect(report.tables[0]!.notes).toContain('Total MXN: 25.00');
      expect(report.tables[0]!.notes).toContain('Total USD: 10.00');
      expect(report.tables[0]!.notes.some((n) => n.includes('Reporte parcial'))).toBe(true);
    } finally {
      mock.mockRestore();
    }
  });
  it('refuses CSV rows that contradict the backend row count', async () => {
    configureApiSession({ token: () => 'test-token', refresh: async () => {}, expire: () => {} });
    const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify({
            success: true,
            data: String(input).includes('/organizations')
              ? [
                  {
                    id: '012345678901234567890123',
                    kind: 'organization',
                    parentId: null,
                    code: 'DUL',
                    name: 'Dulcería real',
                    status: 'active',
                  },
                ]
              : {
                  csv: 'number,customer,issueDate,status,currency,total\nF1,A,2026-10-01,paid,MXN,25',
                  rowCount: 2,
                  truncated: false,
                },
            meta: { total: 1 },
          }),
          { status: 200 }
        )
    );
    try {
      await expect(
        loadPdfReport('sales', '2026-10-01', '2026-10-07', '012345678901234567890123')
      ).rejects.toThrow('contrato');
    } finally {
      mock.mockRestore();
    }
  });
});
