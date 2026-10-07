import { apiRequest } from './api-client';
import { businessApi } from './business-api';
import { listProducts } from './inventory-api';
import { listPayments, listAccounts } from './treasury-api';
import { listOrganizations } from './organization-api';

export type PdfReportKey =
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'expenses'
  | 'cashflow'
  | 'general';
export interface ReportTable {
  title: string;
  headers: string[];
  rows: string[][];
  notes: string[];
}
export interface ReportDocument {
  title: string;
  organization: string;
  generatedAt: string;
  period: string;
  tables: ReportTable[];
}
export const PDF_REPORTS: {
  key: PdfReportKey;
  title: string;
  description: string;
  range: boolean;
  permissions: string[];
}[] = [
  {
    key: 'sales',
    title: 'Ventas',
    description: 'Facturas emitidas y pagadas',
    range: true,
    permissions: ['sales.invoice:read', 'customer:read'],
  },
  {
    key: 'purchases',
    title: 'Compras',
    description: 'Facturas de proveedores',
    range: true,
    permissions: ['supplier.invoice:read', 'supplier:read'],
  },
  {
    key: 'inventory',
    title: 'Inventario',
    description: 'Existencias y valor actuales',
    range: false,
    permissions: ['product:read', 'stock.movement:read'],
  },
  {
    key: 'products',
    title: 'Productos',
    description: 'Catálogo, precios y costos',
    range: false,
    permissions: ['product:read'],
  },
  {
    key: 'customers',
    title: 'Clientes',
    description: 'Directorio de clientes',
    range: false,
    permissions: ['customer:read'],
  },
  {
    key: 'suppliers',
    title: 'Proveedores',
    description: 'Directorio de proveedores',
    range: false,
    permissions: ['supplier:read'],
  },
  {
    key: 'expenses',
    title: 'Gastos / pagos',
    description: 'Pagos reales de tesorería',
    range: true,
    permissions: ['payment:read', 'bank.account:read'],
  },
  {
    key: 'cashflow',
    title: 'Caja / tesorería',
    description: 'Ingresos, egresos y movimientos',
    range: true,
    permissions: ['bank.account:read'],
  },
  {
    key: 'general',
    title: 'Reporte general',
    description: 'Resumen de todas las áreas',
    range: true,
    permissions: [],
  },
];
PDF_REPORTS[8]!.permissions = [...new Set(PDF_REPORTS.slice(0, 8).flatMap((r) => r.permissions))];

