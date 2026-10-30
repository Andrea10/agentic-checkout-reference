/**
 * Fails any test that tries to open a network connection.
 *
 * http, https and tls sockets are all `net.Socket`s and connect through
 * `net.Socket.prototype.connect`; `fetch` is replaced as well, in case its
 * client takes another path. Both are swapped for functions that throw.
 * `test/rail/stripe-key.test.ts` checks that a real Stripe client is stopped
 * by it. Call
 * `forbidNetwork()` at the top of a test file; it installs before the file's
 * tests and restores after them.
 */

import net from 'node:net';

import { afterAll, beforeAll } from 'vitest';

/** The message every blocked attempt throws with, so a test can match it. */
export const NETWORK_FORBIDDEN = 'network access is forbidden in the rail tests';

export function forbidNetwork(): void {
  const originalConnect = Object.getOwnPropertyDescriptor(net.Socket.prototype, 'connect');
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    Object.defineProperty(net.Socket.prototype, 'connect', {
      configurable: true,
      writable: true,
      value: function blocked(): never {
        throw new Error(NETWORK_FORBIDDEN);
      },
    });
    globalThis.fetch = () => Promise.reject(new Error(NETWORK_FORBIDDEN));
  });

  afterAll(() => {
    if (originalConnect !== undefined) {
      Object.defineProperty(net.Socket.prototype, 'connect', originalConnect);
    }
    globalThis.fetch = originalFetch;
  });
}
