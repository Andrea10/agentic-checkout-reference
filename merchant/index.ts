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

export { MandateRefusedError, MerchantError, toErrorBody } from './errors.js';
export type { MerchantErrorBody, MerchantErrorCode } from './errors.js';

export {
  DEFAULT_MERCHANT_ID,
  ISSUER_PUBLIC_KEY_ENV,
  MERCHANT_ID_ENV,
  configFromEnvironment,
  policyFor,
} from './config.js';
export type { Environment, MerchantConfig } from './config.js';

export {
  ORDER_STATUSES,
  OrderStore,
  randomConfirmationTokens,
  randomOrderIds,
  sequentialConfirmationTokens,
  sequentialOrderIds,
} from './order.js';
export type {
  ApprovedOrder,
  ConfirmationTokenFactory,
  HeldOrder,
  Order,
  OrderFacts,
  OrderIdFactory,
  OrderLine,
  OrderStatus,
} from './order.js';

export { asMandate, mandateWireSchema } from './mandate-wire.js';
export type { MandateWire } from './mandate-wire.js';

export { placeOrder, placeOrderInput, placeOrderOutput } from './place-order.js';
export type { PlaceOrderArgs, PlaceOrderResult } from './place-order.js';

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
  MerchantStateOptions,
} from './tools.js';

export { createMerchantServer, SERVER_INFO } from './server.js';
