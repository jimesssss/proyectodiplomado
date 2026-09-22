/**
 * Reglas de dominio CRM: código de cliente, nombres, normalización y
 * TRANSICIONES de lead/opportunity. Puras: sin Mongoose, sin Express, sin I/O.
 */
import type { LeadStatus } from '../entities/lead.js';
import type { OpportunityStage } from '../entities/opportunity.js';

export const CODE_MIN_LENGTH = 2;
export const CODE_MAX_LENGTH = 24;
export const NAME_MAX_LENGTH = 120;
export const SUBJECT_MAX_LENGTH = 200;

const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RuleValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Normaliza un código de cliente: trim, mayúsculas, espacios → guión. Idempotente. */
export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Valida un código ya normalizado (2-24, mayúsculas/dígitos/guiones internos). */
export function validateCode(code: string): RuleValidation {
  const issues: string[] = [];
  if (code.length < CODE_MIN_LENGTH) {
    issues.push(`Code must be at least ${CODE_MIN_LENGTH} characters`);
  }
  if (code.length > CODE_MAX_LENGTH) {
    issues.push(`Code must be at most ${CODE_MAX_LENGTH} characters`);
  }
  if (!CODE_PATTERN.test(code)) {
    issues.push('Code must contain only uppercase letters, digits and inner hyphens');
  }
  return { valid: issues.length === 0, issues };
}

/** Valida y recorta un nombre (cliente/lead/oportunidad). */
export function validateName(name: string): RuleValidation & { readonly value: string } {
  const trimmed = name.trim();
  const issues: string[] = [];
  if (trimmed.length === 0) {
    issues.push('Name must not be empty');
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    issues.push(`Name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return { valid: issues.length === 0, issues, value: trimmed };
}

/** Valida el asunto de una actividad (1-200 tras recorte). */
export function validateSubject(subject: string): RuleValidation & { readonly value: string } {
  const trimmed = subject.trim();
  const issues: string[] = [];
  if (trimmed.length === 0) {
    issues.push('Subject must not be empty');
  }
  if (trimmed.length > SUBJECT_MAX_LENGTH) {
    issues.push(`Subject must be at most ${SUBJECT_MAX_LENGTH} characters`);
  }
  return { valid: issues.length === 0, issues, value: trimmed };
}

/** Normaliza un email (trim + minúsculas). El formato lo valida Zod. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Comprueba el formato de un email ya normalizado (defensa en profundidad). */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= 254;
}

/** Normaliza una moneda ISO-4217 a mayúsculas. */
export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

/** Solo lo NO archivado se archiva; solo lo archivado se restaura. */
export function canArchive(archived: boolean): boolean {
  return !archived;
}

export function canRestore(archived: boolean): boolean {
  return archived;
}

/**
 * Máquina de estados de LEAD. `converted` y `lost` son terminales.
 * Convertir exige cliente asociado (se valida en el servicio).
 */
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['contacted', 'lost'],
  contacted: ['qualified', 'lost'],
  qualified: ['converted', 'lost'],
  converted: [],
  lost: [],
};

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from].includes(to);
}

/**
 * Máquina de estados de OPORTUNIDAD. `won` y `lost` son terminales;
 * `lost` exige `lostReason` (se valida en el servicio).
 */
export const OPPORTUNITY_TRANSITIONS: Record<OpportunityStage, readonly OpportunityStage[]> = {
  prospecting: ['qualification', 'lost'],
  qualification: ['proposal', 'negotiation', 'lost'],
  proposal: ['negotiation', 'lost'],
  negotiation: ['won', 'lost'],
  won: [],
  lost: [],
};

export function canTransitionOpportunity(from: OpportunityStage, to: OpportunityStage): boolean {
  return OPPORTUNITY_TRANSITIONS[from].includes(to);
}

/** Término de búsqueda seguro: 2-100 tras recorte (el escaping es en repo). */
export function sanitizeSearchTerm(term: string): RuleValidation & { readonly value: string } {
  const trimmed = term.trim();
  const issues: string[] = [];
  if (trimmed.length < 2) {
    issues.push('Search term must be at least 2 characters');
  }
  if (trimmed.length > 100) {
    issues.push('Search term must be at most 100 characters');
  }
  return { valid: issues.length === 0, issues, value: trimmed };
}

/** Escapa metacaracteres de regex para búsqueda literal (seguridad: sin ReDoS). */
export function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
