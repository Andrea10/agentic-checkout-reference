/**
 * Tests for the audit log: that it only ever grows, that an entry cannot be
 * edited once written, and that printing it goes to the stream the caller
 * names and nowhere else.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AuditLog, formatEntry } from '../../mandate/index.js';

import type { AuditEntry, OutputStream, PolicyDecision } from '../../mandate/index.js';

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

/** A stream that keeps what was written to it, in place of a real one. */
function collectingStream(): { readonly written: string[]; readonly stream: OutputStream } {
  const written: string[] = [];
  return { written, stream: { write: (chunk) => written.push(chunk) } };
}

describe('AuditLog.record', () => {
  it('records a check that passed', () => {
    const log = new AuditLog();

    expect(log.record(allowed)).toEqual<AuditEntry>({
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
    expect(log.entries()[0]?.reasons).toHaveLength(2);
  });

  it('is unaffected by later edits to the refusals it was given', () => {
    const refusals = [{ reason: 'mandate_expired' as const, message: 'too late' }];
    const log = new AuditLog();

    log.record({ ...attempt, outcome: 'refuse', refusals });
    refusals.push({ reason: 'mandate_expired', message: 'again' });

    expect(log.entries()[0]?.reasons).toEqual(['mandate_expired']);
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
