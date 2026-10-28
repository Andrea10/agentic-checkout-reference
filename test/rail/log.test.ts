/**
 * What the rail writes down, and the one thing it must never write to.
 *
 * The merchant runs as an MCP stdio server, where stdout carries JSON-RPC
 * frames only. A rail that printed to stdout would corrupt the protocol, so
 * the default is silence and a destination has to be handed in.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DECLINE_CODES,
  discardRailLog,
  formatRailLogEntry,
  StubRail,
  writeTo,
  type DeclineCode,
  type RailLogEntry,
} from '../../rail/index.js';

const ORDER = { order_ref: 'order_1', amount_minor: 2499, currency: 'GBP' } as const;

/** Collects into an array, the way the demo collects into a stream. */
function collector(): { sink: (entry: RailLogEntry) => void; entries: RailLogEntry[] } {
  const entries: RailLogEntry[] = [];
  return { sink: (entry) => entries.push(entry), entries };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the rail log', () => {
  it('writes one entry per call, in order, through the injected sink', async () => {
    const { sink, entries } = collector();
    const rail = new StubRail({ log: sink });

    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    await rail.capture({ authorisation_id: held.authorisation.authorisation_id });

    expect(entries).toEqual([
      {
        at: '2026-01-01T00:00:00.000Z',
        rail: 'stub',
        call: 'authorise',
        outcome: 'ok',
        order_ref: 'order_1',
        authorisation_id: 'auth_000001',
        amount_minor: 2499,
        currency: 'GBP',
      },
      {
        at: '2026-01-01T00:00:01.000Z',
        rail: 'stub',
        call: 'capture',
        outcome: 'ok',
        order_ref: 'order_1',
        authorisation_id: 'auth_000001',
        amount_minor: 2499,
        currency: 'GBP',
      },
    ]);
  });

  it('records the rail by the name it was given', async () => {
    const { sink, entries } = collector();

    await new StubRail({ log: sink, name: 'stub-b' }).authorise(ORDER);

    expect(entries[0]?.rail).toBe('stub-b');
  });

  it('records a refused authorisation with its code and no authorisation id', async () => {
    const { sink, entries } = collector();

    await new StubRail({ log: sink }).authorise({ ...ORDER, currency: 'EUR' });

    expect(entries).toEqual([
      {
        at: '2026-01-01T00:00:00.000Z',
        rail: 'stub',
        call: 'authorise',
        outcome: 'declined',
        order_ref: 'order_1',
        amount_minor: 2499,
        currency: 'EUR',
        decline_code: 'currency_unsupported',
      },
    ]);
  });

  it('leaves out an empty order reference rather than logging a blank field', async () => {
    const { sink, entries } = collector();

    await new StubRail({ log: sink }).authorise({ ...ORDER, order_ref: '' });

    expect(entries[0]).not.toHaveProperty('order_ref');
    expect(entries[0]?.decline_code).toBe('order_ref_invalid');
  });

  it('records only the id when a capture names an authorisation it has never seen', async () => {
    const { sink, entries } = collector();

    await new StubRail({ log: sink }).capture({ authorisation_id: 'auth_unknown' });

    expect(entries).toEqual([
      {
        at: '2026-01-01T00:00:00.000Z',
        rail: 'stub',
        call: 'capture',
        outcome: 'declined',
        authorisation_id: 'auth_unknown',
        decline_code: 'authorisation_not_found',
      },
    ]);
  });

  it('records a repeated capture with the money fields it does know', async () => {
    const { sink, entries } = collector();
    const rail = new StubRail({ log: sink });
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    const request = { authorisation_id: held.authorisation.authorisation_id };

    await rail.capture(request);
    await rail.capture(request);

    expect(entries).toHaveLength(3);
    expect(entries[2]).toEqual({
      at: '2026-01-01T00:00:02.000Z',
      rail: 'stub',
      call: 'capture',
      outcome: 'declined',
      order_ref: 'order_1',
      authorisation_id: 'auth_000001',
      amount_minor: 2499,
      currency: 'GBP',
      decline_code: 'authorisation_already_captured',
    });
  });
});

describe('where the log goes', () => {
  it('goes nowhere when no sink is injected, and never to stdout', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const rail = new StubRail();
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
    await rail.capture({ authorisation_id: 'auth_unknown' });

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('writes one line per entry to a stream handed in', async () => {
    const lines: string[] = [];
    const rail = new StubRail({ log: writeTo({ write: (chunk) => lines.push(chunk) }) });

    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    await rail.capture({ authorisation_id: held.authorisation.authorisation_id });

    expect(lines).toEqual([
      '2026-01-01T00:00:00.000Z rail=stub call=authorise outcome=ok order=order_1 auth=auth_000001 amount=2499 GBP\n',
      '2026-01-01T00:00:01.000Z rail=stub call=capture outcome=ok order=order_1 auth=auth_000001 amount=2499 GBP\n',
    ]);
  });

  it('formats a decline with its code', () => {
    const line = formatRailLogEntry({
      at: '2026-01-01T00:00:00.000Z',
      rail: 'stub',
      call: 'capture',
      outcome: 'declined',
      authorisation_id: 'auth_unknown',
      decline_code: 'authorisation_not_found',
    });

    expect(line).toBe(
      '2026-01-01T00:00:00.000Z rail=stub call=capture outcome=declined auth=auth_unknown decline=authorisation_not_found',
    );
  });

  it('discards without complaint', () => {
    expect(
      discardRailLog({
        at: '2026-01-01T00:00:00.000Z',
        rail: 'stub',
        call: 'authorise',
        outcome: 'ok',
      }),
    ).toBeUndefined();
  });
});

describe('the decline vocabulary', () => {
  it('lists every code in the union, and nothing else', () => {
    // A missing key here is a compile error; a stale one is a test failure.
    const everyCode: Record<DeclineCode, true> = {
      card_declined: true,
      insufficient_funds: true,
      authentication_required: true,
      amount_invalid: true,
      currency_unsupported: true,
      order_ref_invalid: true,
      authorisation_not_found: true,
      authorisation_already_captured: true,
    };

    expect([...DECLINE_CODES].sort()).toEqual(Object.keys(everyCode).sort());
  });

  it('keeps the issuer codes Stage 2 needs, which the stub never produces', async () => {
    const issuerCodes: readonly DeclineCode[] = [
      'card_declined',
      'insufficient_funds',
      'authentication_required',
    ];
    const { sink, entries } = collector();
    const rail = new StubRail({ log: sink });

    await rail.authorise({ ...ORDER, amount_minor: -1 });
    await rail.authorise({ ...ORDER, currency: 'USD' });
    await rail.capture({ authorisation_id: 'auth_unknown' });

    for (const code of issuerCodes) expect(DECLINE_CODES).toContain(code);
    for (const entry of entries) expect(issuerCodes).not.toContain(entry.decline_code);
  });
});
