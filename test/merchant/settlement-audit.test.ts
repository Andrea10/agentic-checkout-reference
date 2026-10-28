/**
 * Every settlement outcome, as the audit log holds it.
 *
 * This is the suite T07c exists for. Until it landed, the log recorded
 * mandate decisions only: a declined card left it reading
 * `confirm_required, confirm_required` and a successful payment left no trace
 * that money had moved (the gap D86 records, which PRD R5 says should not be
 * there — every check, pass or fail, in one log, so the auditor can see why
 * each purchase was allowed or refused).
 *
 * So the matrix below is the point: the four things the rail can do — take the
 * money, refuse to hold it, fail to take what it held, or not answer at all —
 * each driven through a real `place_order` or `confirm_order` call over the
 * MCP pipe, each asserted as a line in the same log as the decision it
 * followed, in that order. The payment *errors* those four produce are tested
 * in `confirm-order.test.ts`; what is tested here is what they leave behind
 * for a reader.
 *
 * Both tools write through one `settle()` (D88, D98), which is why the held
 * path is exercised with the same expectations rather than a second set.
 */

import { describe, expect, it } from 'vitest';

import { formatEntry, type OutputStream } from '../../mandate/index.js';

import {
  AGENT,
  MANDATE_ID,
  MUG_PRICE,
  NOW,
  checksOf,
  confirm,
  entriesOf,
  holdOrder,
  mandateFor,
  openMerchant,
  order,
  outcomesOf,
  quoteFor,
  refusalOf,
  settlementsOf,
  successOf,
  type Merchant,
} from './support/merchant-harness.js';
import {
  CAPTURE_DECLINE,
  ISSUER_DECLINE,
  ScriptedRail,
} from './support/scripted-rail.js';

import type { AuditEntry } from '../../mandate/index.js';

/** Opens a merchant on `rail`, runs `body`, and always closes it. */
async function withMerchant(
  rail: ScriptedRail | undefined,
  body: (merchant: Merchant) => Promise<void>,
): Promise<void> {
  const merchant = await openMerchant(rail === undefined ? {} : { rail });
  try {
    await body(merchant);
  } finally {
    await merchant.close();
  }
}

/** Places one order the mandate covers outright, through the pipe. */
async function placeOne(merchant: Merchant): Promise<void> {
  const { quote_id } = await quoteFor(merchant);
  await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });
}

/** A stream that keeps what was written to it, as `audit.test.ts` has it. */
function collectingStream(): { readonly written: string[]; readonly stream: OutputStream } {
  const written: string[] = [];
  return { written, stream: { write: (chunk) => written.push(chunk) } };
}

