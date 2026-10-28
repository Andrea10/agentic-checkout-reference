/**
 * One deterministic merchant, built the same way for every suite that orders
 * something.
 *
 * Both `place-order.test.ts` and `confirm-order.test.ts` need the same thing:
 * a server with sequential ids, a clock a test can move, a mandate policy that
 * trusts a test issuer, and a rail whose log can be read back. Assembling that
 * twice is how the two suites would drift apart, and worse — the stores take
 * **all-optional** options objects, so a factory passed positionally compiles
 * and is silently dropped. T08 was bitten by exactly that. Every construction
 * therefore goes through `openMerchant()` below, and the suites assert the
 * deterministic ids by name (`cart_000001`, `quote_000001`, `order_000001`),
 * so a factory that stops arriving fails a test instead of quietly weakening
 * one.
 *
 * It is support code, not a suite: it holds no `it()` of its own.
 */

import { expect } from 'vitest';

import {
  AuditLog,
  createMandatePolicy,
  createMemoryLedger,
  generateMandateKeyPair,
  issue,
  type AuditEntry,
  type Mandate,
  type MandateCheckEntry,
  type MandateClaims,
  type MandatePolicy,
  type SettlementEntry,
} from '../../../mandate/index.js';
import { CartStore, sequentialCartIds } from '../../../merchant/cart.js';
import { CATALOGUE, type Product } from '../../../merchant/catalogue.js';
import {
  OrderStore,
  sequentialConfirmationTokens,
  sequentialOrderIds,
} from '../../../merchant/order.js';
import { QuoteStore, sequentialQuoteIds } from '../../../merchant/quote.js';
import { createMerchantServer } from '../../../merchant/server.js';
import { createMerchantState, type MerchantState } from '../../../merchant/tools.js';
import { StubRail, type Rail, type RailLogEntry } from '../../../rail/index.js';

import {
  asToolResult,
  bodyOf,
  handshake,
  inMemoryClient,
  type RawClient,
  type ToolCallResult,
} from './raw-client.js';

export const NOW = '2026-10-28T12:00:00.000Z';
export const AGENT = 'agent-buyer-1';
export const MERCHANT = 'merchant-demo';
export const PRINCIPAL = 'user-andrea';
export const MANDATE_ID = 'mandate-t07a-1';

/** 1450 minor units, 60 in stock. One of them is under every default limit. */
export const MUG = 'prod_cobbleford_mug';
export const MUG_PRICE = 1450;

/** The issuer. One key pair for the whole run: nothing here rotates keys. */
export const issuer = generateMandateKeyPair();

/**
 * The mandate every test starts from: this agent, this merchant, in date, with
 * room for one mug (1450) under both caps and under the confirm threshold.
 */
export function claims(overrides: Partial<MandateClaims> = {}): MandateClaims {
  return {
    mandate_id: MANDATE_ID,
    principal: PRINCIPAL,
    agent: AGENT,
    merchant: MERCHANT,
    currency: 'GBP',
    amount_cap_minor: 5000,
    per_transaction_cap_minor: 2500,
    valid_from: '2026-10-28T00:00:00.000Z',
    valid_until: '2026-10-29T00:00:00.000Z',
    human_confirm_above_minor: 2000,
    ...overrides,
  };
}

export function mandateFor(overrides: Partial<MandateClaims> = {}): Mandate {
  return issue(claims(overrides), issuer.privateKey);
}

/** A mandate that holds the order rather than paying it outright. */
export function heldMandate(overrides: Partial<MandateClaims> = {}): Mandate {
  return mandateFor({ human_confirm_above_minor: 1000, ...overrides });
}

/** A configured merchant, its state, and a client talking to it. */
export interface Merchant {
  readonly client: RawClient;
  readonly state: MerchantState;
  readonly policy: MandatePolicy;
  /** The catalogue the server reads. Writable, so a test can sell out a line. */
  readonly catalogue: Product[];
  /** The rail the merchant pays through, and what it recorded. */
  readonly rail: Rail;
  readonly railLog: RailLogEntry[];
  /**
   * The same rail, when it is the default {@link StubRail}, so a test can read
   * its authorisation states. `undefined` when the suite injected its own.
   */
  readonly stub: StubRail | undefined;
  /** Moves the one clock the quote store, the order store and the policy share. */
  advance(seconds: number): void;
  /** Sets a catalogue line's stock behind the quote's back. Nothing was reserved. */
  sellOut(productId: string, stock?: number): void;
  close(): Promise<void>;
}

export interface MerchantOptions {
  /** `false` leaves the mandate policy out: a merchant that cannot order (D60). */
  readonly configured?: boolean;
  /** A rail other than the default stub, for the payment-failure suites. */
  readonly rail?: Rail;
}

/**
 * Builds a merchant with sequential ids, a movable clock and a mandate policy
 * that trusts the test issuer, then opens a client on it.
 */
