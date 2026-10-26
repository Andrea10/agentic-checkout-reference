import { describe, expect, it } from 'vitest';

import { demoMessage } from './demo.js';

describe('toolchain', () => {
  it('type-checks and runs a module under test', () => {
    expect(demoMessage).toContain('agentic-checkout-reference');
  });
});
