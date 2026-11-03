/**
 * The demo, as a test.
 *
 * Five things are checked, in the order they matter:
 *
 * 1. **Runs 1 and 2 reach their two outcomes.** Run 1 is paid in one call; run
 *    2 is held for a human and then paid when the token comes back. That is
 *    the PRD's S2, and it is the only thing a reader of the demo is being
 *    promised.
 * 2. **Nothing secret reaches the output.** The private key is injected here,
 *    so the test can look for every encoding of it in the printed text.
 * 3. **Two runs print the same text.** Byte-identical, which is what makes
 *    the output reviewable in a pull request.
 * 4. **The audit log comes out on the stream the demo was handed**, rather
 *    than on a stream of its own choosing.
 * 5. **Run 3's five attempts are refused, and move nothing** (T13). Each is
 *    pinned to its refusal code, its reasons, the line it printed and the
 *    audit lines it left, and the closing line is checked against the
 *    ledgers and the rail logs it claims to read.
 *
 * T07c has landed, so the log holds two kinds of entry (D94): a mandate
 * check and a settlement. Three of the tests below exist because this demo
 * was wrong about that log until the merge — the heading that named only
 * checks, a sentence that counted the entries for itself, and D100's claim
 * that the demo printed the revision it negotiated. Each is pinned so it
 * cannot come back:
 *
 * - "the heading covers both kinds of entry"
 * - "the tally under the log is read off the log"
 * - "prints the MCP revision the connection negotiated"
 */

import { describe, expect, it } from 'vitest';

import { generateMandateKeyPair } from '../mandate/index.js';
import {
  ADDED_FIELD,
  AGENT,
  ATTEMPTS,
  MERCHANT,
  OTHER_MERCHANT,
  PRINCIPAL,
  RUN_THREE,
  money,
  pounds,
  runDemo,
} from './demo.js';

import type { AttemptName, AttemptReport, DemoReport } from './demo.js';
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

  it('wrote the decision and then the settlement to the audit log', async () => {
    const { report } = await demo();

    // The whole log for this run since T07c (D94): the policy allowed it,
    // and the rail then took the money.
    expect(report.one.auditOutcomes).toEqual(['allow', 'paid']);
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

  it('checked the mandate twice, then settled once', async () => {
    const { report } = await demo();

    // Once when the order was held, once when the token came back (D83),
    // and one settlement for the payment they authorised (D94).
    expect(report.two.auditOutcomes).toEqual([
      'confirm_required',
      'confirm_required',
      'paid',
    ]);
  });

  it('says in the output that the confirmation is the human’s step', async () => {
    const { text } = await demo();

    expect(text).toContain('THE HUMAN’S STEP');
    expect(text).toContain('this is the principal, not the agent');
    expect(text).toContain(`${PRINCIPAL} now calls confirm_order with the token`);
  });
});

