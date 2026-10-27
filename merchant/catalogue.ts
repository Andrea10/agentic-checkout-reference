/**
 * Synthetic catalogue for the reference merchant.
 *
 * Every product is invented: no real brand, no real price. Money is held as
 * an integer number of minor units (pence) in a single currency, matching the
 * `*_minor` fields of the mandate in README.md. Nothing here is ever a float.
 */

/** The one currency Stage 1 trades in. */
export const CURRENCY = 'GBP' as const;

export type Currency = typeof CURRENCY;

/** A single line in the catalogue. */
export interface Product {
  /** Stable identifier the agent passes back to the cart tools. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Price in minor units of {@link Product.currency}, e.g. 4250 is £42.50. */
  readonly price_minor: number;
  readonly currency: Currency;
  readonly category: string;
  /** Units available. The cart refuses to exceed it. */
  readonly stock: number;
}

/**
 * Ten invented products. Household goods, priced so that a two-item cart
 * lands either side of the README mandate's 2000 minor-unit human-confirm
 * threshold, which T07 needs to exercise both paths.
 */
export const CATALOGUE: readonly Product[] = Object.freeze([
  {
    id: 'prod_aurora_desk_lamp',
    name: 'Aurora Desk Lamp',
    description: 'Brushed-steel task lamp with a warm dimmable ring.',
    price_minor: 4250,
    currency: CURRENCY,
    category: 'lighting',
    stock: 12,
  },
  {
    id: 'prod_brambleweave_tote',
    name: 'Brambleweave Canvas Tote',
    description: 'Heavy cotton tote with a reinforced base and inner pocket.',
    price_minor: 3200,
    currency: CURRENCY,
    category: 'bags',
    stock: 40,
  },
  {
    id: 'prod_cobbleford_mug',
    name: 'Cobbleford Stoneware Mug',
    description: 'Speckled stoneware mug, 350ml, dishwasher safe.',
    price_minor: 1450,
    currency: CURRENCY,
    category: 'kitchen',
    stock: 60,
  },
  {
    id: 'prod_dunlin_merino_socks',
    name: 'Dunlin Merino Socks',
    description: 'Mid-weight merino socks in a pack of two pairs.',
    price_minor: 1150,
    currency: CURRENCY,
    category: 'clothing',
    stock: 75,
  },
  {
    id: 'prod_elderflint_notebook',
    name: 'Elderflint Notebook',
    description: 'A5 dot-grid notebook, 180 pages, lay-flat binding.',
    price_minor: 895,
    currency: CURRENCY,
    category: 'stationery',
    stock: 120,
  },
  {
    id: 'prod_fernlow_watering_can',
    name: 'Fernlow Watering Can',
    description: 'Two-litre galvanised can with a removable brass rose.',
    price_minor: 2399,
    currency: CURRENCY,
    category: 'garden',
    stock: 18,
  },
  {
    id: 'prod_gallowbrook_cafetiere',
    name: 'Gallowbrook Cafetiere',
    description: 'Eight-cup glass cafetiere with a stainless filter.',
    price_minor: 2750,
    currency: CURRENCY,
    category: 'kitchen',
    stock: 22,
  },
  {
    id: 'prod_harrowmere_blanket',
    name: 'Harrowmere Lambswool Blanket',
    description: 'Woven lambswool throw, 130 by 180 centimetres.',
    price_minor: 6900,
    currency: CURRENCY,
    category: 'home',
    stock: 8,
  },
  {
    id: 'prod_inglevale_chopping_board',
    name: 'Inglevale Oak Chopping Board',
    description: 'End-grain oak board with a juice groove and oiled finish.',
    price_minor: 3450,
    currency: CURRENCY,
    category: 'kitchen',
    stock: 15,
  },
  {
    id: 'prod_jessamy_tea_caddy',
    name: 'Jessamy Tea Caddy',
    description: 'Airtight enamelled caddy holding 250 grams of loose leaf.',
    price_minor: 1699,
    currency: CURRENCY,
    category: 'kitchen',
    stock: 34,
  },
]);

/** Looks a product up by id. Returns `undefined` when there is no such product. */
export function findProduct(
  catalogue: readonly Product[],
  productId: string,
): Product | undefined {
  return catalogue.find((product) => product.id === productId);
}
