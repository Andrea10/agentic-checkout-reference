/**
 * What the agent expects to read off the wire, and nothing more.
 *
 * `merchant/index.ts` invites T08 to import from it, so the merchant's types
 * are imported here — but only to be *checked against*, never to be used as
 * the agent's own (D77). Each schema below lists only the fields this agent
 * actually reads, and ignores the rest of the merchant's object rather than
 * rejecting it.
 *
 * That asymmetry is the point. A buyer agent in the world does not ship with
 * the merchant's source; it reads the fields it needs and tolerates whatever
 * else arrives. Validating the merchant's whole object here would make this
 * agent break on a merchant that added a field — which is the coupling an
 * agentic-commerce protocol exists to remove. What the imported types buy is
 * the other direction: {@link MerchantShapesAreReadable} fails to compile if
 * the merchant ever renames or retypes a field the agent reads, so the break
 * lands in `npm run build` with the field named rather than in a demo.
 *
 * Every amount is a whole number of GBP minor units (pence), as everywhere
 * else in this repository (D16) — but the schemas below type money as
 * `number`, not `int`, for the reason the merchant gives in D67: a reader
 * that enforces a rule turns a breach of it into a parse failure, which here
 * would mean the agent reporting "I cannot read this body" instead of the
 * amount the merchant actually quoted. Whether an amount is a legal integer
 * of minor units is the mandate policy's call (`amount_invalid`), made
 * against the merchant's stored quote, and the agent re-deciding it earlier
 * can only lose information. Counts — quantities and the cart version — stay
 * `int`, because they are not money and a fractional one is nothing the agent
 * could act on.
 */

import * as z from 'zod';

import type { AcpProduct, Cart, Quote } from '../merchant/index.js';

/** One ACP feed variant, reduced to its price. */
const variantSchema = z.object({
  id: z.string(),
  price: z.object({ amount: z.number(), currency: z.string() }),
});

/**
 * One ACP feed product, reduced to what choosing needs: an id, a title to
 * print, and the price on its first variant. The merchant publishes exactly
 * one variant per product (D29), so "the first variant" is "the price".
 */
export const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  variants: z.array(variantSchema).min(1).readonly(),
});

/** The ACP feed `ProductsResponse` body of `list_products` (D33). */
export const productsResponseSchema = z.object({
  products: z.array(productSchema).readonly(),
});

/** The `cart` body of `create_cart` and `add_to_cart`. */
export const cartSchema = z.object({
  cart: z.object({
    cart_id: z.string(),
    currency: z.string(),
    items: z
      .array(
        z.object({
          product_id: z.string(),
          quantity: z.int(),
          line_total_minor: z.number(),
        }),
      )
      .readonly(),
    subtotal_minor: z.number(),
    version: z.int(),
  }),
});

/** One ACP `Total` entry. The agent reads the `total` one. */
const totalSchema = z.object({ type: z.string(), amount: z.number() });

/** The `quote` body of `get_quote`, shaped to the ACP checkout session (D34). */
export const quoteSchema = z.object({
  quote: z.object({
    id: z.string(),
    status: z.string(),
    currency: z.string(),
    totals: z.array(totalSchema).readonly(),
    expires_at: z.string(),
    cart_id: z.string(),
    cart_version: z.int(),
  }),
});

/** A product as the agent holds it. */
export type AgentProduct = z.infer<typeof productSchema>;

/** A cart as the agent holds it. */
export type AgentCart = z.infer<typeof cartSchema>['cart'];

/** A quote as the agent holds it. */
export type AgentQuote = z.infer<typeof quoteSchema>['quote'];

/** `true` when `A` can be read as a `B`. */
type Assignable<A, B> = A extends B ? true : false;

/** Compiles only for `true`, so a `false` above is a build error here. */
type Readable<T extends true> = T;

/**
 * The compile-time half of D77: every shape the merchant publishes is
 * readable as the shape the agent expects. A rename on either side turns one
 * of these three into `Readable<false>`, which does not compile.
 */
export type MerchantShapesAreReadable = [
  Readable<Assignable<AcpProduct, AgentProduct>>,
  Readable<Assignable<Cart, AgentCart>>,
  Readable<Assignable<Quote, AgentQuote>>,
];

/** The price of a product, in minor units. */
export function priceOf(product: AgentProduct): number {
  const first = product.variants[0];
  if (first === undefined) {
    throw new Error(`product ${product.id} has no variants`);
  }
  return first.price.amount;
}

/** The `total` line of a quote, in minor units. */
export function totalOf(quote: AgentQuote): number {
  const total = quote.totals.find((entry) => entry.type === 'total');
  if (total === undefined) {
    throw new Error(`quote ${quote.id} carries no total line`);
  }
  return total.amount;
}

/**
 * Parses a tool body against one of the schemas above.
 *
 * A body that does not parse is a broken merchant, not a refusal, so this
 * throws rather than producing a refusal (D73).
 */
export function parseBody<T>(
  schema: z.ZodType<T>,
  body: Record<string, unknown>,
  tool: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(`${tool} returned a body the agent cannot read: ${parsed.error.message}`);
  }
  return parsed.data;
}
