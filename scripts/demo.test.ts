/**
 * The demo, as a test.
 *
 * Four things are checked, in the order they matter:
 *
 * 1. **The two runs reach the two outcomes.** Run 1 is paid in one call; run
 *    2 is held for a human and then paid when the token comes back. That is
 *    the PRD's S2, and it is the only thing a reader of the demo is being
 *    promised.
 * 2. **Nothing secret reaches the output.** The private key is injected here,
 *    so the test can look for every encoding of it in the printed text.
 * 3. **Two runs print the same text.** Byte-identical, which is what makes
 *    the output reviewable in a pull request.
 * 4. **The audit log comes out on the stream the demo was handed**, rather
 *    than on a stream of its own choosing.
 *
 * Nothing here pins the *number* of audit entries beyond "at least one per
 * check made", because T07c adds payment events to the same log and this
 * suite must not break when it lands.
 */

import { describe, expect, it } from 'vitest';

import { generateMandateKeyPair } from '../mandate/index.js';
import { AGENT, MERCHANT, PRINCIPAL, money, pounds, runDemo } from './demo.js';

import type { DemoReport } from './demo.js';
import type { MandateKeyPair, OutputStream } from '../mandate/index.js';

/** The basket both runs buy: the two cheapest products in the catalogue. */
const BASKET_MINOR = 2045;

/** Collects everything the demo writes, so a test can read it back. */
function collector(): OutputStream & { text(): string } {
  const chunks: string[] = [];
  return {
    write(chunk: string): unknown {
      chunks.push(chunk);
      return true;
    },
    text(): string {
      return chunks.join('');
    },
  };
}

/** Runs the demo once and hands back both the report and the text. */
async function demo(keys?: MandateKeyPair): Promise<{ report: DemoReport; text: string }> {
  const out = collector();
  const report = await runDemo(out, keys === undefined ? {} : { keys });
  return { report, text: out.text() };
}

describe('run 1: the mandate covers the basket', () => {
  it('ends with an order the merchant has paid', async () => {
    const { report } = await demo();

    expect(report.one.agentOutcome).toBe('ordered');
    expect(report.one.paidOrderId).toBe('order_000001');
    expect(report.one.confirmationToken).toBeUndefined();
  });

  it('charged the basket and recorded it against the mandate', async () => {
    const { report } = await demo();

    expect(report.one.amountMinor).toBe(BASKET_MINOR);
    expect(report.one.spentMinor).toBe(BASKET_MINOR);
  });

  it('wrote one allow to the audit log, before anything T07c adds', async () => {
    const { report } = await demo();

    expect(report.one.auditOutcomes[0]).toBe('allow');
    expect(report.one.auditOutcomes).toContain('allow');
  });
});

describe('run 2: the README mandate trips the human-confirm step', () => {
  it('stops the agent with a token rather than an order', async () => {
    const { report } = await demo();

    expect(report.two.agentOutcome).toBe('awaiting_confirmation');
    expect(report.two.confirmationToken).toBe('confirm_000001');
  });

  it('is paid once the principal presents the token', async () => {
    const { report } = await demo();

    expect(report.two.paidOrderId).toBe('order_000001');
    expect(report.two.amountMinor).toBe(BASKET_MINOR);
    expect(report.two.spentMinor).toBe(BASKET_MINOR);
  });

  it('checked the mandate twice: once at the hold, once at the confirmation', async () => {
    const { report } = await demo();

    expect(report.two.auditOutcomes.slice(0, 2)).toEqual([
      'confirm_required',
      'confirm_required',
    ]);
  });

  it('says in the output that the confirmation is the human’s step', async () => {
    const { text } = await demo();

    expect(text).toContain('THE HUMAN’S STEP');
    expect(text).toContain('this is the principal, not the agent');
    expect(text).toContain(`${PRINCIPAL} now calls confirm_order with the token`);
  });
});

