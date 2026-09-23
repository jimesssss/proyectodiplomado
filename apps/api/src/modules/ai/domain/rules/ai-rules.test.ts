/**
 * Reglas de dominio AI — FASE 20.
 * Puras (sin Mongo/Express): redacción del prompt (controles fuera,
 * blancos → null, truncado con `…`), redacción de errores y los
 * estados del registro de gobernanza.
 */
import { describe, expect, it } from 'vitest';
import { AI_INTERACTION_STATUSES } from '../entities/ai-interaction.js';
import {
  ERROR_MAX,
  PROMPT_MAX,
  redactError,
  redactPrompt,
  stripControls,
  truncate,
} from './ai-rules.js';

/** BEL (7) y DEL (127) como código — nunca bytes literales en el test. */
const BEL = String.fromCharCode(7);
const DEL = String.fromCharCode(127);
const NUL = String.fromCharCode(0);
const VT = String.fromCharCode(11);

describe('ai rules: estados del registro', () => {
  it('completed y failed en ese orden', () => {
    expect([...AI_INTERACTION_STATUSES]).toEqual(['completed', 'failed']);
  });
});

describe('ai rules: stripControls', () => {
  it('elimina controles por code-point conservando tab/newline/CR', () => {
    expect(stripControls(`hola${BEL} mundo`)).toBe('hola mundo');
    expect(stripControls(`${NUL}${VT}${DEL}x`)).toBe('x');
    expect(stripControls('linea1\nlinea2')).toBe('linea1\nlinea2'); // \n se conserva
    expect(stripControls('col1\tcol2\r')).toBe('col1\tcol2\r'); // \t y \r
    expect(stripControls('sin controles')).toBe('sin controles');
  });
});

describe('ai rules: redacción del prompt', () => {
  it('undefined/null y blancos → null (no se persiste vacío)', () => {
    expect(redactPrompt(undefined)).toBeNull();
    expect(redactPrompt(null)).toBeNull();
    expect(redactPrompt('')).toBeNull();
    expect(redactPrompt('   \n  ')).toBeNull();
    expect(redactPrompt(BEL + '  ')).toBeNull(); // solo controles + blancos
  });

  it('elimina controles y recorta extremos', () => {
    expect(redactPrompt(`  hola${BEL} mundo  `)).toBe('hola mundo');
    expect(redactPrompt('linea1\nlinea2')).toBe('linea1\nlinea2'); // multilínea ok
    expect(redactPrompt(`prompt${DEL}`)).toBe('prompt');
  });

  it(`trunca a ${PROMPT_MAX} con marcador …`, () => {
    const long = 'x'.repeat(PROMPT_MAX + 500);
    const redacted = redactPrompt(long);
    expect(redacted).not.toBeNull();
    expect(redacted?.length).toBe(PROMPT_MAX);
    expect(redacted?.endsWith('…')).toBe(true);
    const exact = 'y'.repeat(PROMPT_MAX);
    expect(redactPrompt(exact)).toBe(exact); // sin truncar si cabe exacto
  });
});

describe('ai rules: truncate y redactError', () => {
  it('truncate: sin cambios si cabe (incluso en longitud exacta); con … si excede', () => {
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate('abcdef', 6)).toBe('abcdef'); // longitud exacta → sin cambios
    expect(truncate('abcdef', 5)).toBe('abcd…'); // excede → … y long. final = max
    expect(truncate('abcdef', 3)).toBe('ab…');
  });

  it('redactError: mensaje de Error, controles fuera y truncado', () => {
    expect(redactError(new Error('boom'))).toBe('boom');
    expect(redactError(new Error(`bad${BEL}`))).toBe('bad');
    expect(redactError('no es error')).toBe('Unknown error');
    expect(redactError(null)).toBe('Unknown error');
    const long = redactError(new Error('z'.repeat(ERROR_MAX + 100)));
    expect(long.length).toBe(ERROR_MAX);
    expect(long.endsWith('…')).toBe(true);
  });
});