describe('the direct path: every outcome lands in the log (D94)', () => {
  it('records a payment that went through, under the decision that allowed it', async () => {
    await withMerchant(undefined, async (merchant) => {
      await placeOne(merchant);

      expect(outcomesOf(merchant)).toEqual(['allow', 'paid']);
      expect(settlementsOf(merchant)[0]).toEqual<AuditEntry>({
        kind: 'settlement',
        at: NOW,
        mandate_id: MANDATE_ID,
        order_id: 'order_000001',
        amount_minor: MUG_PRICE,
        currency: 'GBP',
        outcome: 'paid',
      });
    });
  });

  it('records a card the issuer refused, with the code and the origin (D53)', async () => {
    await withMerchant(new ScriptedRail({ authorise: ISSUER_DECLINE }), async (merchant) => {
      await placeOne(merchant);

      expect(outcomesOf(merchant)).toEqual(['allow', 'payment_declined']);
      expect(settlementsOf(merchant)[0]).toMatchObject({
        outcome: 'payment_declined',
        order_id: 'order_000001',
        amount_minor: MUG_PRICE,
        decline: { code: 'insufficient_funds', origin: 'issuer' },
      });
      // Nothing moved, so the ledger is untouched: the log and the ledger
      // disagree only in the sense that one records an attempt and the other
      // records money (D45).
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    });
  });

  it('records a capture the rail would not honour as its own outcome (D81)', async () => {
    await withMerchant(new ScriptedRail({ capture: CAPTURE_DECLINE }), async (merchant) => {
      await placeOne(merchant);

      // Not `payment_declined`: the funds were held and could not be taken,
      // and there is an authorisation outstanding. One word per event.
      expect(outcomesOf(merchant)).toEqual(['allow', 'capture_failed']);
      expect(settlementsOf(merchant)[0]).toMatchObject({
        outcome: 'capture_failed',
        decline: { code: 'authorisation_already_captured', origin: 'rail' },
      });
      expect(merchant.state.orders.get('order_000001')?.status).toBe('authorised');
    });
  });

  it('records a rail that never answered on authorise, naming the call (D85)', async () => {
    const thrown = new Error('ECONNRESET talking to acquirer at 10.0.0.1');
    await withMerchant(new ScriptedRail({ authorise: thrown }), async (merchant) => {
      await placeOne(merchant);

      expect(outcomesOf(merchant)).toEqual(['allow', 'rail_unavailable']);
      const settlement = settlementsOf(merchant)[0];
      expect(settlement).toMatchObject({ outcome: 'rail_unavailable', rail_call: 'authorise' });
      // Nothing was declined, so there is no decline on the entry to mistake
      // for one — the distinction D50 draws, kept in the log.
      expect(settlement?.decline).toBeUndefined();
      // The order kept the state it had: the log says "we asked and got no
      // answer", which is the only true thing to say.
      expect(merchant.state.orders.get('order_000001')?.status).toBe('approved');
    });
  });

  it('records a rail that never answered on capture, naming that call instead', async () => {
    await withMerchant(new ScriptedRail({ capture: new Error('timeout') }), async (merchant) => {
      await placeOne(merchant);

      expect(settlementsOf(merchant)[0]).toMatchObject({
        outcome: 'rail_unavailable',
        rail_call: 'capture',
      });
      expect(merchant.state.orders.get('order_000001')?.status).toBe('authorised');
    });
  });

  it('writes nothing about the rail’s own message, anywhere in the log (D85, D96)', async () => {
    const thrown = new Error('ECONNRESET talking to acquirer at 10.0.0.1');
    await withMerchant(new ScriptedRail({ authorise: thrown }), async (merchant) => {
      await placeOne(merchant);
      const printed = entriesOf(merchant).map(formatEntry).join('\n');

      // A real rail's internal errors carry hosts, URLs and sometimes
      // credentials, and this log is printed to a terminal in the demo.
      expect(printed).not.toContain('ECONNRESET');
      expect(printed).not.toContain('10.0.0.1');
      expect(printed).toContain('no answer from authorise');
    });
  });

  it('leaves no settlement line for a refusal that never reached the rail (D65, D99)', async () => {
    await withMerchant(undefined, async (merchant) => {
      // Stock gone between the quote and the order: refused before the mandate
      // check, so there is no entry of either kind (D65 stays as ruled).
      const { quote_id } = await quoteFor(merchant);
      merchant.sellOut('prod_cobbleford_mug');
      expect(refusalOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() })).code).toBe(
        'insufficient_stock',
      );

      expect(entriesOf(merchant)).toEqual([]);
    });
  });
});

