/**
 * Numeración secuencial de documentos (FASE 9+).
 * Único dueño de la colección `counters`: un documento por serie
 * `{tenantId}:{series}:{year}` con `$inc` atómico (upsert) — sin lost-update
 * bajo concurrencia. El año parte la serie (reset anual).
 * La parte pura (`formatNumber`, `buildCounterKey`) vive separada y se testea
 * sin base de datos.
 */
import { Schema, model, models, type Model } from 'mongoose';

export const COUNTERS_COLLECTION = 'counters';

interface CounterDoc {
  _id: string;
  seq: number;
}

function getModel(): Model<CounterDoc> {
  const existing = models[COUNTERS_COLLECTION] as Model<CounterDoc> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const schema = new Schema<CounterDoc>(
    {
      _id: { type: String, required: true },
      seq: { type: Number, required: true, min: 0 },
    },
    { collection: COUNTERS_COLLECTION },
  );
  return model<CounterDoc>(COUNTERS_COLLECTION, schema);
}

/** Clave de contador: tenant + serie + año (aislamiento entre tenants). */
export function buildCounterKey(tenantId: string, series: string, year: number): string {
  return `${tenantId}:${series}:${year}`;
}

/** Formato canónico `PREFIX-YYYY-000001` (6 dígitos, cero a la izquierda). */
export function formatNumber(prefix: string, year: number, seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error('Sequence must be a positive integer');
  }
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Siguiente número de documento para `{tenantId, series}` en el año actual
 * (UTC). Atómico: `$inc` sobre el contador del tenant — dos peticiones
 * concurrentes nunca reciben el mismo número.
 */
export async function nextDocumentNumber(
  tenantId: string,
  series: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const counter = getModel();
  const doc = await counter.findOneAndUpdate(
    { _id: buildCounterKey(tenantId, series, year) },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  if (doc === null) {
    throw new Error('counter increment failed');
  }
  return formatNumber(prefix, year, doc.seq);
}