export async function openMerchant(options: MerchantOptions = {}): Promise<Merchant> {
  const { configured = true } = options;
  let now = NOW;
  const clock = (): string => now;

  // A copy, because CATALOGUE is frozen and some tests have to change it.
  const catalogue: Product[] = CATALOGUE.map((product) => ({ ...product }));
  const carts = new CartStore(catalogue, { nextId: sequentialCartIds(), now: clock });
  const quotes = new QuoteStore(catalogue, carts, {
    nextId: sequentialQuoteIds(),
    now: clock,
  });
  const orders = new OrderStore({
    nextId: sequentialOrderIds(),
    nextToken: sequentialConfirmationTokens(),
    now: clock,
  });
  const policy = createMandatePolicy({
    publicKey: issuer.publicKey,
    clock,
    ledger: createMemoryLedger(),
    audit: new AuditLog(),
  });

  // A collector for a sink, so a test can read back what the merchant asked
  // the rail for (D54). The rail keeps its own deterministic ids and clock.
  const railLog: RailLogEntry[] = [];
  const log = (entry: RailLogEntry): void => {
    railLog.push(entry);
  };
  const rail: Rail = options.rail ?? new StubRail({ log });
  const stub = rail instanceof StubRail ? rail : undefined;

  const state = createMerchantState({
    catalogue,
    carts,
    quotes,
    orders,
    merchant_id: MERCHANT,
    policy: configured ? policy : undefined,
    rail,
  });

  const client = await inMemoryClient(() => createMerchantServer(state));
  await handshake(client);

  return {
    client,
    state,
    policy,
    catalogue,
    rail,
    railLog,
    stub,
    advance(seconds) {
      now = new Date(Date.parse(now) + seconds * 1_000).toISOString();
    },
    sellOut(productId, stock = 0) {
      const index = catalogue.findIndex((product) => product.id === productId);
      const product = catalogue[index];
      expect(product).toBeDefined();
      if (product !== undefined) {
        catalogue[index] = { ...product, stock };
      }
    },
    close: () => client.close(),
  };
}

/** Puts `quantity` of a product in a fresh cart and quotes it. */
export async function quoteFor(
  merchant: Merchant,
  productId = MUG,
  quantity = 1,
): Promise<{ quote_id: string; cart_id: string }> {
  const created = asToolResult(
    await merchant.client.request('tools/call', {
      name: 'create_cart',
      arguments: { items: [{ product_id: productId, quantity }] },
    }),
  );
  const { cart } = bodyOf(created) as { cart: { cart_id: string } };

  const quoted = asToolResult(
    await merchant.client.request('tools/call', {
      name: 'get_quote',
      arguments: { cart_id: cart.cart_id },
    }),
  );
  const { quote } = bodyOf(quoted) as { quote: { id: string } };

  return { quote_id: quote.id, cart_id: cart.cart_id };
}

/** Calls a tool over the pipe and hands back the tool result. */
export async function callTool(
  merchant: Merchant,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return asToolResult(await merchant.client.request('tools/call', { name, arguments: args }));
}

/** Calls `place_order`. */
export async function order(
  merchant: Merchant,
  args: Record<string, unknown>,
): Promise<ToolCallResult> {
  return callTool(merchant, 'place_order', args);
}

/** Calls `confirm_order`. */
export async function confirm(
  merchant: Merchant,
  confirmationToken: string,
): Promise<ToolCallResult> {
  return callTool(merchant, 'confirm_order', {
    confirmation_token: confirmationToken,
  });
}

/** The success body of a `place_order` or `confirm_order` call. */
export interface OrderBody {
  readonly status: string;
  readonly order_id: string;
  readonly confirmation_token?: string;
}

/** The refusal body: a code, a message, and whichever detail the code carries. */
export interface RefusalBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly reasons?: { reason: string; message: string }[];
    readonly decline?: { code: string; message: string; origin: string };
  };
}

export function successOf(result: ToolCallResult): OrderBody {
  expect(result.isError).toBeFalsy();
  return bodyOf(result) as unknown as OrderBody;
}

export function refusalOf(result: ToolCallResult): RefusalBody['error'] {
  expect(result.isError).toBe(true);
  // A refusal body deliberately does not match the tool's output schema, so it
  // travels as text only (D13).
  expect(result.structuredContent).toBeUndefined();
  return (bodyOf(result) as unknown as RefusalBody).error;
}

/** The reason codes of a mandate refusal, in the order the policy reported them. */
export function reasonsOf(result: ToolCallResult): string[] {
  const error = refusalOf(result);
  expect(error.code).toBe('mandate_refused');
  return (error.reasons ?? []).map((entry) => entry.reason);
}

/**
 * The audit log holds two kinds of entry since T07c — the mandate decisions
 * and what the rail then did (D94) — so the three readers below save every
 * suite from writing the same `kind` filter. `outcomesOf` is the one that
 * matters most: it is the log as the demo prints it, both kinds, in order.
 */
export function entriesOf(merchant: Merchant): readonly AuditEntry[] {
  return merchant.policy.audit.entries();
}

/** Every outcome word in the log, of both kinds, oldest first. */
export function outcomesOf(merchant: Merchant): string[] {
  return entriesOf(merchant).map((entry) => entry.outcome);
}

/** Just the mandate decisions, oldest first. */
export function checksOf(merchant: Merchant): MandateCheckEntry[] {
  return entriesOf(merchant).filter(
    (entry): entry is MandateCheckEntry => entry.kind === 'mandate_check',
  );
}

/** Just the settlements, oldest first. */
export function settlementsOf(merchant: Merchant): SettlementEntry[] {
  return entriesOf(merchant).filter(
    (entry): entry is SettlementEntry => entry.kind === 'settlement',
  );
}

/** Places a held order and returns its token and id. */
export async function holdOrder(
  merchant: Merchant,
  overrides: Partial<MandateClaims> = {},
): Promise<{ confirmation_token: string; order_id: string; quote_id: string }> {
  const { quote_id } = await quoteFor(merchant);
  const body = successOf(
    await order(merchant, { quote_id, agent: AGENT, mandate: heldMandate(overrides) }),
  );
  expect(body.status).toBe('awaiting_confirmation');
  return {
    confirmation_token: body.confirmation_token ?? '',
    order_id: body.order_id,
    quote_id,
  };
}