/** One attempt's printed section: its heading down to the next blank line. */
function attemptSection(text: string, index: number): string {
  const heading = `ATTEMPT ${String(index + 1)} OF ${String(ATTEMPTS.length)} — `;
  const start = text.indexOf(heading);
  expect(start, `no "${heading}" in the output`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n\n', start);
  return text.slice(start, end < 0 ? undefined : end);
}

/** One attempt's report, by name. */
function attemptOf(report: DemoReport, name: AttemptName): AttemptReport {
  const found = report.three.attempts.find((entry) => entry.name === name);
  expect(found, `no attempt ${name}`).toBeDefined();
  return found as AttemptReport;
}

/** The audit line a run 3 refusal writes, in `formatEntry`'s columns. */
function refuseLine(amount: number, merchant: string, reason: string): string {
  return `2026-10-25T09:00:00.000Z  refuse            ${String(amount)} GBP  ${AGENT} -> ${merchant}  mandate ${RUN_THREE.mandate_id}  ${reason}`;
}

/**
 * What every refused attempt has to leave: no rail call anywhere, and the
 * budget where it was. Checked per attempt so that a failure names it.
 */
function expectNoMoneyMoved(attempt: AttemptReport): void {
  expect(attempt.railEntries).toEqual([]);
  expect(attempt.spentAfterMinor).toBe(attempt.spentBeforeMinor);
}

describe('run 3: five attempts to spend past the mandate', () => {
  it('makes the five attempts in the order the task names them', async () => {
    const { report } = await demo();

    expect(report.three.attempts.map((entry) => entry.name)).toEqual([...ATTEMPTS]);
    expect(ATTEMPTS).toHaveLength(5);
  });

  it('pays two orders between attempts 1 and 2, which leave 910 pence of the budget', async () => {
    const { report, text } = await demo();

    expect(report.three.paidOrderIds).toEqual(['order_000001', 'order_000002']);
    expect(text).toContain(
      `Mandate budget: ${money(4090)} spent of ${money(5000)}, ${money(910)} left`,
    );
  });

  it('attempt 1: an order over the per-order cap is refused for that cap alone', async () => {
    const { report, text } = await demo();
    const attempt = attemptOf(report, 'per_order_cap');

    expect(attempt.code).toBe('mandate_refused');
    expect(attempt.reasons).toEqual(['per_transaction_cap_exceeded']);
    expect(attempt.auditLines).toEqual([
      refuseLine(2750, MERCHANT, 'per_transaction_cap_exceeded'),
    ]);
    expectNoMoneyMoved(attempt);
    expect(attempt.spentBeforeMinor).toBe(0);

    const section = attemptSection(text, 0);
    expect(section).toContain('refused      mandate_refused [per_transaction_cap_exceeded]');
    expect(section).toContain(
      "why          2750 is above this mandate's per-transaction cap of 2500 GBP",
    );
    expect(section).toContain(`  ${refuseLine(2750, MERCHANT, 'per_transaction_cap_exceeded')}`);
  });

  it('attempt 2: the basket of runs 1 and 2 is refused once the budget left is below it', async () => {
    const { report, text } = await demo();
    const attempt = attemptOf(report, 'remaining_budget');

    expect(attempt.code).toBe('mandate_refused');
    expect(attempt.reasons).toEqual(['budget_exceeded']);
    expect(attempt.auditLines).toEqual([refuseLine(2045, MERCHANT, 'budget_exceeded')]);
    expectNoMoneyMoved(attempt);
    expect(attempt.spentBeforeMinor).toBe(4090);

    const section = attemptSection(text, 1);
    expect(section).toContain('refused      mandate_refused [budget_exceeded]');
    expect(section).toContain(
      "why          2045 is more than the 910 GBP left of this mandate's total cap of 5000",
    );
    expect(section).toContain(`  ${refuseLine(2045, MERCHANT, 'budget_exceeded')}`);
  });

  it('attempt 3: the same mandate at another merchant is refused there, and logged there', async () => {
    const { report, text } = await demo();
    const attempt = attemptOf(report, 'wrong_merchant');

    expect(attempt.code).toBe('mandate_refused');
    // The second merchant trusts the same issuer, so the signature holds and
    // the merchant is the only thing wrong.
    expect(attempt.reasons).toEqual(['merchant_mismatch']);
    expect(attempt.auditLines).toEqual([refuseLine(2045, OTHER_MERCHANT, 'merchant_mismatch')]);
    expectNoMoneyMoved(attempt);

    const section = attemptSection(text, 2);
    expect(section).toContain('refused      mandate_refused [merchant_mismatch]');
    expect(section).toContain(
      `why          this mandate is good at ${MERCHANT}, not at ${OTHER_MERCHANT}`,
    );
    expect(section).toContain(`  ${refuseLine(2045, OTHER_MERCHANT, 'merchant_mismatch')}`);
  });

  it('attempt 4: a replayed order is refused before the mandate check, and leaves no audit line', async () => {
    const { report, text } = await demo();
    const attempt = attemptOf(report, 'replay');

    // D127: the quote is the guard. D65 and D127: a refusal before the
    // mandate check writes nothing, so "none" is the true audit line.
    expect(attempt.code).toBe('quote_already_ordered');
    expect(attempt.reasons).toEqual([]);
    expect(attempt.auditLines).toEqual([]);
    expectNoMoneyMoved(attempt);

    const section = attemptSection(text, 3);
    expect(section).toContain('tries        place_order again with quote_000003, which order_000002 paid');
    expect(section).toContain('refused      quote_already_ordered');
    expect(section).toContain(
      'why          quote quote_000003 has already been ordered as order_000002 (paid)',
    );
    expect(section).toContain(
      'audit line   none: refused before the mandate check (D65, D127)',
    );
  });

  it('attempt 5: a field added after signing breaks the signature, on a basket the budget covers', async () => {
    const { report, text } = await demo();
    const attempt = attemptOf(report, 'field_added');

    // 895 is within the 910 left, so the signature is the only reason.
    expect(attempt.spentBeforeMinor).toBe(4090);
    expect(5000 - attempt.spentBeforeMinor).toBeGreaterThanOrEqual(895);
    expect(attempt.code).toBe('mandate_refused');
    expect(attempt.reasons).toEqual(['signature_invalid']);
    expect(attempt.auditLines).toEqual([refuseLine(895, MERCHANT, 'signature_invalid')]);
    expectNoMoneyMoved(attempt);

    const section = attemptSection(text, 4);
    expect(section).toContain(`"${Object.keys(ADDED_FIELD)[0] ?? ''}": 5000`);
    expect(section).toContain('refused      mandate_refused [signature_invalid]');
    expect(section).toContain(
      'why          the mandate was not signed by the expected issuer, or has been changed since',
    );
    expect(section).toContain(`  ${refuseLine(895, MERCHANT, 'signature_invalid')}`);
  });

  it('the invariant line: five refused, and no money moved by them, read off the ledger and the rail log', async () => {
    const { report, text } = await demo();
    const { attempts, paidOrderIds, railLog, spentMinor } = report.three;

    // Per attempt, from just before it to just after it, at both merchants.
    expect(attempts.every((entry) => entry.code !== undefined)).toBe(true);
    for (const entry of attempts) {
      expectNoMoneyMoved(entry);
    }

    // And from the whole run's logs: every rail call there was belongs to
    // the two orders paid between attempts 1 and 2, and the ledger holds
    // exactly those two and nothing else.
    expect(railLog.map((entry) => `${entry.call} ${entry.outcome} ${entry.order_ref ?? '-'}`)).toEqual([
      'authorise ok order_000001',
      'capture ok order_000001',
      'authorise ok order_000002',
      'capture ok order_000002',
    ]);
    expect(railLog.every((entry) => paidOrderIds.includes(entry.order_ref ?? ''))).toBe(true);
    expect(spentMinor).toBe(2 * 2045);

    expect(text).toContain(
      `5 attempts, 5 refused. Money moved by them: ${money(0)}.`,
    );
    expect(text).toContain(`Rail calls they caused: 0. Added to the ledger: ${money(0)}.`);

    // The printed numbers are the ones the logs give, not a sentence that
    // happens to agree with them today.
    const line = /(\d+) attempts, (\d+) refused\. Money moved by them: £\d+\.\d\d \((\d+) pence\)\./.exec(text);
    expect(line).not.toBeNull();
    if (line === null) return;
    const captured = attempts
      .flatMap((entry) => entry.railEntries)
      .filter((entry) => entry.call === 'capture' && entry.outcome === 'ok')
      .reduce((sum, entry) => sum + (entry.amount_minor ?? 0), 0);
    expect(Number(line[1])).toBe(attempts.length);
    expect(Number(line[2])).toBe(attempts.filter((entry) => entry.code !== undefined).length);
    expect(Number(line[3])).toBe(captured);
  });
});

describe('the printed output', () => {
  // T14b: the title and intro were written for two runs and outlived run 3.
  // They are the first lines of the recording (T14), so they are pinned whole.
  it('opens with a title and an intro that name all three runs', async () => {
    const { text } = await demo();
    const rule = '='.repeat(74);

    expect(text.split('\n').slice(0, 10)).toEqual([
      rule,
      ' agentic-checkout-reference — an agent buys something, in three runs',
      rule,
      '',
      'An agent shops at a merchant and pays, inside limits a person',
      'signed in advance. Run 1 stays inside them. Run 2 goes over the',
      'threshold the person set for being asked, so a human confirms.',
      'Run 3 makes five attempts to spend past the mandate, and all five',
      'are refused.',
      'Nothing here touches real money: the payment rail is a stub.',
    ]);
  });

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

  it('the heading covers both kinds of entry the log holds (D94)', async () => {
    const { report, text } = await demo();

    // The log really does hold both kinds, so the heading is not vacuous:
    // `allow`/`confirm_required` are checks, `paid` is a settlement.
    expect(report.two.auditOutcomes).toContain('confirm_required');
    expect(report.two.auditOutcomes).toContain('paid');
    expect(text).toContain('mandate 22222222-2222-4222-8222-222222222222');
    expect(text).toMatch(/paid {14}2045 GBP {2}order order_000001/);

    expect(text).toContain(
      'THE AUDIT LOG — every mandate check and every settlement, pass or fail',
    );
    // The pre-T07c heading, which named only one of the two kinds.
    expect(text).not.toContain('THE AUDIT LOG — every mandate check, pass or fail');
    expect(text).toContain('A check names the two parties; a settlement names the order it paid.');
  });

  it('the tally under the log is read off the log, not written down', async () => {
    const { text } = await demo();

    // Run 2's audit section is the last one printed. Its count line and the
    // sentence under it have to agree, whatever is in the log: the sentence
    // this replaced said "Two entries, not one" directly under "3 entries."
    const counts = [...text.matchAll(/(\d+) entr(?:y|ies)\./g)];
    const entries = counts.at(-1) ?? null;
    const tally = /(\d+) mandate checks? and (\d+) settlements? above\./.exec(text);

    expect(counts).toHaveLength(2); // one audit section per run
    expect(entries).not.toBeNull();
    expect(tally).not.toBeNull();
    if (entries === null || tally === null) return;

    const total = Number(entries[1]);
    const checks = Number(tally[1]);
    const settlements = Number(tally[2]);

    expect(checks + settlements).toBe(total);
    expect(total).toBe(3);
    expect(checks).toBe(2);
    expect(settlements).toBe(1);
    expect(text).not.toContain('Two entries, not one');
  });

  it('prints the MCP revision the connection negotiated (D100)', async () => {
    const { text } = await demo();

    // The in-memory transport's answer, which is not the stdio one: that is
    // the whole reason the demo prints it rather than stating it (D75).
    expect(text).toContain('THE CONNECTION');
    expect(text).toMatch(/MCP revision\s+2025-11-25 \(era legacy\)/);
    expect(text).toContain('negotiates 2026-07-28');
    expect(text).toContain('scripts/stdio-smoke.test.ts asserts');
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
