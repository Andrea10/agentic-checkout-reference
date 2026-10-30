/**
 * Fails any test that tries to open a network connection.
 *
 * Every TCP or TLS socket Node opens goes through `net.Socket.prototype.connect`
 * (http, https and the SDK's own client included), and `fetch` is the other
 * way out, so those two are replaced with functions that throw. Call
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
