/**
 * stdio entry point for the merchant server.
 *
 * `serveStdio` owns the transport and the protocol-era decision for the
 * connection; it pins one server instance from the factory for the life of
 * that connection, which is what gives each client its own cart store, order
 * store, spend ledger and audit log.
 *
 * The configuration — which merchant this is, and whose mandates it trusts —
 * is read from the environment once, at startup (D60). A merchant started
 * without `ACR_MANDATE_PUBLIC_KEY` serves its catalogue and refuses to take
 * orders.
 *
 * Run it directly with `npx tsx merchant/stdio.ts`, or point an MCP client at
 * that command. T09 wires it into `npm run demo`.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { configFromEnvironment, policyFor } from './config.js';
import { createMerchantServer } from './server.js';
import { createMerchantState } from './tools.js';

const config = configFromEnvironment();

serveStdio(() =>
  createMerchantServer(
    createMerchantState({
      merchant_id: config.merchant_id,
      policy: policyFor(config),
    }),
  ),
);
