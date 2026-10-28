/**
 * Tests for the audit log: that it only ever grows, that an entry cannot be
 * edited once written, that both kinds of entry — the mandate decisions and
 * the settlements T07c added (D94) — go in the one log in the order they
 * happened, and that printing it goes to the stream the caller names and
 * nowhere else.
 *
 * The format of a *check* line is pinned here character by character, because
 * the demo prints this log and a settlement entry was not allowed to move a
 * column of it (D95).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AuditLog, formatEntry } from '../../mandate/index.js';

import type {
  AuditEntry,
  MandateCheckEntry,
  OutputStream,
  PolicyDecision,
  SettlementEntry,
  SettlementRecord,
} from '../../mandate/index.js';

const MANDATE = '7f1c2a5e-9b3d-4c81-a2f6-0d5e8b4a1c33';

/** The shared part of every decision below. */
const attempt = {
  mandate_id: MANDATE,
  agent: 'agent-buyer-1',
  merchant: 'merchant-demo',
  amount_minor: 2500,
  currency: 'GBP',
  checked_at: '2026-10-25T12:00:00.000Z',
} as const;

const allowed: PolicyDecision = { ...attempt, outcome: 'allow', remaining_budget_minor: 5000 };

const confirmed: PolicyDecision = {
  ...attempt,
  outcome: 'confirm_required',
  remaining_budget_minor: 5000,
  human_confirm_above_minor: 2000,
};

const refused: PolicyDecision = {
  ...attempt,
  outcome: 'refuse',
  refusals: [
    { reason: 'merchant_mismatch', message: 'wrong merchant' },
    { reason: 'mandate_expired', message: 'too late' },
  ],
};

const ORDER = 'order_000001';

/** The shared part of every settlement below. */
const settled = {
  at: '2026-10-25T12:00:01.000Z',
  mandate_id: MANDATE,
  order_id: ORDER,
  amount_minor: 2500,
  currency: 'GBP',
} as const;

const paid: SettlementRecord = { ...settled, outcome: 'paid' };

const declined: SettlementRecord = {
  ...settled,
  outcome: 'payment_declined',
  decline: { code: 'insufficient_funds', origin: 'issuer' },
};

const captureFailed: SettlementRecord = {
  ...settled,
  outcome: 'capture_failed',
  decline: { code: 'authorisation_already_captured', origin: 'rail' },
};

const unavailable: SettlementRecord = {
  ...settled,
  outcome: 'rail_unavailable',
  rail_call: 'authorise',
};

/**
 * The entry at `index`, asserted to be a check.
 *
 * `entries()` is a union since T07c, and a test that reached for `.reasons`
 * on whatever came back would compile only because the compiler had been
 * told to stop caring.
 */
function checkAt(log: AuditLog, index: number): MandateCheckEntry {
  const entry = log.entries()[index];
  expect(entry?.kind).toBe('mandate_check');
  if (entry?.kind !== 'mandate_check') throw new Error('not a check');
  return entry;
}

/** A stream that keeps what was written to it, in place of a real one. */
function collectingStream(): { readonly written: string[]; readonly stream: OutputStream } {
  const written: string[] = [];
  return { written, stream: { write: (chunk) => written.push(chunk) } };
}

