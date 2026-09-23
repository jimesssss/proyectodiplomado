/**
 * Reglas puras de AI (FASE 20): redacción del prompt (ADR-008: se guarda
 * "prompt redactado"), truncado con marcador y redacción del error de una
 * tool fallida. Puras: sin Mongoose, sin Express, sin I/O.
 */

export const PROMPT_MAX = 2_000;
export const ERROR_MAX = 300;

/**
 * Elimina caracteres de control por CODE-POINT (conserva `\t`=9, `\n`=10 y
 * `\r`=13 — un prompt multilínea es legítimo; fuera 0-8, 11-12, 14-31 y
 * 127). La redacción es de FORMATO, no de PII: sin detección de datos
 * personales (PARTIAL documentado).
 */
export function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 9 || code === 10 || code === 13) {
      out += char;
      continue;
    }
    if (code < 32 || code === 127) {
      continue;
    }
    out += char;
  }
  return out;
}

/** Trunca a `max` sustituyendo el final por `…` (el resultado cabe en `max`). */
export function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

/** Prompt apto para persistir: sin controles, recortado y ≤ `PROMPT_MAX`. */
export function redactPrompt(value: string | undefined | null): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const cleaned = stripControls(value).trim();
  if (cleaned === '') {
    return null;
  }
  return truncate(cleaned, PROMPT_MAX);
}

/** Mensaje de un error de tool para persistir: string o 'Unknown error'. */
export function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return truncate(stripControls(message), ERROR_MAX);
}