describe('the printed output', () => {
  it('shows every amount as pounds and pence beside the minor units', async () => {
    const { text } = await demo();

    expect(text).toContain('£20.45 (2045 pence)');
    expect(text).toContain('£50.00 (5000 pence)');
    expect(text).not.toMatch(/£\d+\.\d\d(?! \()/);
  });

  it('names the three parties and the six steps', async () => {
    const { text } = await demo();

    for (const expected of [
      PRINCIPAL,
      AGENT,
      MERCHANT,
      'list_products',
      'create_cart',
      'add_to_cart',
      'get_quote',
      'place_order',
      'confirm_order',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('writes the audit log to the stream it was handed', async () => {
    const { text } = await demo();

    // `formatEntry`'s shape: the instant, the outcome, the amount, the parties.
    expect(text).toMatch(
      /2026-10-25T09:00:00\.000Z {2}allow {13}2045 GBP {2}agent-buyer-1 -> merchant-demo/,
    );
    expect(text).toContain('confirm_required');
  });

  it('prints the mandate once as JSON, with the signature withheld', async () => {
    const { text } = await demo();

    expect(text).toContain('"human_confirm_above_minor": 3000');
    expect(text).toContain('not printed');
  });
});

describe('determinism (D103)', () => {
  it('prints byte-identical text on two runs', async () => {
    const first = await demo();
    const second = await demo();

    expect(second.text).toBe(first.text);
  });

  it('reports the same figures on two runs', async () => {
    const first = await demo();
    const second = await demo();

    expect(second.report).toEqual(first.report);
  });
});

describe('no key material in the output', () => {
  /** Every way the injected key pair could leak into the text. */
  function encodingsOf(keys: MandateKeyPair): { label: string; value: string }[] {
    const privateDer = keys.privateKey.export({ format: 'der', type: 'pkcs8' });
    const publicDer = keys.publicKey.export({ format: 'der', type: 'spki' });
    const privatePem = keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

    return [
      { label: 'private key, DER base64url', value: privateDer.toString('base64url') },
      { label: 'private key, DER base64', value: privateDer.toString('base64') },
      { label: 'private key, DER hex', value: privateDer.toString('hex') },
      // The body of the PEM, without the header, footer or newlines: that is
      // the string a careless `console.log` of a key object would produce.
      {
        label: 'private key, PEM body',
        value: privatePem.split('\n').filter((line) => !line.startsWith('-----')).join(''),
      },
      // Not a secret, but printing it would make the output depend on a
      // freshly generated key, which is the other half of D103.
      { label: 'public key, DER base64url', value: publicDer.toString('base64url') },
    ];
  }

  it('contains no encoding of the private key, and none of the public one', async () => {
    const keys = generateMandateKeyPair();
    const { text } = await demo(keys);

    for (const { label, value } of encodingsOf(keys)) {
      expect(value.length).toBeGreaterThan(16);
      expect(text, `${label} reached the output`).not.toContain(value);
    }
  });

  it('contains no signature, which is the other thing a key produces', async () => {
    const { text } = await demo();

    // A signature is 64 bytes of base64url: 86 unpadded characters. Nothing
    // in the demo's text should be a run that long.
    expect(text).not.toMatch(/[A-Za-z][A-Za-z0-9_-]{79,}/);
  });
});

describe('money formatting', () => {
  it('turns pence into pounds without floating-point arithmetic', () => {
    expect(pounds(0)).toBe('£0.00');
    expect(pounds(5)).toBe('£0.05');
    expect(pounds(895)).toBe('£8.95');
    expect(pounds(2045)).toBe('£20.45');
    expect(pounds(100000)).toBe('£1000.00');
    expect(pounds(-150)).toBe('-£1.50');
  });

  it('shows the minor units beside the pounds, always', () => {
    expect(money(2045)).toBe('£20.45 (2045 pence)');
    expect(money(0)).toBe('£0.00 (0 pence)');
  });
});