describe('AuditLog.record', () => {
  it('records a check that passed', () => {
    const log = new AuditLog();

    expect(log.record(allowed)).toEqual<MandateCheckEntry>({
      kind: 'mandate_check',
      at: '2026-10-25T12:00:00.000Z',
      mandate_id: MANDATE,
      agent: 'agent-buyer-1',
      merchant: 'merchant-demo',
      amount_minor: 2500,
      currency: 'GBP',
      outcome: 'allow',
      reasons: [],
    });
  });

  it('records a check that needs a human, with no reasons: it is not a refusal', () => {
    const log = new AuditLog();

    expect(log.record(confirmed)).toMatchObject({ outcome: 'confirm_required', reasons: [] });
  });

  it('records one reason code per failed check, in check order', () => {
    const log = new AuditLog();

    expect(log.record(refused).reasons).toEqual(['merchant_mismatch', 'mandate_expired']);
  });

  it('timestamps the entry from the decision, which read the injected clock', () => {
    const log = new AuditLog();

    log.record({ ...allowed, checked_at: '2026-01-01T00:00:00.000Z' });

    expect(log.entries()[0]?.at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps every check, oldest first', () => {
    const log = new AuditLog();

    log.record(allowed);
    log.record(refused);
    log.record(confirmed);

    expect(log.size).toBe(3);
    expect(log.entries().map((entry) => entry.outcome)).toEqual([
      'allow',
      'refuse',
      'confirm_required',
    ]);
  });
});

describe('AuditLog, append-only', () => {
  it('hands back a copy, so a caller cannot add to the log through it', () => {
    const log = new AuditLog();
    log.record(allowed);

    const entries = log.entries() as AuditEntry[];
    entries.push(refused as unknown as AuditEntry);

    expect(log.size).toBe(1);
    expect(log.entries()).toHaveLength(1);
  });

  it('hands back a copy, so a caller cannot remove an entry through it', () => {
    const log = new AuditLog();
    log.record(allowed);

    (log.entries() as AuditEntry[]).length = 0;

    expect(log.entries()).toHaveLength(1);
  });

  it('freezes each entry, so a recorded outcome cannot be rewritten', () => {
    const log = new AuditLog();
    const entry = log.record(refused);

    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      (entry as { outcome: string }).outcome = 'allow';
    }).toThrow(TypeError);
    expect(log.entries()[0]?.outcome).toBe('refuse');
  });

  it('freezes the reasons, so a refusal cannot lose one', () => {
    const log = new AuditLog();
    const entry = log.record(refused);

    expect(() => (entry.reasons as string[]).push('nonsense')).toThrow(TypeError);
    expect(checkAt(log, 0).reasons).toHaveLength(2);
  });

  it('is unaffected by later edits to the refusals it was given', () => {
    const refusals = [{ reason: 'mandate_expired' as const, message: 'too late' }];
    const log = new AuditLog();

    log.record({ ...attempt, outcome: 'refuse', refusals });
    refusals.push({ reason: 'mandate_expired', message: 'again' });

    expect(checkAt(log, 0).reasons).toEqual(['mandate_expired']);
  });
});

