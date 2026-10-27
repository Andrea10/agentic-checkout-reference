/**
 * The four catalogue-and-cart tools, as plain functions.
 *
 * The functions here know nothing about MCP: they take validated arguments
 * and return the body that goes on the wire, or throw a
 * {@link MerchantError}. `server.ts` registers them; the tests call them
 * directly. Keeping the two apart means a refusal can be tested without a
 * transport, and T06b/T07 can add tools without touching this seam.
 */

import * as z from 'zod';

import { CATALOGUE, CURRENCY, findProduct, type Product } from './catalogue.js';
import { CartStore, MAX_LINE_QUANTITY, type Cart } from './cart.js';
import { MerchantError } from './errors.js';

/** Everything the tools read or write. One instance per server. */
export interface MerchantState {
  readonly catalogue: readonly Product[];
  readonly carts: CartStore;
}

/** Builds the default state: the synthetic catalogue and an empty cart store. */
export function createMerchantState(
  catalogue: readonly Product[] = CATALOGUE,
  carts: CartStore = new CartStore(catalogue),
): MerchantState {
  return { catalogue, carts };
}

// --- wire shapes -----------------------------------------------------------
//
// Described with zod so the same definition serves as the tool's advertised
// JSON Schema and as the runtime check. ACP vocabulary is deliberately absent:
// mapping these onto the ACP product feed and checkout objects is T06b.

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  price_minor: z.int(),
  currency: z.literal(CURRENCY),
  category: z.string(),
  stock: z.int(),
});

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

export const listProductsOutput = z.object({
  products: z.array(productSchema),
  count: z.int(),
  currency: z.literal(CURRENCY),
});

export const getProductOutput = z.object({ product: productSchema });

export const cartOutput = z.object({ cart: cartSchema });

export type ListProductsArgs = z.infer<typeof listProductsInput>;
export type GetProductArgs = z.infer<typeof getProductInput>;
export type CreateCartArgs = z.infer<typeof createCartInput>;
export type AddToCartArgs = z.infer<typeof addToCartInput>;

export type ListProductsResult = z.infer<typeof listProductsOutput>;
export type GetProductResult = z.infer<typeof getProductOutput>;
export type CartResult = z.infer<typeof cartOutput>;

// --- serialisation ---------------------------------------------------------
//
// The internal types use readonly arrays; the wire shapes do not. Copying
// here keeps the stored cart immutable from the caller's side.

function productToWire(product: Product): z.infer<typeof productSchema> {
  return { ...product };
}

function cartToWire(cart: Cart): z.infer<typeof cartSchema> {
  return { ...cart, items: cart.items.map((line) => ({ ...line })) };
}

// --- handlers --------------------------------------------------------------

/** Lists the catalogue, optionally filtered by category and price ceiling. */
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
    .map(productToWire);

  return { products, count: products.length, currency: CURRENCY };
}

/** Reads one product. Throws `product_not_found` when the id is unknown. */
export function getProduct(state: MerchantState, args: GetProductArgs): GetProductResult {
  const product = findProduct(state.catalogue, args.product_id);
  if (product === undefined) {
    throw new MerchantError('product_not_found', `no product with id ${args.product_id}`);
  }
  return { product: productToWire(product) };
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
