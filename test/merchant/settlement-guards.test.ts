/**
 * T12b: the guards around the money that a single, sequential call could not
 * show were missing.
 *
 * 1. Two `confirm_order` calls in flight on one token reach the rail once
 *    (D128). The race is made deterministic with a rail whose `authorise` is
 *    held open until the test releases it.
 * 2. A capture whose amount the ledger would refuse never marks the order
 *    paid (D129).
 * 3. An order closes its cart, so a second quote of the same cart cannot buy
 *    the same basket again (D130).
 * 4. `settle()` writes the paid line before it records the spend (D98).
 * 5. A spent token is refused before the hold's expiry is looked at (D126).
 *
 * Every case runs through the merchant server over the MCP pipe.
 */

import { describe, expect, it } from 'vitest';

import { createMemoryLedger, type OutputStream, type SpendLedger } from '../../mandate/index.js';
import {
  StubRail,
  type AuthoriseRequest,
  type AuthoriseResult,
  type CaptureRequest,
  type CaptureResult,
  type Rail,
  type RailCall,
} from '../../rail/index.js';

import {
  AGENT,
  MANDATE_ID,
  MUG,
  MUG_PRICE,
  NOW,
  callTool,
  confirm,
  holdOrder,
  mandateFor,
  openMerchant,
  order,
  quoteFor,
  refusalOf,
  successOf,
  type Merchant,
} from './support/merchant-harness.js';
import { ScriptedRail } from './support/scripted-rail.js';

import { bodyOf, type ToolCallResult } from './support/raw-client.js';

/** The log exactly as `print()` writes it, one string per line. */
function printed(merchant: Merchant): string[] {
  const written: string[] = [];
  const stream: OutputStream = { write: (chunk) => written.push(chunk) };
  merchant.policy.audit.print(stream);
  return written.join('').split('\n').slice(0, -1);
}

/** A settlement line for the first order, as `formatEntry` prints one at {@link NOW}. */
function settlementLine(outcome: string, detail: string): string {
  return `${NOW}  ${outcome.padEnd(16)}  ${MUG_PRICE} GBP  order order_000001  mandate ${MANDATE_ID}  ${detail}`;
}

/**
 * A rail whose `authorise` waits at a gate the test opens, and which says
 * when the n-th call has arrived. Everything else is a real `StubRail`.
 */
class GatedRail implements Rail {
  readonly name = 'gated';
  readonly calls: RailCall[] = [];
  readonly #inner = new StubRail();
  readonly #arrivals: (() => void)[] = [];
  readonly #arrived: Promise<void>[] = [];
  #open: () => void = () => undefined;
  readonly #gate = new Promise<void>((resolve) => {
    this.#open = resolve;
  });

  constructor() {
    for (let i = 0; i < 2; i += 1) {
      this.#arrived.push(
        new Promise<void>((resolve) => {
          this.#arrivals.push(resolve);
        }),
      );
    }
  }

  /** Resolves once `count` authorise calls (1 or 2) have reached the rail. */
  reached(count: 1 | 2): Promise<void> {
    return this.#arrived[count - 1] ?? Promise.reject(new Error('count out of range'));
  }

  release(): void {
    this.#open();
  }

  async authorise(request: AuthoriseRequest): Promise<AuthoriseResult> {
    this.calls.push('authorise');
    const authorises = this.calls.filter((call) => call === 'authorise').length;
    this.#arrivals[authorises - 1]?.();
    await this.#gate;
    return this.#inner.authorise(request);
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    this.calls.push('capture');
    return this.#inner.capture(request);
  }
}

describe('two confirm_order calls in flight on one token (D84, D128)', () => {
  it('lets one reach the rail and refuses the other', async () => {
    const rail = new GatedRail();
    const merchant = await openMerchant({ rail });
    try {
      const { confirmation_token } = await holdOrder(merchant);

      const first = confirm(merchant, confirmation_token);
      const second = confirm(merchant, confirmation_token);
      await rail.reached(1);
      // Either the second call has already been refused, or it too is
      // waiting at the rail. Both outcomes are reached without a timer.
      await Promise.race([rail.reached(2), Promise.race([first, second])]);
      rail.release();
      const results = await Promise.all([first, second]);

      expect(rail.calls).toEqual(['authorise', 'capture']);
      const paid = results.filter((result) => result.isError !== true);
      const refused = results.filter((result) => result.isError === true);
      expect(paid).toHaveLength(1);
      expect(refused.map((result) => refusalOf(result).code)).toEqual([
        'confirmation_token_spent',
      ]);
      expect(merchant.state.orders.get('order_000001')?.status).toBe('paid');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
      expect(refusalOf(refused[0] as ToolCallResult).message).toContain('order_000001');
      // One settlement, the payment: the refused call never reached the rail,
      // so it settled nothing (D99).
      expect(printed(merchant).filter((line) => line.includes('  order order_'))).toEqual([
        settlementLine('paid', '-'),
      ]);
    } finally {
      await merchant.close();
    }
  });
});

