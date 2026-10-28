/**
 * The catalogue, cart and quote tools, as plain functions.
 *
 * The functions here know nothing about MCP: they take validated arguments
 * and return the body that goes on the wire, or throw a
 * {@link MerchantError}. `server.ts` registers them; the tests call them
 * directly. Keeping the two apart means a refusal can be tested without a
 * transport, and T07 can add tools without touching this seam.
 *
 * Products and quotes go on the wire in the ACP vocabulary (`acp.ts`), not
 * the internal one: `price.amount` rather than `price_minor`. The internal
 * types in `catalogue.ts` and `cart.ts` are unchanged, so the mapping happens
 * here and nowhere else (D28).
 *
 * `place_order` follows the same pattern from its own file, `place-order.ts`:
 * it is the only tool that touches the mandate layer, and it is long enough to
 * deserve the room.
 */

import * as z from 'zod';

import { acpProductsResponseSchema, acpProductSchema, toAcpProduct } from './acp.js';
import { CATALOGUE, CURRENCY, findProduct, type Product } from './catalogue.js';
import { CartStore, MAX_LINE_QUANTITY, type Cart } from './cart.js';
import { DEFAULT_MERCHANT_ID } from './config.js';
import { MerchantError } from './errors.js';
import { OrderStore } from './order.js';
import { QuoteStore, quoteSchema } from './quote.js';

import type { MandatePolicy } from '../mandate/index.js';

/**
 * Everything the tools read or write. One instance per server.
 *
 * `merchant_id` and `policy` are the merchant's configuration and not
 * arguments: a caller that could name the merchant, or hand over the key its
 * mandate was signed with, would be authorising itself (D60). `policy` is
 * optional because a merchant with no issuer configured still has a catalogue
 * worth browsing; it refuses to take orders, with `merchant_misconfigured`.
 */
export interface MerchantState {
  readonly catalogue: readonly Product[];
  readonly carts: CartStore;
  readonly quotes: QuoteStore;
  readonly orders: OrderStore;
  /** This merchant's own id, as a mandate has to name it. */
  readonly merchant_id: string;
  /** The mandate policy: trusted key, clock, spend ledger and audit log. */
  readonly policy?: MandatePolicy;
}

/**
 * What {@link createMerchantState} will build for itself if not given it.
 *
 * Every field also accepts an explicit `undefined`, so a caller can write
 * `{ policy: policyFor(config) }` without having to branch on whether there
 * is one.
 */
export interface MerchantStateOptions {
  readonly catalogue?: readonly Product[] | undefined;
  readonly carts?: CartStore | undefined;
  readonly quotes?: QuoteStore | undefined;
  readonly orders?: OrderStore | undefined;
  readonly merchant_id?: string | undefined;
  readonly policy?: MandatePolicy | undefined;
}

/**
 * Builds the state: the synthetic catalogue, empty cart, quote and order
 * stores, and whatever configuration was passed.
 *
 * An options object rather than positional arguments, because T07a added a
 * third store and two pieces of configuration and the positional form had run
 * out of room (D60).
 */
export function createMerchantState(options: MerchantStateOptions = {}): MerchantState {
  const catalogue = options.catalogue ?? CATALOGUE;
  const carts = options.carts ?? new CartStore(catalogue);
  const quotes = options.quotes ?? new QuoteStore(catalogue, carts);
  const orders = options.orders ?? new OrderStore();
  const merchant_id = options.merchant_id ?? DEFAULT_MERCHANT_ID;

  // `exactOptionalPropertyTypes` is on, so an absent policy is an absent key
  // rather than a key holding `undefined`.
  return options.policy === undefined
    ? { catalogue, carts, quotes, orders, merchant_id }
    : { catalogue, carts, quotes, orders, merchant_id, policy: options.policy };
}

// --- wire shapes -----------------------------------------------------------
//
// Described with zod so the same definition serves as the tool's advertised
// JSON Schema and as the runtime check. The product and quote shapes come
// from `acp.ts`; the cart keeps its internal shape, because ACP has no
// concept of an unpriced cart (D34).

const cartLineSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  quantity: z.int(),
  unit_price_minor: z.int(),
  line_total_minor: z.int(),
});

const cartSchema = z.object({
  cart_id: z.string(),
  currency: z.literal(CURRENCY),
  items: z.array(cartLineSchema),
  subtotal_minor: z.int(),
  version: z.int(),
  created_at: z.string(),
  updated_at: z.string(),
});

const cartItemRequestSchema = z.object({
  product_id: z.string().describe('Catalogue id of the product to add.'),
  quantity: z
    .int()
    .min(1)
    .max(MAX_LINE_QUANTITY)
    .describe('Whole number of units.'),
});

