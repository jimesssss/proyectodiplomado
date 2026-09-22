import { z } from 'zod';
import { ACCOUNT_NATURES } from '../../domain/entities/account.js';
import { PERIOD_STATUSES } from '../../domain/entities/fiscal-period.js';
import { JOURNAL_STATUSES } from '../../domain/entities/journal-entry.js';
import {
  LINE_DESCRIPTION_MAX,
  MONEY_MAX,
  NOTES_MAX,
  REFERENCE_MAX,
} from '../../domain/rules/accounting-rules.js';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdPattern, 'Invalid id');

/**
 * Esquemas estrictos: cualquier campo desconocido (incluido `tenantId`,
 * `number`, `status`/`archived` en create, `debitTotal`/`creditTotal` o
 * `periodId` — todos SOLO-los-escribe-el-servidor) se RECHAZA con 400
 * (ADR-002).
 */

const pageField = z.coerce.number().int().min(1).max(10_000).default(1);
const limitField = z.coerce.number().int().min(1).max(100).default(20);
const archivedField = z.enum(['true', 'false']).transform((value) => value === 'true');
const currencyField = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'Invalid currency (ISO-4217)')
  .optional();

// --- Plan contable (cuentas) ---

export const createAccountBodySchema = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  nature: z.enum(ACCOUNT_NATURES),
  description: z.string().max(2_000).optional(),
});

/** `code` y `nature` NO existen en el PATCH: inmutables (→ 400). */
export const patchAccountBodySchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const accountListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

// --- Impuestos ---

export const createTaxBodySchema = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  rate: z.number().min(0).max(100),
  description: z.string().max(2_000).optional(),
});

/** `code` NO existe en el PATCH: inmutable (→ 400). */
export const patchTaxBodySchema = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  rate: z.number().min(0).max(100).optional(),
  description: z.string().max(2_000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const taxListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  archived: archivedField.optional(),
});

// --- Períodos fiscales ---

/** `code`/fechas inmutables: el PATCH solo admite `name`/`status` (→ 400). */
export const createPeriodBodySchema = z
  .strictObject({
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(120).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.startsAt.getTime() >= value.endsAt.getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endsAt'],
        message: 'endsAt must be after startsAt',
      });
    }
  });

export const patchPeriodBodySchema = z.strictObject({
  name: z.string().min(1).max(120).nullable().optional(),
  // `closed` en el enum a propósito: la máquina decide (409 si no aplica).
  status: z.enum(PERIOD_STATUSES).optional(),
});

export const periodListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(PERIOD_STATUSES).optional(),
});

// --- Asientos contables (partida doble) ---

/**
 * Línea de asiento: XOR débito/haber — exactamente UNO ≥ 0.01 y el otro
 * exactamente 0 (el servidor además exige DEBIT=CREDIT en los totales →
 * 422). El mínimo 0.01 evita que el redondeo a 2 decimales anule una cara.
 */
const journalLineSchema = z
  .strictObject({
    accountId: objectId,
    description: z.string().max(LINE_DESCRIPTION_MAX).optional(),
    debit: z.number().min(0).max(MONEY_MAX),
    credit: z.number().min(0).max(MONEY_MAX),
  })
  .superRefine((line, ctx) => {
    const valid =
      (line.debit >= 0.01 && line.credit === 0) || (line.credit >= 0.01 && line.debit === 0);
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credit'],
        message: 'Each line needs exactly one amount ≥ 0.01 and the other side 0',
      });
    }
  });

export const createJournalBodySchema = z.strictObject({
  // Doble partida: mínimo 2 líneas (máx. 200 — decisión ADR-003).
  lines: z.array(journalLineSchema).min(2).max(200),
  currency: currencyField,
  date: z.coerce.date().optional(),
  reference: z.string().max(REFERENCE_MAX).optional(),
  notes: z.string().max(NOTES_MAX).optional(),
});

export const patchJournalBodySchema = z.strictObject({
  lines: z.array(journalLineSchema).min(2).max(200).optional(),
  currency: currencyField,
  date: z.coerce.date().optional(),
  reference: z.string().max(REFERENCE_MAX).nullable().optional(),
  notes: z.string().max(NOTES_MAX).nullable().optional(),
  // `posted` está en el enum a propósito: el servicio responde 409 indicando
  // el endpoint de posting (el cliente ve un error accionable, no un 400).
  status: z.enum(JOURNAL_STATUSES).optional(),
});

export const journalListQuerySchema = z.object({
  page: pageField,
  limit: limitField,
  status: z.enum(JOURNAL_STATUSES).optional(),
  accountId: objectId.optional(),
  periodId: objectId.optional(),
});
