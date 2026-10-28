/**
 * The order store (D63, D64).
 *
 * `place-order.test.ts` drives this through the server; the tests here are the
 * store on its own, because two of its properties are not visible from the
 * wire: that the default ids and tokens are unguessable, and that the
 * confirmation token is a separate secret from the order id.
 */

import { describe, expect, it } from 'vitest';

import { MerchantError } from '../../merchant/errors.js';
import {
  ORDER_STATUSES,
  OrderStore,
  randomConfirmationTokens,
  randomOrderIds,
  sequentialConfirmationTokens,
  sequentialOrderIds,
  type OrderFacts,
} from '../../merchant/order.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FROZEN = '2026-10-28T12:00:00.000Z';

function facts(overrides: Partial<OrderFacts> = {}): OrderFacts {
  return {
    quote_id: 'quote_000001',
    cart_id: 'cart_000001',
    cart_version: 2,
    items: [
      {
        product_id: 'prod_cobbleford_mug',
        name: 'Cobbleford Stoneware Mug',
        quantity: 1,
        unit_price_minor: 1450,
        line_total_minor: 1450,
      },
    ],
    amount_minor: 1450,
    currency: 'GBP',
    agent: 'agent-buyer-1',
    merchant: 'merchant-demo',
    mandate_id: 'mandate-order-1',
    ...overrides,
  };
}

function testStore(): OrderStore {
  return new OrderStore({
    nextId: sequentialOrderIds(),
    nextToken: sequentialConfirmationTokens(),
    now: () => FROZEN,
  });
}

describe('order statuses', () => {
  it('are the two T07a can produce; T07b adds the paid one', () => {
    expect(ORDER_STATUSES).toEqual(['approved', 'awaiting_confirmation']);
  });
});

describe('ids and tokens', () => {
  it('default to a random UUID, because an order id is a capability of sorts (D63)', () => {
    expect(randomOrderIds()).toMatch(new RegExp(`^order_${UUID.source.slice(1)}`));
    expect(randomConfirmationTokens()).toMatch(
      new RegExp(`^confirm_${UUID.source.slice(1)}`),
    );
    expect(randomOrderIds()).not.toBe(randomOrderIds());
    expect(randomConfirmationTokens()).not.toBe(randomConfirmationTokens());
  });

  it('are sequential only when a test or the demo injects it (D12)', () => {
    const nextId = sequentialOrderIds();
    const nextToken = sequentialConfirmationTokens();

    expect([nextId(), nextId()]).toEqual(['order_000001', 'order_000002']);
    expect([nextToken(), nextToken()]).toEqual(['confirm_000001', 'confirm_000002']);
  });
});

describe('approve', () => {
  it('records an order with the facts, a new id and the time it was placed', () => {
    const store = testStore();

    const order = store.approve(facts());

    expect(order.status).toBe('approved');
    expect(order.order_id).toBe('order_000001');
    expect(order.placed_at).toBe(FROZEN);
    expect(order.amount_minor).toBe(1450);
    expect(store.size).toBe(1);
    expect(store.get('order_000001')).toEqual(order);
  });

  it('spends no confirmation token on an order nobody has to confirm', () => {
    const store = testStore();

    store.approve(facts());
    const held = store.holdForConfirmation(facts({ quote_id: 'quote_000002' }), 1000);

    // The first token is still unused, so a reader of the transcript can see
    // that tokens are only minted when a human is actually being asked.
    expect(held.confirmation_token).toBe('confirm_000001');
  });

  it('freezes the order, so nothing can amend it after the fact', () => {
    const store = testStore();

    const order = store.approve(facts());

    expect(Object.isFrozen(order)).toBe(true);
  });
});

describe('holdForConfirmation', () => {
  it('records the threshold that was crossed and the token that releases it', () => {
    const store = testStore();

    const order = store.holdForConfirmation(facts(), 1000);

    expect(order.status).toBe('awaiting_confirmation');
    expect(order.confirmation_token).toBe('confirm_000001');
    expect(order.human_confirm_above_minor).toBe(1000);
  });

  it('is found by its token, which is not its id (D63)', () => {
    const store = testStore();

    const order = store.holdForConfirmation(facts(), 1000);

    expect(store.forConfirmationToken('confirm_000001')).toEqual(order);
    expect(store.forConfirmationToken(order.order_id)).toBeUndefined();
    expect(store.forConfirmationToken('confirm_nope')).toBeUndefined();
  });
});

describe('a quote is single use (D64)', () => {
  it('says nothing about a quote nothing has been ordered against', () => {
    const store = testStore();

    expect(store.forQuote('quote_000001')).toBeUndefined();
    expect(() => {
      store.assertQuoteUnused('quote_000001');
    }).not.toThrow();
  });

  it('refuses a second order against an approved quote, naming the first', () => {
    const store = testStore();
    store.approve(facts());

    expect(() => {
      store.assertQuoteUnused('quote_000001');
    }).toThrow(MerchantError);
    try {
      store.assertQuoteUnused('quote_000001');
    } catch (thrown) {
      expect((thrown as MerchantError).code).toBe('quote_already_ordered');
      expect((thrown as MerchantError).message).toContain('order_000001');
    }
  });

  it('refuses a second order against a quote that is only held', () => {
    const store = testStore();
    store.holdForConfirmation(facts(), 1000);

    expect(() => {
      store.assertQuoteUnused('quote_000001');
    }).toThrow('awaiting_confirmation');
  });

  it('lets a different quote through', () => {
    const store = testStore();
    store.approve(facts());

    expect(() => {
      store.assertQuoteUnused('quote_000002');
    }).not.toThrow();
  });
});

describe('orders()', () => {
  it('hands back a copy, oldest first', () => {
    const store = testStore();
    const first = store.approve(facts());
    const second = store.approve(facts({ quote_id: 'quote_000002' }));

    const listed = store.orders();
    expect(listed).toEqual([first, second]);

    (listed as unknown[]).length = 0;
    expect(store.orders()).toHaveLength(2);
  });
});