describe('a capture whose amount the ledger would refuse (D45, D87, D129)', () => {
  it('leaves the order authorised, the ledger at zero and no paid line', async () => {
    const rail = new ScriptedRail({ captureAmount: MUG_PRICE - 0.5 });
    const merchant = await openMerchant({ rail });
    try {
      const { quote_id } = await quoteFor(merchant);

      const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

      expect(refusalOf(result).code).toBe('rail_unavailable');
      expect(rail.calls).toEqual(['authorise', 'capture']);
      expect(merchant.state.orders.get('order_000001')?.status).toBe('authorised');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
      expect(printed(merchant).slice(1)).toEqual([
        settlementLine('rail_unavailable', 'unreadable answer from capture'),
      ]);
    } finally {
      await merchant.close();
    }
  });
});

describe('an order closes its cart (D64, D130)', () => {
  it('refuses a second quote of a cart that was ordered and paid', async () => {
    const merchant = await openMerchant();
    try {
      const { quote_id, cart_id } = await quoteFor(merchant);
      successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));

      const requote = await callTool(merchant, 'get_quote', { cart_id });
      const added = await callTool(merchant, 'add_to_cart', {
        cart_id,
        product_id: MUG,
        quantity: 1,
      });

      expect(refusalOf(requote).code).toBe('cart_closed');
      expect(refusalOf(requote).message).toContain('order_000001');
      expect(refusalOf(added).code).toBe('cart_closed');
    } finally {
      await merchant.close();
    }
  });

  it('refuses an order on a second quote made before the first was ordered', async () => {
    const merchant = await openMerchant();
    try {
      const { quote_id, cart_id } = await quoteFor(merchant);
      const second = (await quoteIdFor(merchant, cart_id)) ?? '';
      successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));
      const before = printed(merchant);

      const again = await order(merchant, {
        quote_id: second,
        agent: AGENT,
        mandate: mandateFor(),
      });

      expect(refusalOf(again).code).toBe('cart_closed');
      // Refused before the mandate check, like a replayed quote (D65, D127).
      expect(printed(merchant)).toEqual(before);
      expect(merchant.railLog).toHaveLength(2);
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
    } finally {
      await merchant.close();
    }
  });

  it('closes the cart of a held order too', async () => {
    const merchant = await openMerchant();
    try {
      await holdOrder(merchant);

      expect(refusalOf(await callTool(merchant, 'get_quote', { cart_id: 'cart_000001' })).code).toBe(
        'cart_closed',
      );
    } finally {
      await merchant.close();
    }
  });

  it('leaves the cart open after a refusal that created no order', async () => {
    const merchant = await openMerchant();
    try {
      const { quote_id, cart_id } = await quoteFor(merchant);
      const refused = await order(merchant, {
        quote_id,
        agent: AGENT,
        mandate: mandateFor({ merchant: 'merchant-other' }),
      });
      expect(refusalOf(refused).code).toBe('mandate_refused');

      expect((await quoteIdFor(merchant, cart_id)) ?? '').toMatch(/^quote_/);
    } finally {
      await merchant.close();
    }
  });
});

describe('settle() writes the paid line before it records the spend (D98)', () => {
  it('has the paid line in the log at the moment the ledger is written', async () => {
    // The ledger is built before the merchant it reads, so it reaches the
    // merchant through this box.
    const opened: { merchant?: Merchant } = {};
    let linesAtRecord: string[] | undefined;
    const inner = createMemoryLedger();
    const ledger: SpendLedger = {
      spent: (mandateId) => inner.spent(mandateId),
      record: (mandateId, amountMinor) => {
        if (opened.merchant !== undefined) linesAtRecord = printed(opened.merchant);
        return inner.record(mandateId, amountMinor);
      },
    };
    const merchant = await openMerchant({ ledger });
    opened.merchant = merchant;
    try {
      const { quote_id } = await quoteFor(merchant);
      successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));

      expect(linesAtRecord?.at(-1)).toBe(settlementLine('paid', '-'));
    } finally {
      await merchant.close();
    }
  });
});

describe('a spent token is refused before the hold expiry is read (D126)', () => {
  it('says the token is spent, not that the hold lapsed', async () => {
    const rail = new ScriptedRail({ authorise: new Error('timeout') });
    const merchant = await openMerchant({ rail });
    try {
      const { confirmation_token } = await holdOrder(merchant);
      expect(refusalOf(await confirm(merchant, confirmation_token)).code).toBe(
        'rail_unavailable',
      );
      // Past the fifteen-minute hold (D82).
      merchant.advance(15 * 60 + 1);

      expect(refusalOf(await confirm(merchant, confirmation_token)).code).toBe(
        'confirmation_token_spent',
      );
    } finally {
      await merchant.close();
    }
  });
});

/** Quotes an existing cart and returns the quote id, or `undefined` on a refusal. */
async function quoteIdFor(merchant: Merchant, cartId: string): Promise<string | undefined> {
  const result = await callTool(merchant, 'get_quote', { cart_id: cartId });
  if (result.isError === true) return undefined;
  const { quote } = bodyOf(result) as { quote: { id: string } };
  return quote.id;
}
