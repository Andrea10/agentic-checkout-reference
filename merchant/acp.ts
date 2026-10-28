/**
 * The Agentic Commerce Protocol vocabulary this merchant speaks on the wire.
 *
 * ACP is a public specification for agent-driven buying. This file holds the
 * subset of its **product feed** and **agentic checkout** field names that the
 * merchant's objects are shaped to, plus the functions that map the internal
 * catalogue (T06a, D15) onto them. Nothing here is a conformance claim: the
 * merchant speaks MCP, not ACP's HTTP endpoints, and every place the shapes
 * part company is written down in `docs/DECISIONS.md` as D27 to D39.
 *
 * Shaped from ACP spec version 2026-04-17 (D27). Four files were read in full
 * on 2026-10-28, under
 * `agentic-commerce-protocol/agentic-commerce-protocol/spec/2026-04-17/`:
 *
 * - `openapi/openapi.feed.yaml`
 * - `json-schema/schema.feed.json`
 * - `openapi/openapi.agentic_checkout.yaml`
 * - `json-schema/schema.agentic_checkout.json`
 *
 * Two things a reader should know. First, money is an integer of minor units
 * in both specifications, which is what the repo already does (D16), so no
 * conversion happens anywhere. Second, the two files use *different* tokens
 * for the same low-stock idea, and this file keeps each file's own token in
 * its own object (D31).
 */

import * as z from 'zod';

import { CURRENCY, type Product } from './catalogue.js';

/** The ACP specification version these shapes were read from. */
export const ACP_SPEC_VERSION = '2026-04-17';

/** Stock at or below this, but above zero, counts as low. Our own number. */
export const LOW_STOCK_THRESHOLD = 10;

// --- product feed ----------------------------------------------------------
//
// From `schema.feed.json`. A feed `Product` is a grouping of purchasable
// `Variant`s: it requires `id` and `variants`, and a `Variant` requires `id`
// and `title`. Our catalogue has one price per product and no variants, so
// each product becomes a product with exactly one variant (D29).

/**
 * ACP `Price`: an integer amount of ISO 4217 minor units plus the currency.
 *
 * The feed schema constrains the currency to `^[A-Z]{3}$`, so `GBP` is
 * upper case here and everywhere else (D32).
 */
export const acpPriceSchema = z.object({
  amount: z.int().min(0).describe('Monetary amount expressed in ISO 4217 minor units.'),
  currency: z.literal(CURRENCY).describe('Three-letter ISO 4217 currency identifier.'),
});

/** ACP `Description`. The specification also allows `html` and `markdown`. */
export const acpDescriptionSchema = z.object({
  plain: z.string().describe('Plain-text description.'),
});

/** ACP `Category`. `taxonomy` names the system the value belongs to. */
export const acpCategorySchema = z.object({
  value: z.string().describe('Category label, e.g. "kitchen".'),
  taxonomy: z
    .literal('merchant')
    .describe('The category value is this merchant’s own, not a shared taxonomy.'),
});

/**
 * ACP feed `Availability`.
 *
 * The feed schema calls `status` extensible and names six known values. The
 * three below are the ones a static catalogue can honestly report. Note
 * `limited_stock`: the checkout schema spells the same idea `low_stock`
 * (D31).
 */
export const acpAvailabilitySchema = z.object({
  available: z.boolean().describe('Whether the variant is currently purchasable.'),
  status: z
    .enum(['in_stock', 'limited_stock', 'out_of_stock'])
    .describe('Fulfilment state of the variant.'),
});

/** ACP feed `Variant`, reduced to the fields a synthetic catalogue can fill. */
export const acpVariantSchema = z.object({
  id: z.string().describe('Stable global identifier for this variant.'),
  title: z.string().describe('Display title for the variant.'),
  description: acpDescriptionSchema,
  price: acpPriceSchema.describe('Active selling price for the variant.'),
  availability: acpAvailabilitySchema,
  categories: z.array(acpCategorySchema),
});

/** ACP feed `Product`: a grouping of one or more purchasable variants. */
export const acpProductSchema = z.object({
  id: z.string().describe('Stable global identifier for this product.'),
  title: z.string().describe('Display title for the product.'),
  description: acpDescriptionSchema,
  variants: z.array(acpVariantSchema).describe('Purchasable variants of this product.'),
});

/** ACP feed `ProductsResponse`: the whole list, and nothing else (D33). */
export const acpProductsResponseSchema = z.object({
  products: z.array(acpProductSchema),
});

export type AcpPrice = z.infer<typeof acpPriceSchema>;
export type AcpVariant = z.infer<typeof acpVariantSchema>;
export type AcpProduct = z.infer<typeof acpProductSchema>;
export type AcpProductsResponse = z.infer<typeof acpProductsResponseSchema>;
export type AcpFeedAvailabilityStatus = AcpVariant['availability']['status'];

/** The feed's word for the stock level. `limited_stock`, not `low_stock`. */
export function feedAvailabilityStatus(stock: number): AcpFeedAvailabilityStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= LOW_STOCK_THRESHOLD) return 'limited_stock';
  return 'in_stock';
}

/**
 * Maps one internal product onto an ACP feed product.
 *
 * The internal `price_minor` becomes `price.amount`; `stock` becomes an
 * availability status and does not survive as a number, because the feed
 * schema has nowhere to put it and forbids extra fields (D30).
 */