describe('AuditLog.print', () => {
  it('writes one line per check to the stream it is given', () => {
    const log = new AuditLog();
    log.record(allowed);
    log.record(refused);
    const { written, stream } = collectingStream();

    log.print(stream);

    const lines = written.join('').split('\n').slice(0, -1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('allow');
    expect(lines[1]).toContain('merchant_mismatch, mandate_expired');
  });

  it('writes nothing at all when no check has been made', () => {
    const { written, stream } = collectingStream();

    new AuditLog().print(stream);

    expect(written).toEqual([]);
  });

  it('ends every line, so the next writer starts on its own', () => {
    const log = new AuditLog();
    log.record(allowed);
    const { written, stream } = collectingStream();

    log.print(stream);

    expect(written.join('').endsWith('\n')).toBe(true);
  });
});

describe('formatEntry', () => {
  it('puts the time, outcome, amount, parties, mandate and reasons on one line', () => {
    const entry = new AuditLog().record(refused);

    // The outcome sits in a column 16 wide, the width of `confirm_required`,
    // and the fields are two spaces apart.
    expect(formatEntry(entry)).toBe(
      `2026-10-25T12:00:00.000Z  refuse${' '.repeat(10)}  2500 GBP  ` +
        'agent-buyer-1 -> merchant-demo  ' +
        `mandate ${MANDATE}  merchant_mismatch, mandate_expired`,
    );
  });

  it('writes a dash where a passed check has no reason', () => {
    const entry = new AuditLog().record(allowed);

    expect(formatEntry(entry).endsWith('  -')).toBe(true);
  });
});

describe('AuditLog.recordSettlement (D94)', () => {
  it('records a payment that went through', () => {
    const log = new AuditLog();

    expect(log.recordSettlement(paid)).toEqual<SettlementEntry>({
      kind: 'settlement',
      at: '2026-10-25T12:00:01.000Z',
      mandate_id: MANDATE,
      order_id: ORDER,
      amount_minor: 2500,
      currency: 'GBP',
      outcome: 'paid',
    });
  });

  it('leaves the decline and the rail call off a payment that went through', () => {
    const entry = new AuditLog().recordSettlement(paid);

    // Absent, not present-and-undefined: a reader checking `'decline' in entry`
    // should learn the same thing as one checking the value.
    expect('decline' in entry).toBe(false);
    expect('rail_call' in entry).toBe(false);
  });

  it('records a decline with the rail’s own code and who said no (D53, D96)', () => {
    const entry = new AuditLog().recordSettlement(declined);

    expect(entry.outcome).toBe('payment_declined');
    expect(entry.decline).toEqual({ code: 'insufficient_funds', origin: 'issuer' });
    // The origin is the distinction only payments needs: an issuer refusing a
    // cardholder's money is not the payment system rejecting a request.
    expect(entry.decline?.origin).toBe('issuer');
  });

  it('records a refused capture as its own outcome, not as a decline (D81)', () => {
    const entry = new AuditLog().recordSettlement(captureFailed);

    expect(entry.outcome).toBe('capture_failed');
    expect(entry.decline?.code).toBe('authorisation_already_captured');
    expect(entry.decline?.origin).toBe('rail');
  });

  it('records a rail that never answered, naming the call and nothing else (D85)', () => {
    const entry = new AuditLog().recordSettlement(unavailable);

    expect(entry.outcome).toBe('rail_unavailable');
    expect(entry.rail_call).toBe('authorise');
    // Nothing was declined, so there is no decline to mistake for one.
    expect(entry.decline).toBeUndefined();
  });

  it('carries no message, no key and no signature: only a code and an origin (D96)', () => {
    const entry = new AuditLog().recordSettlement(declined);

    expect(Object.keys(entry).sort()).toEqual([
      'amount_minor',
      'at',
      'currency',
      'decline',
      'kind',
      'mandate_id',
      'order_id',
      'outcome',
    ]);
    expect(Object.keys(entry.decline ?? {}).sort()).toEqual(['code', 'origin']);
  });

  it('keeps checks and settlements in one log, in the order they happened', () => {
    const log = new AuditLog();

    log.record(allowed);
    log.recordSettlement(paid);
    log.record(confirmed);
    log.recordSettlement(declined);

    expect(log.size).toBe(4);
    expect(log.entries().map((entry) => entry.kind)).toEqual([
      'mandate_check',
      'settlement',
      'mandate_check',
      'settlement',
    ]);
    expect(log.entries().map((entry) => entry.outcome)).toEqual([
      'allow',
      'paid',
      'confirm_required',
      'payment_declined',
    ]);
  });

  it('freezes a settlement, so a recorded outcome cannot be rewritten', () => {
    const log = new AuditLog();
    const entry = log.recordSettlement(declined);

    expect(Object.isFrozen(entry)).toBe(true);
    expect(() => {
      (entry as { outcome: string }).outcome = 'paid';
    }).toThrow(TypeError);
    expect(log.entries()[0]?.outcome).toBe('payment_declined');
  });

  it('freezes the decline, so a refusal cannot change its code afterwards', () => {
    const entry = new AuditLog().recordSettlement(declined);

    expect(() => {
      (entry.decline as { code: string }).code = 'card_declined';
    }).toThrow(TypeError);
    expect(entry.decline?.code).toBe('insufficient_funds');
  });

  it('is unaffected by later edits to the decline it was given', () => {
    const decline = { code: 'insufficient_funds', origin: 'issuer' };
    const log = new AuditLog();

    log.recordSettlement({ ...settled, outcome: 'payment_declined', decline });
    decline.code = 'card_declined';

    const entry = log.entries()[0];
    expect(entry?.kind === 'settlement' ? entry.decline?.code : '').toBe('insufficient_funds');
  });

  it('cannot be removed through the copy `entries()` hands back', () => {
    const log = new AuditLog();
    log.recordSettlement(paid);

    (log.entries() as AuditEntry[]).length = 0;

    expect(log.size).toBe(1);
  });
});

describe('formatEntry, settlement lines (D95)', () => {
  /** The columns a settlement shares with a check, for the three cases below. */
  const prefix = `2026-10-25T12:00:01.000Z  `;

  it('prints a payment in the same columns as a check, with the order in place of the parties', () => {
    const entry = new AuditLog().recordSettlement(paid);

    expect(formatEntry(entry)).toBe(
      `${prefix}paid${' '.repeat(12)}  2500 GBP  ` +
        `order ${ORDER}  ` +
        `mandate ${MANDATE}  -`,
    );
  });

  it('prints a decline with its code and origin in the last column', () => {
    const entry = new AuditLog().recordSettlement(declined);

    expect(formatEntry(entry)).toBe(
      `${prefix}payment_declined  2500 GBP  ` +
        `order ${ORDER}  ` +
        `mandate ${MANDATE}  insufficient_funds (issuer)`,
    );
  });

  it('prints a rail that never answered with the call that went unanswered', () => {
    const entry = new AuditLog().recordSettlement(unavailable);

    expect(formatEntry(entry)).toBe(
      `${prefix}rail_unavailable  2500 GBP  ` +
        `order ${ORDER}  ` +
        `mandate ${MANDATE}  no answer from authorise`,
    );
  });

  it('keeps the outcome column 16 wide for every word of either kind', () => {
    const log = new AuditLog();
    log.record(confirmed);
    log.recordSettlement(paid);
    log.recordSettlement(declined);
    log.recordSettlement(captureFailed);
    log.recordSettlement(unavailable);

    // The settlement words were chosen to fit the column `confirm_required`
    // already set, so a settlement entry moved nothing: the amount starts at
    // the same offset on every line, of both kinds (D95).
    const offsets = log.entries().map((entry) => formatEntry(entry).indexOf('2500 GBP'));
    expect(new Set(offsets).size).toBe(1);
  });

  it('a check line is unchanged by the widening, byte for byte', () => {
    // The same assertion as the `formatEntry` suite above, repeated against a
    // log that also holds settlements: D94 widened the entry type, and this is
    // the line T09's demo prints.
    const log = new AuditLog();
    log.recordSettlement(paid);
    const check = log.record(refused);

    expect(formatEntry(check)).toBe(
      `2026-10-25T12:00:00.000Z  refuse${' '.repeat(10)}  2500 GBP  ` +
        'agent-buyer-1 -> merchant-demo  ' +
        `mandate ${MANDATE}  merchant_mismatch, mandate_expired`,
    );
  });

  it('prints both kinds, one line each, oldest first', () => {
    const log = new AuditLog();
    log.record(confirmed);
    log.recordSettlement(declined);
    const { written, stream } = collectingStream();

    log.print(stream);

    const lines = written.join('').split('\n').slice(0, -1);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('confirm_required');
    expect(lines[1]).toContain('insufficient_funds (issuer)');
  });
});

describe('the mandate layer never writes to stdout', () => {
  /**
   * The merchant speaks MCP over stdio, where stdout carries protocol
   * messages: one stray line there corrupts the conversation. `print()` takes
   * its stream as a parameter for that reason, and nothing in this package may
   * reach for a stream on its own. The MCP Logging feature is not used either
   * — revision 2026-07-28 deprecates it (SEP-2577, see SOURCES.md).
   */
  const packageDir = fileURLToPath(new URL('../../mandate', import.meta.url));
  const sources = readdirSync(packageDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(join(packageDir, name), 'utf8') }));

  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('$name reaches for no output stream of its own', ({ text }) => {
    const code = text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    expect(code).not.toContain('process.stdout');
    expect(code).not.toContain('process.stderr');
    expect(code).not.toContain('console.');
  });
});
