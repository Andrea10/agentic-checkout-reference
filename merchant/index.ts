/**
 * Public surface of the merchant package.
 *
 * T06b, T07 and T08 import from here rather than reaching into files.
 */

export { CATALOGUE, CURRENCY, findProduct } from './catalogue.js';
export type { Currency, Product } from './catalogue.js';

export { CartStore, MAX_LINE_QUANTITY, sequentialCartIds, systemClock } from './cart.js';
export type { Cart, CartIdFactory, CartItemRequest, CartLine, Clock } from './cart.js';

export { MerchantError, toErrorBody } from './errors.js';
export type { MerchantErrorBody, MerchantErrorCode } from './errors.js';

export {
  addToCart,
  createCart,
  createMerchantState,
  getProduct,
  listProducts,
} from './tools.js';
export type {
  AddToCartArgs,
  CartResult,
  CreateCartArgs,
  GetProductArgs,
  GetProductResult,
  ListProductsArgs,
  ListProductsResult,
  MerchantState,
} from './tools.js';

export { createMerchantServer, SERVER_INFO } from './server.js';
