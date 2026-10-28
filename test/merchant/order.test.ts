/**
 * The order store: its ids, its indexes and its state machine (D63, D64, D80).
 *
 * `place-order.test.ts` and `confirm-order.test.ts` drive this through the
 * server; the tests here are the store on its own, because three of its
 * properties are not visible from the wire: that the default ids and tokens
 * are unguessable, that the confirmation token is a separate secret from the
 * order id, and that an illegal transition is impossible rather than merely
 * unused.
 */

import { describe, expect, it } from 'vitest';

import { generateMandateKeyPair, issue, type Mandate } from '../../mandate/index.js';
import { MerchantError } from '../../merchant/errors.js';
import {
  HELD_ORDER_TTL_SECONDS,
  ORDER_STATUSES,
  OrderStore,
  randomConfirmationTokens,
  randomOrderIds,
  sequentialConfirmationTokens,
  sequentialOrderIds,
  type Order,
  type OrderFacts,
  type OrderStatus,
} from '../../merchant/order.js';

import type { Authorisation, Capture, RailDecline } from '../../rail/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FROZEN = '2026-10-28T12:00:00.000Z';

const issuer = generateMandateKeyPair();

/** A real, signed mandate. The store never checks it; `confirm_order` does. */
const MANDATE: Mandate = issue(
  {
    mandate_id: 'mandate-order-1',
    principal: 'user-andrea',
    agent: 'agent-buyer-1',
    merchant: 'merchant-demo',
    currency: 'GBP',
    amount_cap_minor: 5000,
    per_transaction_cap_minor: 2500,
    valid_from: '2026-10-28T00:00:00.000Z',
    valid_until: '2026-10-29T00:00:00.000Z',
    human_confirm_above_minor: 1000,
  },
  issuer.privateKey,
);

/** The terms every hold in this file is taken on. */
const TERMS = { human_confirm_above_minor: 1000, mandate: MANDATE } as const;

const AUTHORISATION: Authorisation = {
  authorisation_id: 'auth_000001',
  order_ref: 'order_000001',
  amount_minor: 1450,
  currency: 'GBP',
  authorised_at: '2026-01-01T00:00:00.000Z',
};

const CAPTURE: Capture = {
  authorisation_id: 'auth_000001',
  order_ref: 'order_000001',
  amount_minor: 1450,
  currency: 'GBP',
  captured_at: '2026-01-01T00:00:01.000Z',
};

