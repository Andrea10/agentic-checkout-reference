/**
 * What the stub rail promises: authorise then capture works, a capture the
 * rail cannot honour is refused rather than thrown, the money is never taken
 * twice, and two runs look identical.
 */

import { describe, expect, it } from 'vitest';

import {
  randomAuthorisationIds,
  sequentialAuthorisationIds,
  steppingClock,
  StubRail,
  STUB_RAIL_EPOCH,
  systemClock,
  type RailLogEntry,
  type StubRailOptions,
} from '../../rail/index.js';

/** A rail whose log entries the test can read back. Defaults stay in place. */
function railWithLog(options: StubRailOptions = {}): {
  rail: StubRail;
  entries: RailLogEntry[];
} {
  const entries: RailLogEntry[] = [];
  const rail = new StubRail({ ...options, log: (entry) => entries.push(entry) });
  return { rail, entries };
}

/** A request for one GBP 24.99 order. */
const ORDER = { order_ref: 'order_1', amount_minor: 2499, currency: 'GBP' } as const;

describe('StubRail.authorise then capture', () => {
  it('holds the funds, then takes them in full', async () => {
    const rail = new StubRail();

    const held = await rail.authorise(ORDER);
    expect(held.ok).toBe(true);
    if (!held.ok) return;

    expect(held.authorisation).toEqual({
      authorisation_id: 'auth_000001',
      order_ref: 'order_1',
      amount_minor: 2499,
      currency: 'GBP',
      authorised_at: STUB_RAIL_EPOCH,
    });
    expect(rail.statusOf('auth_000001')).toBe('authorised');

    const taken = await rail.capture({
      authorisation_id: held.authorisation.authorisation_id,
    });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;

    // Capture takes the authorised amount; the request carried only the id.
    expect(taken.capture).toEqual({
      authorisation_id: 'auth_000001',
      order_ref: 'order_1',
      amount_minor: 2499,
      currency: 'GBP',
      captured_at: '2026-01-01T00:00:01.000Z',
    });
    expect(rail.statusOf('auth_000001')).toBe('captured');
  });

  it('always authorises a well-formed request, from one penny up', async () => {
    const rail = new StubRail();

    for (const amount_minor of [1, 999, 2499, 99_999_999]) {
      const held = await rail.authorise({ ...ORDER, amount_minor });
      expect(held.ok).toBe(true);
    }
    expect(rail.size).toBe(4);
  });

  it('keeps authorisations independent of one another', async () => {
    const rail = new StubRail();

    const first = await rail.authorise({ ...ORDER, order_ref: 'order_1' });
    const second = await rail.authorise({ ...ORDER, order_ref: 'order_2', amount_minor: 100 });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.authorisation.authorisation_id).not.toBe(second.authorisation.authorisation_id);

    const taken = await rail.capture({
      authorisation_id: first.authorisation.authorisation_id,
    });
    expect(taken.ok).toBe(true);
    expect(rail.statusOf(second.authorisation.authorisation_id)).toBe('authorised');
  });
});

describe('StubRail.capture without an authorisation', () => {
  it('declines an unknown id instead of throwing', async () => {
    const rail = new StubRail();

    const taken = await rail.capture({ authorisation_id: 'auth_000001' });

    expect(taken.ok).toBe(false);
    if (taken.ok) return;
    expect(taken.decline.code).toBe('authorisation_not_found');
    expect(taken.decline.origin).toBe('rail');
    expect(taken.decline.message).toContain('auth_000001');
    expect(rail.size).toBe(0);
  });

  it('declines an empty id the same way', async () => {
    const taken = await new StubRail().capture({ authorisation_id: '' });

    expect(taken.ok).toBe(false);
    if (taken.ok) return;
    expect(taken.decline.code).toBe('authorisation_not_found');
  });
});

describe('StubRail.capture twice', () => {
  it('takes the money once and declines the second attempt', async () => {
    const rail = new StubRail();
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    const request = { authorisation_id: held.authorisation.authorisation_id };

    const first = await rail.capture(request);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await rail.capture(request);
    expect(second.ok).toBe(false);
    if (second.ok) return;

    expect(second.decline.code).toBe('authorisation_already_captured');
    expect(second.decline.origin).toBe('rail');
    // The message names when the money was actually taken.
    expect(second.decline.message).toContain(first.capture.captured_at);
    // And the first capture is untouched: nothing was taken a second time.
    expect(rail.statusOf(request.authorisation_id)).toBe('captured');
    expect(rail.size).toBe(1);
  });

  it('stays declined however many times it is asked', async () => {
    const rail = new StubRail();
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');
    const request = { authorisation_id: held.authorisation.authorisation_id };

    await rail.capture(request);
    const codes: string[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await rail.capture(request);
      if (!result.ok) codes.push(result.decline.code);
    }

    expect(codes).toEqual([
      'authorisation_already_captured',
      'authorisation_already_captured',
      'authorisation_already_captured',
    ]);
  });
});

