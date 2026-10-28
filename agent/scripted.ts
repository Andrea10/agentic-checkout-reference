/**
 * The ScriptedPlanner: list, pick two, cart, add both, quote, order.
 *
 * It is "scripted" because the order of the steps is fixed, not because the
 * steps are. Each call to {@link Planner.next} reads the memory and answers
 * the first question that is still open:
 *
 * 1. no catalogue yet            → `list_products`
 * 2. no cart yet                 → `create_cart`
 * 3. a pick not yet in the cart  → `add_to_cart`
 * 4. no quote for this cart      → `get_quote`
 * 5. a quote                     → `place_order`
 *
 * Step 4 is why this is a state machine and not a list (D71): the quote is
 * checked against the cart's current `version`, so a cart that changed under
 * the agent produces a fresh `get_quote` rather than an order against a stale
 * price. The merchant would refuse that order anyway (`quote_stale`, D38);
 * noticing first is the difference between an agent that recovers and an
 * agent that reports a failure.
 *
 * ## Choosing (D79)
 *
 * Which two products get bought is a {@link ProductChoice}: a pure function
 * from the listed catalogue to picks. The default,
 * {@link twoCheapest}, takes the two lowest-priced products and breaks ties
 * on product id, so the same catalogue always produces the same cart with no
 * randomness and no clock. {@link pickIds} is the other common case — the
 * demo (T09) names its two products so that the printed total is the same
 * every run.
 */

import { priceOf, type AgentProduct } from './wire.js';

import type { PlanMemory, PlanStep, Planner, ProductPick } from './planner.js';

/** Chooses what to buy. Pure: same catalogue in, same picks out (D79). */
export type ProductChoice = (products: readonly AgentProduct[]) => readonly ProductPick[];

/** How many products this planner buys. */
export const PICK_COUNT = 2;

/**
 * The two cheapest products, one unit each, ties broken on product id.
 *
 * Cheapest rather than first-listed so that the two-item cart stays under the
 * README mandate's per-transaction cap, and ties broken on id so that two
 * products at the same price never swap places between runs — a sort that is
 * not total is a sort that is not deterministic.
 */
export const twoCheapest: ProductChoice = (products) =>
  [...products]
    .sort((left, right) => priceOf(left) - priceOf(right) || left.id.localeCompare(right.id))
    .slice(0, PICK_COUNT)
    .map((product) => ({ product_id: product.id, quantity: 1 }));

/**
 * Buys exactly these products, in this order, one unit each unless said
 * otherwise.
 *
 * Refuses at plan time — before any money is involved — if the catalogue does
 * not hold one of them, because an agent that silently buys fewer things than
 * it was told to is worse than an agent that stops.
 */
export function pickIds(...picks: readonly (string | ProductPick)[]): ProductChoice {
  const wanted = picks.map((pick) =>
    typeof pick === 'string' ? { product_id: pick, quantity: 1 } : pick,
  );

  return (products) => {
    const known = new Set(products.map((product) => product.id));
    const missing = wanted.filter((pick) => !known.has(pick.product_id));
    if (missing.length > 0) {
      throw new Error(
        `the catalogue has no ${missing.map((pick) => pick.product_id).join(', ')}`,
      );
    }
    return wanted;
  };
}

/** How to build a {@link ScriptedPlanner}. */
export interface ScriptedPlannerOptions {
  /** What to buy. Defaults to {@link twoCheapest}. */
  readonly choose?: ProductChoice;
}

/** The step the planner takes when the catalogue is too small to pick from. */
function cannotChoose(count: number): PlanStep {
  return {
    kind: 'stop',
    why: `the catalogue has ${String(count)} product(s), fewer than the ${String(PICK_COUNT)} this plan buys`,
  };
}

/**
 * A planner that runs one purchase from catalogue to order.
 *
 * Holds no connection, no mandate and no agent id (D70, D72), and reads no
 * clock (D79), so two runs over the same catalogue produce the same steps.
 */
export function scriptedPlanner(options: ScriptedPlannerOptions = {}): Planner {
  const choose = options.choose ?? twoCheapest;

  return {
    name: 'ScriptedPlanner',

    next(memory: PlanMemory): PlanStep {
      const { products, cart, quote } = memory;

      if (products === undefined) {
        return { kind: 'list_products' };
      }
      if (products.length < PICK_COUNT) {
        return cannotChoose(products.length);
      }

      const picks = choose(products);
      if (picks.length === 0) {
        return { kind: 'stop', why: 'the choice returned no products to buy' };
      }

      if (cart === undefined) {
        return { kind: 'create_cart' };
      }

      // The first pick the cart does not yet hold in full. Comparing against
      // the cart the merchant returned, rather than counting the adds this
      // planner asked for, means a merged line (D11) or a partially applied
      // add is noticed rather than assumed.
      const outstanding = picks.find((pick) => {
        const line = cart.items.find((item) => item.product_id === pick.product_id);
        return line === undefined || line.quantity < pick.quantity;
      });
      if (outstanding !== undefined) {
        const held =
          cart.items.find((item) => item.product_id === outstanding.product_id)?.quantity ?? 0;
        return {
          kind: 'add_to_cart',
          cart_id: cart.cart_id,
          pick: { product_id: outstanding.product_id, quantity: outstanding.quantity - held },
        };
      }

      // A quote is good only for the cart version it priced (D38).
      const priced =
        quote !== undefined &&
        quote.cart_id === cart.cart_id &&
        quote.cart_version === cart.version;
      if (!priced) {
        return { kind: 'get_quote', cart_id: cart.cart_id };
      }

      return { kind: 'place_order', quote_id: quote.id };
    },
  };
}
