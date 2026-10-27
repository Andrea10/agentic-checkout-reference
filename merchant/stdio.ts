/**
 * stdio entry point for the merchant server.
 *
 * `serveStdio` owns the transport and the protocol-era decision for the
 * connection; it pins one server instance from the factory for the life of
 * that connection, which is what gives each client its own cart store.
 *
 * Run it directly with `npx tsx merchant/stdio.ts`, or point an MCP client at
 * that command. T09 wires it into `npm run demo`.
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createMerchantServer } from './server.js';

serveStdio(() => createMerchantServer());