describe('StubRail refuses what it cannot honour', () => {
  it('refuses an amount that is not a whole number of minor units', async () => {
    const rail = new StubRail();

    const held = await rail.authorise({ ...ORDER, amount_minor: 24.99 });

    expect(held.ok).toBe(false);
    if (held.ok) return;
    expect(held.decline.code).toBe('amount_invalid');
    expect(held.decline.origin).toBe('rail');
    expect(rail.size).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses the amount %p',
    async (amount_minor) => {
      const held = await new StubRail().authorise({ ...ORDER, amount_minor });

      expect(held.ok).toBe(false);
      if (held.ok) return;
      expect(held.decline.code).toBe('amount_invalid');
    },
  );

  it('refuses a currency it does not handle', async () => {
    const held = await new StubRail().authorise({ ...ORDER, currency: 'EUR' });

    expect(held.ok).toBe(false);
    if (held.ok) return;
    expect(held.decline.code).toBe('currency_unsupported');
    expect(held.decline.message).toContain('GBP');
  });

  it('accepts a currency it was told to handle', async () => {
    const rail = new StubRail({ currencies: ['GBP', 'EUR'] });

    const held = await rail.authorise({ ...ORDER, currency: 'EUR' });

    expect(held.ok).toBe(true);
  });

  it('refuses an empty order reference', async () => {
    const held = await new StubRail().authorise({ ...ORDER, order_ref: '' });

    expect(held.ok).toBe(false);
    if (held.ok) return;
    expect(held.decline.code).toBe('order_ref_invalid');
  });

  it('never claims an issuer refused: every decline it makes has origin rail', async () => {
    const { rail, entries } = railWithLog();
    const declines = [
      await rail.authorise({ ...ORDER, order_ref: '' }),
      await rail.authorise({ ...ORDER, amount_minor: 0 }),
      await rail.authorise({ ...ORDER, currency: 'USD' }),
      await rail.capture({ authorisation_id: 'nope' }),
    ];

    for (const result of declines) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.decline.origin).toBe('rail');
    }
    expect(entries).toHaveLength(4);
  });
});

describe('StubRail determinism', () => {
  it('replays identically: same ids, same timestamps, no randomness or real time', async () => {
    async function transcript(): Promise<RailLogEntry[]> {
      const { rail, entries } = railWithLog();
      const held = await rail.authorise(ORDER);
      if (!held.ok) throw new Error('authorise should have succeeded');
      await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
      await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
      return entries;
    }

    expect(await transcript()).toEqual(await transcript());
  });

  it('numbers authorisations from one and steps the clock a second per call', async () => {
    const rail = new StubRail();

    const first = await rail.authorise(ORDER);
    const second = await rail.authorise(ORDER);
    if (!first.ok || !second.ok) throw new Error('authorise should have succeeded');

    expect([first.authorisation.authorisation_id, second.authorisation.authorisation_id]).toEqual([
      'auth_000001',
      'auth_000002',
    ]);
    expect([first.authorisation.authorised_at, second.authorisation.authorised_at]).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:01.000Z',
    ]);
  });

  it('uses the clock and id factory it is given', async () => {
    const rail = new StubRail({
      now: steppingClock('2027-03-04T05:06:07.000Z', 60_000),
      nextAuthorisationId: () => 'auth_injected',
    });

    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');

    expect(held.authorisation.authorisation_id).toBe('auth_injected');
    expect(held.authorisation.authorised_at).toBe('2027-03-04T05:06:07.000Z');

    const taken = await rail.capture({ authorisation_id: 'auth_injected' });
    if (!taken.ok) throw new Error('capture should have succeeded');
    expect(taken.capture.captured_at).toBe('2027-03-04T05:07:07.000Z');
  });

  it('becomes non-deterministic only when randomness is injected', async () => {
    const rail = new StubRail({ nextAuthorisationId: randomAuthorisationIds, now: systemClock });

    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('authorise should have succeeded');

    expect(held.authorisation.authorisation_id).toMatch(
      /^auth_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(held.authorisation.authorised_at).not.toBe(STUB_RAIL_EPOCH);
    expect(randomAuthorisationIds()).not.toBe(randomAuthorisationIds());
  });

  it('rejects a clock start it cannot read', () => {
    expect(() => steppingClock('yesterday')).toThrow(RangeError);
  });

  it('gives each rail its own counters', async () => {
    const [a, b] = [new StubRail(), new StubRail()];

    const first = await a.authorise(ORDER);
    const second = await b.authorise(ORDER);
    if (!first.ok || !second.ok) throw new Error('authorise should have succeeded');

    expect(first.authorisation).toEqual(second.authorisation);
  });

  it('exports its id factory for anyone who wants their own counter', () => {
    const ids = sequentialAuthorisationIds();
    expect([ids(), ids()]).toEqual(['auth_000001', 'auth_000002']);
  });
});