describe('the held path: the decision, the confirmation, then the payment (D94)', () => {
  it('reads as three lines in the order they happened', async () => {
    await withMerchant(undefined, async (merchant) => {
      const { confirmation_token } = await holdOrder(merchant);

      merchant.advance(60);
      expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');

      // The hold's check, the re-check the confirmation made against the clock
      // and the budget as they were then (D83), and the payment that followed.
      // One purchase, three lines, in order.
      expect(outcomesOf(merchant)).toEqual(['confirm_required', 'confirm_required', 'paid']);
      expect(entriesOf(merchant).map((entry) => entry.kind)).toEqual([
        'mandate_check',
        'mandate_check',
        'settlement',
      ]);
      expect(checksOf(merchant).map((entry) => entry.at)).toEqual([
        NOW,
        '2026-10-28T12:01:00.000Z',
      ]);
      expect(settlementsOf(merchant)[0]?.at).toBe('2026-10-28T12:01:00.000Z');
    });
  });

  it('records a declined confirmation as the third line, not as a refused check', async () => {
    await withMerchant(new ScriptedRail({ authorise: ISSUER_DECLINE }), async (merchant) => {
      const { confirmation_token } = await holdOrder(merchant);
      await confirm(merchant, confirmation_token);

      // The mandate did authorise this purchase, twice. What failed was the
      // money, and that is a settlement line and not a `refuse` — recording
      // it as a refused check would blame the mandate for the issuer.
      expect(outcomesOf(merchant)).toEqual([
        'confirm_required',
        'confirm_required',
        'payment_declined',
      ]);
      expect(checksOf(merchant).every((entry) => entry.reasons.length === 0)).toBe(true);
    });
  });

  it('takes its timestamp from the merchant’s clock, not the rail’s (D97)', async () => {
    const railLog: { at: string }[] = [];
    const rail = new ScriptedRail({ log: (entry) => railLog.push({ at: entry.at }) });
    await withMerchant(rail, async (merchant) => {
      const { confirmation_token } = await holdOrder(merchant);
      await confirm(merchant, confirmation_token);

      // The stub rail stamps its own synthetic epoch, which is nine months
      // before the clock this merchant and its policy read. A log stamped by
      // two clocks could not be read in order, so the settlement line takes
      // the one the decisions take; the rail's own times stay on the order.
      expect(railLog[0]?.at).toBe('2026-01-01T00:00:00.000Z');
      expect(settlementsOf(merchant)[0]?.at).toBe(NOW);
      const times = entriesOf(merchant).map((entry) => Date.parse(entry.at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });
  });
});

describe('settlements are appended and never edited (D95)', () => {
  it('only grows: three orders leave six lines, oldest first', async () => {
    await withMerchant(undefined, async (merchant) => {
      await placeOne(merchant);
      await placeOne(merchant);
      await placeOne(merchant);

      expect(merchant.policy.audit.size).toBe(6);
      expect(outcomesOf(merchant)).toEqual(['allow', 'paid', 'allow', 'paid', 'allow', 'paid']);
      expect(settlementsOf(merchant).map((entry) => entry.order_id)).toEqual([
        'order_000001',
        'order_000002',
        'order_000003',
      ]);
    });
  });

  it('freezes a settlement the merchant wrote, so an outcome cannot be rewritten', async () => {
    await withMerchant(new ScriptedRail({ authorise: ISSUER_DECLINE }), async (merchant) => {
      await placeOne(merchant);
      const settlement = settlementsOf(merchant)[0];

      expect(Object.isFrozen(settlement)).toBe(true);
      expect(() => {
        (settlement as unknown as { outcome: string }).outcome = 'paid';
      }).toThrow(TypeError);
      expect(() => {
        (settlement?.decline as unknown as { code: string }).code = 'card_declined';
      }).toThrow(TypeError);
      expect(settlementsOf(merchant)[0]?.outcome).toBe('payment_declined');
    });
  });

  it('cannot be removed through the copy `entries()` hands back', async () => {
    await withMerchant(undefined, async (merchant) => {
      await placeOne(merchant);

      (merchant.policy.audit.entries() as AuditEntry[]).length = 0;

      expect(merchant.policy.audit.size).toBe(2);
    });
  });

  it('prints both kinds to the stream the caller names, which is what the demo shows', async () => {
    await withMerchant(new ScriptedRail({ authorise: ISSUER_DECLINE }), async (merchant) => {
      await placeOne(merchant);
      const { written, stream } = collectingStream();

      merchant.policy.audit.print(stream);
      const lines = written.join('').split('\n').slice(0, -1);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('allow');
      expect(lines[1]).toContain('payment_declined');
      expect(lines[1]).toContain('order order_000001');
      expect(lines[1]).toContain('insufficient_funds (issuer)');
      // The rail's prose is not in the line: the code and the origin are what
      // an auditor reads, and the message stays on the error body (D96).
      expect(lines[1]).not.toContain('not enough funds');
    });
  });
});
