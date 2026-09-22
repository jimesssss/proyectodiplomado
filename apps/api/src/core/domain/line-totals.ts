/**
 * Reglas de cálculo de documentos con líneas (FASE 9 → extraído en FASE 10
 * para compartirlas entre Sales y Purchasing). Puras: sin Mongoose, sin
 * Express, sin I/O. El dinero se calcula SIEMPRE en el servidor a 2 decimales
 * (redondeo comercial: mitad hacia arriba); el descuento se aplica ANTES del
 * impuesto.
 */

export const LINES_MAX = 200;
export const QUANTITY_MAX = 1_000_000;
export const MONEY_MAX = 1e12;

/** Entrada de línea tal como llega del cliente (importes NO incluidos). */
export interface DocumentLineInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
  readonly discountPct: number;
}

/** Línea calculada por el servidor (`subtotal`/`tax`/`total` a 2 decimales). */
export interface DocumentLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly taxRate: number;
  readonly discountPct: number;
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
}

/** Redondeo comercial a 2 decimales (para el total de línea y los totales). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula una línea: `subtotal = qty × precio × (1 - dto%)` (2 dec.),
 * `tax = subtotal × taxRate%` (2 dec.), `total = subtotal + tax`.
 * El descuento se aplica ANTES del impuesto.
 */
export function computeLine(input: DocumentLineInput): DocumentLine {
  const base = roundMoney(input.quantity * input.unitPrice * (1 - input.discountPct / 100));
  const tax = roundMoney(base * (input.taxRate / 100));
  return {
    description: input.description,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    taxRate: input.taxRate,
    discountPct: input.discountPct,
    subtotal: base,
    tax,
    total: roundMoney(base + tax),
  };
}

/** Totales del documento = suma de líneas YA redondeadas (2 dec.). */
export function computeTotals(lines: readonly DocumentLine[]): {
  readonly subtotal: number;
  readonly tax: number;
  readonly total: number;
} {
  let subtotal = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal = roundMoney(subtotal + line.subtotal);
    tax = roundMoney(tax + line.tax);
  }
  return { subtotal, tax, total: roundMoney(subtotal + tax) };
}

/** Normaliza las líneas de entrada calculando sus importes en el servidor. */
export function normalizeLines(inputs: readonly DocumentLineInput[]): readonly DocumentLine[] {
  return inputs.map(computeLine);
}