// --- tool argument schemas -------------------------------------------------

export const listProductsInput = z.object({
  category: z
    .string()
    .optional()
    .describe('Only return products in this category, e.g. "kitchen".'),
  max_price_minor: z
    .int()
    .min(0)
    .optional()
    .describe('Only return products at or below this price, in GBP pence.'),
});

export const getProductInput = z.object({
  product_id: z.string().describe('Catalogue id, as returned by list_products.'),
});

export const createCartInput = z.object({
  items: z
    .array(cartItemRequestSchema)
    .optional()
    .describe('Optional items to put in the new cart.'),
});

export const getQuoteInput = z.object({
  cart_id: z.string().describe('Cart id returned by create_cart.'),
});

export const addToCartInput = z.object({
  cart_id: z.string().describe('Cart id returned by create_cart.'),
  product_id: z.string().describe('Catalogue id of the product to add.'),
  quantity: z
    .int()
    .min(1)
    .max(MAX_LINE_QUANTITY)
    .default(1)
    .describe('Whole number of units to add. Defaults to 1.'),
});

// --- tool result schemas ---------------------------------------------------

/** Exactly the ACP feed `ProductsResponse`: the list and nothing else (D33). */
export const listProductsOutput = acpProductsResponseSchema;

export const getProductOutput = z.object({ product: acpProductSchema });

export const cartOutput = z.object({ cart: cartSchema });

export const getQuoteOutput = z.object({ quote: quoteSchema });

export type ListProductsArgs = z.infer<typeof listProductsInput>;
export type GetProductArgs = z.infer<typeof getProductInput>;
export type CreateCartArgs = z.infer<typeof createCartInput>;
export type AddToCartArgs = z.infer<typeof addToCartInput>;
export type GetQuoteArgs = z.infer<typeof getQuoteInput>;

export type ListProductsResult = z.infer<typeof listProductsOutput>;
export type GetProductResult = z.infer<typeof getProductOutput>;
export type CartResult = z.infer<typeof cartOutput>;
export type GetQuoteResult = z.infer<typeof getQuoteOutput>;

// --- serialisation ---------------------------------------------------------
//
// The internal types use readonly arrays; the wire shapes do not. Copying
// here keeps the stored cart immutable from the caller's side.

function cartToWire(cart: Cart): z.infer<typeof cartSchema> {
  return { ...cart, items: cart.items.map((line) => ({ ...line })) };
}

// --- handlers --------------------------------------------------------------

/**
 * Lists the catalogue as ACP feed products, optionally filtered.
 *
 * The filters are the merchant's own: the ACP feed API has no query
 * parameters, so `category` and `max_price_minor` are an addition rather than
 * a divergence. They are expressed in internal terms (minor units) because
 * that is what the caller has to type.
 */
export function listProducts(
  state: MerchantState,
  args: ListProductsArgs = {},
): ListProductsResult {
  const products = state.catalogue
    .filter((product) => args.category === undefined || product.category === args.category)
    .filter(
      (product) =>
        args.max_price_minor === undefined || product.price_minor <= args.max_price_minor,
    )
    .map(toAcpProduct);

  return { products };
}

/** Reads one product. Throws `product_not_found` when the id is unknown. */
export function getProduct(state: MerchantState, args: GetProductArgs): GetProductResult {
  const product = findProduct(state.catalogue, args.product_id);
  if (product === undefined) {
    throw new MerchantError('product_not_found', `no product with id ${args.product_id}`);
  }
  return { product: toAcpProduct(product) };
}

/** Creates a cart and returns it, with its new `cart_id`. */
export function createCart(state: MerchantState, args: CreateCartArgs = {}): CartResult {
  return { cart: cartToWire(state.carts.create(args.items ?? [])) };
}

/** Adds units of a product to an existing cart and returns the whole cart. */
export function addToCart(state: MerchantState, args: AddToCartArgs): CartResult {
  const cart = state.carts.addItem(args.cart_id, args.product_id, args.quantity);
  return { cart: cartToWire(cart) };
}

/**
 * Prices a cart and returns the quote.
 *
 * Refuses `cart_not_found` for an unknown cart and `cart_empty` for an empty
 * one. Calling it twice on an unchanged cart issues two quotes with the same
 * totals and different ids; calling it after the cart changed issues a quote
 * for the new contents and leaves the old one stale (D38).
 */
export function getQuote(state: MerchantState, args: GetQuoteArgs): GetQuoteResult {
  return { quote: state.quotes.issue(args.cart_id) };
}