export function toAcpProduct(product: Product): AcpProduct {
  const variant: AcpVariant = {
    id: product.id,
    title: product.name,
    description: { plain: product.description },
    price: { amount: product.price_minor, currency: product.currency },
    availability: {
      available: product.stock > 0,
      status: feedAvailabilityStatus(product.stock),
    },
    categories: [{ value: product.category, taxonomy: 'merchant' }],
  };

  return {
    id: product.id,
    title: product.name,
    description: { plain: product.description },
    variants: [variant],
  };
}

// --- agentic checkout ------------------------------------------------------
//
// From `schema.agentic_checkout.json`. A `CheckoutSession` requires `id`,
// `status`, `currency`, `line_items`, `totals`, `fulfillment_options`,
// `messages`, `links` and `capabilities`. The quote in `quote.ts` is shaped
// to it (D34).

/**
 * ACP checkout `Total.type`, all twelve values.
 *
 * A quote emits only `items_base_amount`, `subtotal` and `total` at the cart
 * level and `subtotal` and `total` per line; the rest are listed so a reader
 * can see what this merchant is *not* quoting (D36).
 */
export const ACP_TOTAL_TYPES = [
  'items_base_amount',
  'items_discount',
  'subtotal',
  'discount',
  'fulfillment',
  'tax',
  'fee',
  'gift_wrap',
  'tip',
  'store_credit',
  'total',
  'amount_refunded',
] as const;

/** ACP checkout `Total`: one labelled money line. */
export const acpTotalSchema = z.object({
  type: z.enum(ACP_TOTAL_TYPES).describe('Which total this is.'),
  display_text: z.string().describe('Text to show the buyer for this total.'),
  amount: z.int().describe('Amount in minor currency units.'),
});

/** ACP checkout `Item`: the thing being bought, as the line item refers to it. */
export const acpItemSchema = z.object({
  id: z.string().describe('Unique identifier for the item.'),
  name: z.string().describe('Display name of the item.'),
  unit_amount: z.int().min(0).describe('Price per unit in minor currency units.'),
});

/**
 * ACP checkout `LineItem`, reduced to the fields this merchant can fill.
 *
 * `availability_status` is the checkout schema's enum, which spells low stock
 * `low_stock` where the feed says `limited_stock` (D31). `available_quantity`
 * is where the catalogue's `stock` surfaces as a number (D30).
 */
export const acpLineItemSchema = z.object({
  id: z.string().describe('Unique identifier for this line item within the quote.'),
  item: acpItemSchema.describe('The item being purchased.'),
  quantity: z.int().min(1).describe('Number of units on this line.'),
  name: z.string().describe('Display name of the line item.'),
  unit_amount: z.int().min(0).describe('Unit price in minor currency units.'),
  product_id: z.string().describe("The merchant's catalogue identifier."),
  category: z.string().describe('Product category.'),
  availability_status: z
    .enum(['in_stock', 'low_stock', 'out_of_stock', 'backorder', 'pre_order'])
    .describe('Availability of the item at the moment the quote was made.'),
  available_quantity: z
    .int()
    .min(0)
    .describe('Units in stock at the moment the quote was made. Nothing is reserved (D17).'),
  totals: z.array(acpTotalSchema).describe('Money lines for this line item.'),
});

/** ACP checkout session statuses, all eleven. A quote uses `ready_for_payment`. */
export const ACP_CHECKOUT_STATUSES = [
  'incomplete',
  'not_ready_for_payment',
  'requires_escalation',
  'authentication_required',
  'ready_for_payment',
  'pending_approval',
  'complete_in_progress',
  'completed',
  'canceled',
  'in_progress',
  'expired',
] as const;

export const acpCheckoutStatusSchema = z.enum(ACP_CHECKOUT_STATUSES);

/**
 * An ACP array this merchant always sends empty.
 *
 * `fulfillment_options`, `messages` and `links` are required by the checkout
 * schema, and this merchant has nothing to put in any of them: no shipping,
 * no warnings to pass on, no policy pages. `max(0)` says so in the advertised
 * JSON Schema rather than leaving a reader to find out by calling (D36).
 */
export const acpEmptyArraySchema = z.array(z.unknown()).max(0);

/** ACP checkout `Capabilities`. Nothing is negotiated at Stage 1. */
export const acpCapabilitiesSchema = z.object({});

export type AcpTotal = z.infer<typeof acpTotalSchema>;
export type AcpTotalType = AcpTotal['type'];
export type AcpItem = z.infer<typeof acpItemSchema>;
export type AcpLineItem = z.infer<typeof acpLineItemSchema>;
export type AcpCheckoutStatus = z.infer<typeof acpCheckoutStatusSchema>;
export type AcpCheckoutAvailabilityStatus = AcpLineItem['availability_status'];

/** The checkout schema's word for the stock level. `low_stock`, not `limited_stock`. */
export function checkoutAvailabilityStatus(stock: number): AcpCheckoutAvailabilityStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

/** Builds one ACP `Total`. */
export function total(type: AcpTotalType, displayText: string, amount: number): AcpTotal {
  return { type, display_text: displayText, amount };
}
