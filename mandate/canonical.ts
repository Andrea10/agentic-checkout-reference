import { SIGNATURE_FIELD } from './types.js';

import type { MandateClaims } from './types.js';

/**
 * Thrown when an object cannot be turned into canonical bytes, so no signature
 * can be produced or checked over it. Not a policy refusal.
 */
export class CanonicalisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalisationError';
  }
}

/**
 * Canonical serialisation of the signed fields of a mandate.
 *
 * The rules, in full:
 *
 * 1. `signature` is removed. Everything else present is signed, so a field
 *    added to the mandate later is covered without touching this function.
 * 2. Keys are sorted by UTF-16 code unit, so key order in the incoming object
 *    cannot change the bytes.
 * 3. The result is JSON with no insignificant whitespace, signed as UTF-8.
 * 4. Fields whose value is `undefined` are omitted, matching `JSON.stringify`.
 *
 * The mandate is flat (decision D10), so there is no nesting to recurse into.
 */
export function canonicalise(claims: MandateClaims): string {
  const entries = Object.entries(claims as unknown as Record<string, unknown>)
    .filter(([key, value]) => key !== SIGNATURE_FIELD && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const members = entries.map(([key, value]) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new CanonicalisationError(`field ${key} is not a finite number`);
    }
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new CanonicalisationError(`field ${key} is not serialisable as JSON`);
    }
    return `${JSON.stringify(key)}:${encoded}`;
  });

  return `{${members.join(',')}}`;
}

/** The exact bytes that are signed and verified. */
export function canonicalBytes(claims: MandateClaims): Buffer {
  return Buffer.from(canonicalise(claims), 'utf8');
}
