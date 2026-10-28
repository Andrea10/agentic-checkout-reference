/**
 * Public surface of the merchant package.
 *
 * T07 and T08 import from here rather than reaching into files.
 */

export { CATALOGUE, CURRENCY, findProduct } from './catalogue.js';
export type { Currency, Product } from './catalogue.js';

export {
  ACP_CHECKOUT_STATUSES,
  ACP_SPEC_VERSION,
  ACP_TOTAL_TYPES,
  LOW_STOCK_THRESHOLD,
  checkoutAvailabilityStatus,
  feedAvailabilityStatus,
  toAcpProduct,
  total,
} from './acp.js';
export type {
  AcpCheckoutStatus,
  AcpItem,
  AcpLineItem,
  AcpPrice,
  AcpProduct,
  AcpProductsResponse,
  AcpTotal,
  AcpTotalType,
  AcpVariant,
} from './acp.js';

export {
  QUOTE_TTL_SECONDS,
  QuoteStore,
  isQuoteCurrentFor,
  randomQuoteIds,
  sequentialQuoteIds,
  totalOf,
} from './quote.js';
export type { Quote, QuoteIdFactory } from './quote.js';

export {
  CartStore,
  MAX_LINE_QUANTITY,
  randomCartIds,
  sequentialCartIds,
  systemClock,
} from './cart.js';
export type { Cart, CartIdFactory, CartItemRequest, CartLine, Clock } from './cart.js';

export { MerchantError, toErrorBody } from './errors.js';
export type { MerchantErrorBody, MerchantErrorCode } from './errors.js';

export {
  addToCart,
  createCart,
  createMerchantState,
  getProduct,
  getQuote,
  listProducts,
} from './tools.js';
export type {
  AddToCartArgs,
  CartResult,
  CreateCartArgs,
  GetProductArgs,
  GetProductResult,
  GetQuoteArgs,
  GetQuoteResult,
  ListProductsArgs,
  ListProductsResult,
  MerchantState,
} from './tools.js';

export { createMerchantServer, SERVER_INFO } from './server.js';