const DECLINE: RailDecline = {
  code: 'card_declined',
  message: 'the issuer refused',
  origin: 'issuer',
};

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
  it('are the five an order can be in (D80)', () => {
    expect(ORDER_STATUSES).toEqual([
      'approved',
      'awaiting_confirmation',
      'authorised',
      'paid',
      'declined',
    ]);
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
    const held = store.holdForConfirmation(facts({ quote_id: 'quote_000002' }), TERMS);

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

    const order = store.holdForConfirmation(facts(), TERMS);

    expect(order.status).toBe('awaiting_confirmation');
    expect(order.confirmation_token).toBe('confirm_000001');
    expect(order.human_confirm_above_minor).toBe(1000);
  });

  it('stamps the hold with its own fifteen-minute expiry (D82)', () => {
    const store = testStore();

    const order = store.holdForConfirmation(facts(), TERMS);

    expect(HELD_ORDER_TTL_SECONDS).toBe(900);
    expect(order.expires_at).toBe('2026-10-28T12:15:00.000Z');
  });

  it('keeps the mandate it was held under, so confirm_order can re-check it (D83)', () => {
    const store = testStore();

    const order = store.holdForConfirmation(facts(), TERMS);

    expect(order.mandate).toEqual(MANDATE);
  });

  it('is found by its token, which is not its id (D63)', () => {
    const store = testStore();

    const order = store.holdForConfirmation(facts(), TERMS);

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
    store.holdForConfirmation(facts(), TERMS);

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

/**
 * The state machine, as a table (D80).
 *
 * The point of the table is the *illegal* half. Six transitions are allowed;
 * every other pairing of a state and a transition is a bug in the merchant,
 * and the store refuses it with a plain `Error` so it surfaces as
 * `internal_error` rather than as a refusal an agent could be told to act on.
 * Writing the whole matrix out means a new state or a new transition cannot be
 * added without someone deciding, here, what it may and may not follow.
 */
describe('order states and transitions (D80)', () => {
  /** The four ways an order can move, as the store names them. */
  const MOVES = [
    'markAuthorised',
    'markDeclined',
    'markPaid',
    'markCaptureDeclined',
  ] as const;

  type Move = (typeof MOVES)[number];

  /** from → via → to. Everything not in here throws. */
  const ALLOWED: readonly { from: OrderStatus; via: Move; to: OrderStatus }[] = [
    { from: 'approved', via: 'markAuthorised', to: 'authorised' },
    { from: 'approved', via: 'markDeclined', to: 'declined' },
    { from: 'awaiting_confirmation', via: 'markAuthorised', to: 'authorised' },
    { from: 'awaiting_confirmation', via: 'markDeclined', to: 'declined' },
    { from: 'authorised', via: 'markPaid', to: 'paid' },
    // A refused capture is not a new state: the rail still holds the money
    // (D81).
    { from: 'authorised', via: 'markCaptureDeclined', to: 'authorised' },
  ];

  /** A store holding one order, `order_000001`, in the state asked for. */
  function storeWith(status: OrderStatus): OrderStore {
    const store = testStore();
    switch (status) {
      case 'approved':
        store.approve(facts());
        return store;
      case 'awaiting_confirmation':
        store.holdForConfirmation(facts(), TERMS);
        return store;
      case 'authorised':
        store.approve(facts());
        store.markAuthorised('order_000001', AUTHORISATION);
        return store;
      case 'paid':
        store.approve(facts());
        store.markAuthorised('order_000001', AUTHORISATION);
        store.markPaid('order_000001', CAPTURE);
        return store;
      case 'declined':
        store.approve(facts());
        store.markDeclined('order_000001', DECLINE);
        return store;
    }
  }

  function move(store: OrderStore, via: Move): Order {
    switch (via) {
      case 'markAuthorised':
        return store.markAuthorised('order_000001', AUTHORISATION);
      case 'markDeclined':
        return store.markDeclined('order_000001', DECLINE);
      case 'markPaid':
        return store.markPaid('order_000001', CAPTURE);
      case 'markCaptureDeclined':
        return store.markCaptureDeclined('order_000001', DECLINE);
    }
  }

  for (const { from, via, to } of ALLOWED) {
    it(`allows ${from} --${via}--> ${to}`, () => {
      const store = storeWith(from);

      const moved = move(store, via);

      expect(moved.status).toBe(to);
      expect(store.get('order_000001')?.status).toBe(to);
      // A transition writes a new frozen order over the old one rather than
      // amending it, so a reference taken earlier still reads its own state.
      expect(Object.isFrozen(moved)).toBe(true);
    });
  }

  for (const from of ORDER_STATUSES) {
    for (const via of MOVES) {
      const legal = ALLOWED.some((entry) => entry.from === from && entry.via === via);
      if (legal) continue;

      it(`refuses ${from} --${via}-->, which is not a transition`, () => {
        const store = storeWith(from);

        expect(() => move(store, via)).toThrow('illegal transition');
        expect(store.get('order_000001')?.status).toBe(from);
      });
    }
  }

  it('refuses to move an order it has never heard of', () => {
    const store = testStore();

    expect(() => store.markAuthorised('order_999999', AUTHORISATION)).toThrow(
      'no order with id order_999999',
    );
  });

  it('keeps the facts across every transition, so a paid order still says what was sold', () => {
    const store = storeWith('authorised');

    const paid = store.markPaid('order_000001', CAPTURE);

    expect(paid.quote_id).toBe('quote_000001');
    expect(paid.amount_minor).toBe(1450);
    expect(paid.mandate_id).toBe('mandate-order-1');
    expect(paid.placed_at).toBe(FROZEN);
    expect(paid.authorisation).toEqual(AUTHORISATION);
    expect(paid.capture).toEqual(CAPTURE);
  });

  it('drops the confirmation token and the mandate once the hold is spent', () => {
    const store = storeWith('awaiting_confirmation');

    const authorised = store.markAuthorised('order_000001', AUTHORISATION);

    // The capability and the credential both leave the order with the state
    // that needed them. The token index still finds it, so a second
    // confirmation is told what happened (D84).
    expect('confirmation_token' in authorised).toBe(false);
    expect('mandate' in authorised).toBe(false);
    expect(store.forConfirmationToken('confirm_000001')?.status).toBe('authorised');
  });

  it('writes the refused capture onto the order it is stuck on (D81)', () => {
    const store = storeWith('authorised');

    const stuck = store.markCaptureDeclined('order_000001', DECLINE);

    expect(stuck.status).toBe('authorised');
    expect(stuck.capture_decline).toEqual(DECLINE);
    expect(stuck.authorisation).toEqual(AUTHORISATION);
  });
});

describe('requireConfirmable (D84)', () => {
  function codeOf(run: () => unknown): string {
    try {
      run();
    } catch (thrown) {
      return (thrown as MerchantError).code;
    }
    throw new Error('expected a refusal');
  }

  it('hands back the held order the token was issued for', () => {
    const store = testStore();
    const held = store.holdForConfirmation(facts(), TERMS);

    expect(store.requireConfirmable('confirm_000001')).toEqual(held);
  });

  it('refuses a token no order was ever held under', () => {
    const store = testStore();
    store.holdForConfirmation(facts(), TERMS);

    expect(codeOf(() => store.requireConfirmable('confirm_nope'))).toBe(
      'confirmation_token_unknown',
    );
  });

  it('refuses the order id, which is a name and not a capability (D63)', () => {
    const store = testStore();
    const held = store.holdForConfirmation(facts(), TERMS);

    expect(codeOf(() => store.requireConfirmable(held.order_id))).toBe(
      'confirmation_token_unknown',
    );
  });

  it('refuses a token whose order is already paid, by name', () => {
    const store = testStore();
    store.holdForConfirmation(facts(), TERMS);
    store.markAuthorised('order_000001', AUTHORISATION);
    store.markPaid('order_000001', CAPTURE);

    expect(codeOf(() => store.requireConfirmable('confirm_000001'))).toBe(
      'order_already_paid',
    );
  });

  it('refuses a token whose order the rail declined', () => {
    const store = testStore();
    store.holdForConfirmation(facts(), TERMS);
    store.markDeclined('order_000001', DECLINE);

    expect(codeOf(() => store.requireConfirmable('confirm_000001'))).toBe(
      'order_not_awaiting_confirmation',
    );
  });

  it('refuses a token whose order is stuck authorised', () => {
    const store = testStore();
    store.holdForConfirmation(facts(), TERMS);
    store.markAuthorised('order_000001', AUTHORISATION);

    expect(codeOf(() => store.requireConfirmable('confirm_000001'))).toBe(
      'order_not_awaiting_confirmation',
    );
  });

  it('refuses once the hold has lapsed, naming the window (D82)', () => {
    let now = FROZEN;
    const store = new OrderStore({
      nextId: sequentialOrderIds(),
      nextToken: sequentialConfirmationTokens(),
      now: () => now,
    });
    store.holdForConfirmation(facts(), TERMS);

    now = '2026-10-28T12:14:59.000Z';
    expect(store.requireConfirmable('confirm_000001').order_id).toBe('order_000001');

    now = '2026-10-28T12:15:00.000Z';
    expect(codeOf(() => store.requireConfirmable('confirm_000001'))).toBe('order_expired');
  });
});