/** CSV del backend: comillas escapadas, CRLF y saltos de línea dentro de celdas. */
export function parseReportCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]!;
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && csv[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('El reporte recibido tiene un formato incompleto.');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
export function validateReportPeriod(from: string, to: string): void {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v;
  if (!valid(from) || !valid(to) || from > to)
    throw Error('Revisa el periodo: usa fechas válidas AAAA-MM-DD y un inicio anterior al fin.');
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3650)
    throw Error('Selecciona un periodo de hasta diez años.');
}
const money = (v: number) =>
  v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function monetaryNotes(rows: string[][], amountIndex: number, currencyIndex: number): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const n = Number(row[amountIndex]);
    if (Number.isFinite(n))
      totals.set(row[currencyIndex] ?? '', (totals.get(row[currencyIndex] ?? '') ?? 0) + n);
  }
  return [...totals].map(([currency, n]) => `Total ${currency}: ${money(n)}`);
}
async function exportTable(
  key: 'sales' | 'purchases' | 'inventory' | 'cashflow',
  from: string,
  to: string
): Promise<ReportTable> {
  const query =
    key === 'inventory' ? 'format=csv&limit=5000' : `format=csv&limit=5000&from=${from}&to=${to}`;
  const payload = (
    await apiRequest<{ csv: string; truncated: boolean; rowCount: number }>(
      `/reports/${key}/export?${query}`
    )
  ).data;
  const [headers = [], ...raw] = parseReportCsv(payload.csv);
  const definitions =
    key === 'sales' || key === 'purchases'
      ? [
          ['number', 'Folio'],
          [key === 'sales' ? 'customer' : 'supplier', key === 'sales' ? 'Cliente' : 'Proveedor'],
          ['issueDate', 'Fecha'],
          ['status', 'Estado'],
          ['currency', 'Moneda'],
          ['total', 'Total'],
        ]
      : key === 'inventory'
        ? [
            ['code', 'SKU'],
            ['name', 'Producto'],
            ['unit', 'Unidad'],
            ['minStock', 'Mínimo'],
            ['qty', 'Existencia'],
            ['cost', 'Costo'],
            ['value', 'Valor'],
          ]
        : [
            ['createdAt', 'Fecha'],
            ['accountId', 'Cuenta'],
            ['currency', 'Moneda'],
            ['sourceType', 'Origen'],
            ['amount', 'Importe'],
            ['balanceAfter', 'Saldo'],
            ['reason', 'Concepto'],
          ];
  const indexes = definitions.map((d) => headers.indexOf(d[0]!));
  if (indexes.some((i) => i < 0) || raw.length !== payload.rowCount)
    throw Error('El reporte recibido no coincide con su contrato.');
  const rows = raw.map((r) => indexes.map((i) => r[i] ?? ''));
  const notes = [
    `${rows.length} registros incluidos`,
    ...(payload.truncated
      ? [
          'Reporte parcial: se alcanzó el límite de 5000 filas. Los totales corresponden solo a las filas incluidas.',
        ]
      : []),
  ];
  if (key === 'sales' || key === 'purchases') notes.push(...monetaryNotes(rows, 5, 4));
  if (key === 'cashflow') {
    const accounts = await listAccounts();
    for (const currency of new Set(rows.map((r) => r[2]!))) {
      const amounts = rows
        .filter((r) => r[2] === currency && r[3] !== 'opening')
        .map((r) => Number(r[4]));
      const opening = rows
        .filter((r) => r[2] === currency && r[3] === 'opening')
        .reduce((sum, r) => sum + Number(r[4]), 0);
      notes.push(
        `${currency} · Ingresos: ${money(amounts.filter((n) => n > 0).reduce((a, b) => a + b, 0))} · Egresos: ${money(-amounts.filter((n) => n < 0).reduce((a, b) => a + b, 0))}`,
        `Aperturas registradas en el periodo · ${currency}: ${money(opening)}`
      );
    }
    for (const row of rows) row[1] = accounts.find((a) => a.id === row[1])?.name ?? row[1]!;
  }
  if (key === 'inventory')
    notes.push('Existencias actuales. El catálogo no especifica moneda para costos y valor.');
  return {
    title: PDF_REPORTS.find((r) => r.key === key)!.title,
    headers: definitions.map((d) => d[1]!),
    rows,
    notes,
  };
}
async function loadTable(
  key: Exclude<PdfReportKey, 'general'>,
  from: string,
  to: string
): Promise<ReportTable> {
  if (key === 'sales' || key === 'purchases' || key === 'inventory' || key === 'cashflow')
    return exportTable(key, from, to);
  if (key === 'products') {
    const products = await listProducts();
    return {
      title: 'Productos',
      headers: ['SKU', 'Producto', 'Unidad', 'Precio', 'Costo', 'Estado'],
      rows: products.map((p) => [
        p.code,
        p.name,
        p.unit,
        p.price === null ? 'Sin precio' : money(p.price),
        p.cost === null ? 'Sin costo' : money(p.cost),
        p.archived ? 'Archivado' : 'Activo',
      ]),
      notes: [
        `${products.length} productos. Catálogo actual; no especifica moneda para precios y costos.`,
      ],
    };
  }
  if (key === 'customers' || key === 'suppliers') {
    const parties = await (key === 'customers'
      ? businessApi.listCustomers()
      : businessApi.listSuppliers());
    return {
      title: key === 'customers' ? 'Clientes' : 'Proveedores',
      headers: ['Código', 'Nombre', 'Teléfono', 'Correo', 'Estado'],
      rows: parties.map((p) => [
        p.code,
        p.name,
        p.phone ?? 'No registrado',
        p.email ?? 'No registrado',
        p.archived ? 'Archivado' : 'Activo',
      ]),
      notes: [`${parties.length} registros. Directorio actual, sin filtro histórico.`],
    };
  }
  const [payments, accounts] = await Promise.all([listPayments(), listAccounts()]);
  const rows = payments
    .filter((p) => p.date.slice(0, 10) >= from && p.date.slice(0, 10) <= to)
    .map((p) => [
      p.number,
      p.notes ?? 'Sin concepto',
      p.date.slice(0, 10),
      p.status,
      accounts.find((a) => a.id === p.accountId)?.currency ?? 'Sin moneda',
      String(p.amount),
    ]);
  return {
    title: 'Gastos / pagos',
    headers: ['Folio', 'Concepto', 'Fecha', 'Estado', 'Moneda', 'Importe'],
    rows,
    notes: [
      `${rows.length} pagos. Incluye estado; solo los contabilizados se suman.`,
      ...monetaryNotes(
        rows.filter((r) => r[3] === 'posted'),
        5,
        4
      ),
      'Incluye pagos de compras y otros pagos, no exclusivamente gastos operativos.',
    ],
  };
}
export async function loadPdfReport(
  key: PdfReportKey,
  from: string,
  to: string,
  organizationId: string
): Promise<ReportDocument> {
  const definition = PDF_REPORTS.find((r) => r.key === key);
  if (!definition) throw Error('Selecciona un reporte disponible.');
  if (definition.range) validateReportPeriod(from, to);
  const organizations = await listOrganizations();
  const organization = organizations.find((o) => o.id === organizationId && o.status === 'active');
  if (!organization) throw Error('Selecciona una organización activa para el encabezado.');
  const keys =
    key === 'general'
      ? PDF_REPORTS.slice(0, 8).map((r) => r.key as Exclude<PdfReportKey, 'general'>)
      : [key];
  const tables: ReportTable[] = [];
  for (const k of keys) tables.push(await loadTable(k, from, to));
  return {
    title: definition.title,
    organization: organization.name,
    generatedAt: new Date().toISOString(),
    period: definition.range ? `${from} a ${to}` : 'Información actual',
    tables,
  };
}
