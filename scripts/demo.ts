/**
 * `npm run demo`: the whole repository, in three runs, in one terminal.
 *
 * This is the first thing a reader sees, so it is written to be read rather
 * than to be impressive. The first two runs are one number apart:
 *
 * - **Run 1** — a mandate whose human-confirm threshold is *above* the
 *   basket. The agent shops, presents the mandate, and the merchant pays.
 * - **Run 2** — the README mandate, whose threshold (2000 pence) is *below*
 *   the basket (2045 pence). The merchant holds the order and hands back a
 *   confirmation token. The agent stops there and never confirms (D74). The
 *   demo then plays the principal and calls `confirm_order` itself.
 *
 * Everything else about the two runs is identical — the same catalogue, the
 * same planner, the same six steps, the same amount. The only difference is
 * one field of the signed mandate, which is the point the repository is
 * making.
 *
 * - **Run 3** — one mandate with run 1's limits, and five attempts to go past
 *   it: over the per-order cap, over the budget left, at a merchant the
 *   mandate does not name, a replayed order, and the mandate with a field
 *   added after it was signed. Each is printed with the code it was refused
 *   with and the audit lines it left. A closing line reads the ledgers and
 *   the rail logs and says how much money the five moved.
 *
 * ## Why the merchant runs in this process (D100)
 *
 * The audit log lives inside the merchant's policy, in whichever process
 * hosts the merchant. A merchant started as a stdio child could not hand its
 * log back here, and the log is half of what the demo exists to show. So the
 * demo hosts the merchant itself and reaches it over the MCP SDK's in-memory
 * transport, which `agent/connect(transport)` was built to accept. The real
 * process path — `merchant/stdio.ts`, configured from the environment — stays
 * covered by `scripts/stdio-smoke.test.ts`.
 *
 * The agent and the principal are two separate MCP clients over two server
 * instances sharing one merchant state (D101), because a token that the
 * agent's own connection confirms would not be a human's step at all.
 *
 * ## Determinism (D103)
 *
 * Fixed clock, sequential ids, a fixed mandate id per run, and no key
 * material in the output, so two runs print byte-identical text.
 * `scripts/demo.test.ts` pins that.
 */

import { fileURLToPath } from 'node:url';

import { InMemoryTransport } from '@modelcontextprotocol/server';

import {
  connect,
  describeRefusal,
  pickIds,
  placeOrder,
  priceOf,
  runPlan,
  scriptedPlanner,
  totalOf,
  type AgentIdentity,
  type AgentProduct,
  type MerchantConnection,
  type MerchantRefusal,
  type RunResult,
  type ToolCaller,
  type ToolOutcome,
} from '../agent/index.js';
import {
  createMandatePolicy,
  exportPublicKey,
  fixedClock,
  formatEntry,
  generateMandateKeyPair,
  issue,
  type MandateClaims,
  type MandateKeyPair,
  type MandatePolicy,
  type Mandate,
  type OutputStream,
} from '../mandate/index.js';
import {
  CATALOGUE,
  CartStore,
  OrderStore,
  QuoteStore,
  ISSUER_PUBLIC_KEY_ENV,
  MERCHANT_ID_ENV,
  configFromEnvironment,
  createMerchantServer,
  createMerchantState,
  sequentialCartIds,
  sequentialConfirmationTokens,
  sequentialOrderIds,
  sequentialQuoteIds,
  type OrderStatus,
} from '../merchant/index.js';
import {
  formatRailLogEntry,
  railFactoryFromEnvironment,
  stubRailFactory,
  type RailFactory,
  type RailLogEntry,
} from '../rail/index.js';

// --- the cast -------------------------------------------------------------
//
// Every name here is synthetic. `MERCHANT` must be the merchant's own id,
// because the mandate names one merchant and the policy compares the two.

/** The person delegating. They sign the mandate and confirm in run 2. */
export const PRINCIPAL = 'principal-demo';

/** The agent the authority is granted to, and the id it presents (D61). */
export const AGENT = 'agent-buyer-1';

/** The merchant, as it knows itself from its environment (D60). */
export const MERCHANT = 'merchant-demo';

/**
 * The instant every clock in the demo reads.
 *
 * Inside the README mandate's window (25 to 26 October 2026) and frozen, so
 * the quote's expiry, the hold's expiry and the audit log's timestamps are
 * the same on every run and on every machine (D103).
 */
export const DEMO_NOW = '2026-10-25T09:00:00.000Z';

/** Run 1's mandate: a threshold above the basket, so no human is needed. */
export const RUN_ONE = {
  mandate_id: '11111111-1111-4111-8111-111111111111',
  human_confirm_above_minor: 3000,
} as const;

/** Run 2's mandate: the README one, whose threshold the basket goes over. */
export const RUN_TWO = {
  mandate_id: '22222222-2222-4222-8222-222222222222',
  human_confirm_above_minor: 2000,
} as const;

/**
 * Run 3's mandate: run 1's limits under an id of its own, so its audit lines
 * cannot be read as run 1's. Below its threshold an order is paid in the
 * same call, so no human step stands between an attempt the policy allowed
 * and the rail.
 */
export const RUN_THREE = {
  mandate_id: '33333333-3333-4333-8333-333333333333',
  human_confirm_above_minor: RUN_ONE.human_confirm_above_minor,
} as const;

/**
 * A second merchant in run 3, trusting the same issuer. The mandate does not
 * name it, so presenting the mandate there is the wrong-merchant attempt.
 */
export const OTHER_MERCHANT = 'merchant-other';

/** The field run 3's last attempt adds to the signed mandate, and its value. */
export const ADDED_FIELD = { extra_budget_minor: 5000 } as const;

/** How wide the printed rules are. Narrow enough for any terminal. */
const WIDTH = 74;

// --- money ----------------------------------------------------------------

/**
 * An amount of pence as pounds and pence, e.g. `895` to `£8.95`.
 *
 * Integer arithmetic throughout: dividing money by 100 into a float is how
 * rounding errors get into a ledger.
 */
export function pounds(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = Math.trunc(absolute / 100);
  const part = absolute % 100;
  return `${sign}£${String(whole)}.${String(part).padStart(2, '0')}`;
}

/**
 * The reader-facing form: pounds first, minor units beside it.
 *
 * Both, always, because the pounds are what a person checks and the pence are
 * what every number in this repository actually is.
 */
export function money(minor: number): string {
  return `${pounds(minor)} (${String(minor)} pence)`;
}

/**
 * `n` things, named, with the plural the English needs.
 *
 * Small, but it is what keeps a printed sentence from disagreeing with the
 * number printed above it: every count in the output is read off the thing
 * being counted rather than written down twice.
 */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${String(n)} ${n === 1 ? singular : plural}`;
}

// --- printing -------------------------------------------------------------

/**
 * Short labelled sections, one indent level, no colour and no cursor tricks:
 * the output has to survive being piped to a file or pasted into a PR.
 */
class Printer {
  constructor(private readonly stream: OutputStream) {}

  line(text = ''): void {
    this.stream.write(`${text}\n`);
  }

  /** A full-width rule, for the top and bottom of the two runs. */
  rule(character = '-'): void {
    this.line(character.repeat(WIDTH));
  }

  /** The demo's one title. */
  title(text: string): void {
    this.rule('=');
    this.line(` ${text}`);
    this.rule('=');
  }

  /** The banner that opens a run. */
  run(text: string): void {
    this.line();
    this.rule();
    this.line(` ${text}`);
    this.rule();
  }

  /** A labelled section inside a run. */
  section(label: string): void {
    this.line();
    this.line(label);
  }

  /** One indented line of a section's body. */
  item(text: string): void {
    this.line(`  ${text}`);
  }

  /** A `label: value` pair, with the labels of a section lined up. */
  field(label: string, value: string, labelWidth = 22): void {
    this.item(`${label.padEnd(labelWidth)}${value}`);
  }

  /** The stream, for the one caller that writes to it directly: the log. */
  get out(): OutputStream {
    return this.stream;
  }
}

/**
 * A stream that puts `prefix` in front of every line written through it.
 *
 * `AuditLog.print()` writes one `\n`-terminated chunk per entry, so nothing
 * is ever left in `pending`; the buffering is there so that a stream which
 * split a line across two writes would still come out indented rather than
 * mangled.
 */
function indented(stream: OutputStream, prefix: string): OutputStream {
  let pending = '';
  return {
    write(chunk: string): unknown {
      pending += chunk;
      for (
        let newline = pending.indexOf('\n');
        newline >= 0;
        newline = pending.indexOf('\n')
      ) {
        stream.write(`${prefix}${pending.slice(0, newline)}\n`);
        pending = pending.slice(newline + 1);
      }
      return true;
    },
  };
}

// --- the mandate ----------------------------------------------------------

/**
 * The claims of the demo's mandate: the README object, with one field moved.
 *
 * Caps, currency and window are the README's. `human_confirm_above_minor` is
 * the parameter, because it is the only thing that differs between the two
 * runs.
 */
function demoClaims(run: { mandate_id: string; human_confirm_above_minor: number }): MandateClaims {
  return {
    mandate_id: run.mandate_id,
    principal: PRINCIPAL,
    agent: AGENT,
    merchant: MERCHANT,
    currency: 'GBP',
    amount_cap_minor: 5000,
    per_transaction_cap_minor: 2500,
    valid_from: '2026-10-25T00:00:00Z',
    valid_until: '2026-10-26T00:00:00Z',
    human_confirm_above_minor: run.human_confirm_above_minor,
  };
}

/** The mandate in plain words: what this person has actually allowed. */
function describeMandate(p: Printer, mandate: Mandate): void {
  p.section('THE MANDATE — what the principal signed');
  p.item(`${mandate.principal} lets ${mandate.agent} spend at ${mandate.merchant}:`);
  p.item(`  up to ${money(mandate.amount_cap_minor)} in total`);
  p.item(`  at most ${money(mandate.per_transaction_cap_minor)} in any one order`);
  p.item(`  in ${mandate.currency} and no other currency`);
  p.item(`  between ${mandate.valid_from} and ${mandate.valid_until}`);
  p.item(
    `  without asking up to ${money(mandate.human_confirm_above_minor)}; above that a human must confirm`,
  );
  p.item('Signed Ed25519 over the canonical claims. The merchant holds the');
  p.item(`issuer's public key, read from ${ISSUER_PUBLIC_KEY_ENV}, and no other`);
  p.item('key material: the private key never leaves the issuer, and nothing');
  p.item('derived from it is printed here.');
}

/**
 * The same object as it travels, once, because the shape is worth seeing.
 *
 * The signature is replaced rather than printed: it is 64 bytes of base64
 * that no reader can check by eye, and printing it would make the demo's
 * output depend on a freshly generated key (D103).
 */
function printMandateJson(p: Printer, mandate: Mandate): void {
  p.section('THE SAME MANDATE, AS IT TRAVELS');
  const onTheWire = {
    mandate_id: mandate.mandate_id,
    principal: mandate.principal,
    agent: mandate.agent,
    merchant: mandate.merchant,
    currency: mandate.currency,
    amount_cap_minor: mandate.amount_cap_minor,
    per_transaction_cap_minor: mandate.per_transaction_cap_minor,
    valid_from: mandate.valid_from,
    valid_until: mandate.valid_until,
    human_confirm_above_minor: mandate.human_confirm_above_minor,
    signature: '<Ed25519 over the ten fields above, base64url — not printed>',
  };
  for (const line of JSON.stringify(onTheWire, null, 2).split('\n')) {
    p.item(line);
  }
}

// --- the merchant, in this process ---------------------------------------

/** The merchant the demo hosts, with the pieces the demo prints. */
interface DemoMerchant {
  /** A fresh MCP client, over its own server instance on the shared state. */
  open(): Promise<MerchantConnection>;
  /** The policy, which owns the audit log and the spend ledger. */
  readonly policy: MandatePolicy;
  /** The order store, so a paid order can be read back. */
  readonly orders: OrderStore;
  /** What the stub rail did, in order. */
  readonly railLog: readonly RailLogEntry[];
}

/**
 * Starts a merchant in this process, configured the way the stdio entry point
 * configures itself.
 *
 * The merchant id and the trusted issuer key go through
 * `configFromEnvironment` on a synthetic environment, so the demo exercises
 * the same export-to-env-to-import path `merchant/stdio.ts` uses (D60) rather
 * than handing the key object over directly. The policy is then built with a
 * fixed clock, which `policyFor` cannot do. `merchantId` is
 * {@link MERCHANT} everywhere but run 3's wrong-merchant attempt.
 */
function startMerchant(
  encodedPublicKey: string,
  railFactory: RailFactory,
  merchantId: string = MERCHANT,
): DemoMerchant {
  const config = configFromEnvironment({
    [MERCHANT_ID_ENV]: merchantId,
    [ISSUER_PUBLIC_KEY_ENV]: encodedPublicKey,
  });
  if (config.issuerPublicKey === undefined) {
    throw new Error('the demo merchant was started without a trusted issuer key');
  }

  const now = fixedClock(DEMO_NOW);
  const policy = createMandatePolicy({ publicKey: config.issuerPublicKey, clock: now });
  const carts = new CartStore(CATALOGUE, { nextId: sequentialCartIds(), now });
  const quotes = new QuoteStore(CATALOGUE, carts, { nextId: sequentialQuoteIds(), now });
  const orders = new OrderStore({
    nextId: sequentialOrderIds(),
    nextToken: sequentialConfirmationTokens(),
    now,
  });

  const railLog: RailLogEntry[] = [];
  const rail = railFactory((entry) => {
    railLog.push(entry);
  });

  const state = createMerchantState({
    catalogue: CATALOGUE,
    carts,
    quotes,
    orders,
    merchant_id: config.merchant_id,
    policy,
    rail,
  });

  return {
    async open(): Promise<MerchantConnection> {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      // One `McpServer` per transport — the SDK refuses a second connection on
      // one instance — but one state behind them all (D101).
      await createMerchantServer(state).connect(serverTransport);
      return connect(clientTransport);
    },
    policy,
    orders,
    railLog,
  };
}

// --- watching the agent work ---------------------------------------------

/** One tool call the agent made, and what came back. */
interface CallRecord {
  readonly tool: string;
  readonly outcome: ToolOutcome;
}

/**
 * Wraps a connection so the demo can print what the agent actually called.
 *
 * The alternative is to describe the steps from the planner's intentions,
 * which would print a transcript of what the agent meant to do rather than
 * what the merchant answered.
 */
function recording(caller: ToolCaller, into: CallRecord[]): ToolCaller {
  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
      const outcome = await caller.callTool(name, args);
      into.push({ tool: name, outcome });
      return outcome;
    },
  };
}

/** The catalogue entry behind a product id, as the agent listed it. */
function productIn(products: readonly AgentProduct[] | undefined, id: string): AgentProduct | undefined {
  return products?.find((product) => product.id === id);
}

/** One line per step: the tool called, and what it answered. */
function printSteps(p: Printer, result: RunResult, records: readonly CallRecord[]): void {
  p.section('WHAT THE AGENT DID — one line per step');

  result.steps.forEach((step, index) => {
    const record = records[index];
    const number = String(index + 1).padStart(2, ' ');
    p.item(`${number}  ${step.kind.padEnd(15)}${describeStep(step, result, record)}`);
  });
}

/** What came back from one step, in a few words. */
function describeStep(
  step: RunResult['steps'][number],
  result: RunResult,
  record: CallRecord | undefined,
): string {
  if (record !== undefined && !record.outcome.ok) {
    return `refused: ${describeRefusal(record.outcome.refusal)}`;
  }

  const { products, cart, quote } = result.memory;

  switch (step.kind) {
    case 'list_products':
      return `${String(products?.length ?? 0)} products in the catalogue`;

    case 'create_cart':
      return `${cart?.cart_id ?? 'a cart'}, empty`;

    case 'add_to_cart': {
      const product = productIn(products, step.pick.product_id);
      const title = product?.title ?? step.pick.product_id;
      const price = product === undefined ? 0 : priceOf(product) * step.pick.quantity;
      return `${String(step.pick.quantity)} x ${title} at ${money(price)}`;
    }

    case 'get_quote':
      return quote === undefined
        ? 'a quote'
        : `${quote.id}, total ${money(totalOf(quote))}, expires ${quote.expires_at}`;

    case 'place_order':
      return describeOrderOutcome(result);

    case 'stop':
      return step.why;
  }
}

/** How `place_order` answered, in the agent's own vocabulary. */
function describeOrderOutcome(result: RunResult): string {
  switch (result.outcome.kind) {
    case 'ordered':
      return `mandate accepted; order ${result.outcome.order.order_id} is ${result.outcome.order.status}`;
    case 'awaiting_confirmation':
      return `above the threshold: order ${result.outcome.held.order_id} held for a human`;
    case 'refused':
      return `refused: ${describeRefusal(result.outcome.refusal)}`;
    case 'stopped':
      return result.outcome.why;
  }
}

/** The revision the opening exchange settled on, as the connection reports it. */
interface Negotiated {
  readonly version: string | undefined;
  readonly era: string | undefined;
}

/**
 * What the agent and the merchant agreed to speak.
 *
 * Read off {@link MerchantConnection.protocolVersion} rather than stated,
 * because the whole point of printing it is that the in-process route and the
 * stdio route answer differently and a reader should see which one this is
 * (D75, D100).
 */
function printConnection(p: Printer, negotiated: Negotiated): void {
  p.section('THE CONNECTION — what the agent and the merchant agreed to speak');
  p.field('MCP revision', `${negotiated.version ?? 'unknown'} (era ${negotiated.era ?? 'unknown'})`);
  p.item('That is the in-memory transport\u2019s answer \u2014 an McpServer reached inside');
  p.item('this process serves the 2025-era handshake \u2014 whereas a merchant spawned');
  p.item('from merchant/stdio.ts negotiates 2026-07-28, which D75 records and');
  p.item('scripts/stdio-smoke.test.ts asserts.');
}

// --- what the merchant sold and what the rail did ------------------------

/** The basket, the total, and what the mandate has left afterwards. */
function printOrder(
  p: Printer,
  label: string,
  orderId: string,
  status: OrderStatus,
  result: RunResult,
  merchant: DemoMerchant,
  mandate: Mandate,
): void {
  p.section(label);
  p.item(`${orderId} — ${status}`);

  const { products, cart, quote } = result.memory;
  for (const line of cart?.items ?? []) {
    const title = productIn(products, line.product_id)?.title ?? line.product_id;
    p.item(`  ${String(line.quantity)} x ${title.padEnd(32)}${money(line.line_total_minor)}`);
  }
  if (quote !== undefined) {
    p.item(`  ${'total'.padEnd(36)}${money(totalOf(quote))}`);
  }

  const spent = merchant.policy.ledger.spent(mandate.mandate_id);
  p.item(
    `Mandate budget: ${money(spent)} spent of ${money(mandate.amount_cap_minor)}, ${money(mandate.amount_cap_minor - spent)} left`,
  );
  p.item('The ledger moves only after the rail captures (D45), so a refused');
  p.item('order and a declined card both leave the budget untouched.');
}

/** The stub rail's own record of the two calls that moved the money. */
function printRail(p: Printer, merchant: DemoMerchant): void {
  p.section('THE PAYMENT RAIL — a stub; no real money, no network');
  for (const entry of merchant.railLog) {
    p.item(formatRailLogEntry(entry));
  }
  p.item('Timestamps are the stub’s synthetic epoch, not wall-clock time.');
}

/**
 * The audit log, printed through the mandate layer's own `print(stream)`.
 *
 * Whatever the log holds is what comes out: the format is `formatEntry`'s and
 * the entries are the policy's, so entries another task adds appear here
 * without this file changing. The heading and the count say "check and
 * settlement" because since T07c the log holds both kinds (D94) — a decision
 * about a mandate, and what the rail then did about the money. Neither this
 * function nor the heading names a number: both are read off the log.
 */
function printAudit(p: Printer, merchant: DemoMerchant): void {
  p.section('THE AUDIT LOG — every mandate check and every settlement, pass or fail');
  merchant.policy.audit.print(indented(p.out, '  '));
  p.item(
    `${count(merchant.policy.audit.size, 'entry', 'entries')}. Append-only: nothing here is ever edited.`,
  );
  p.item('A check names the two parties; a settlement names the order it paid.');
}

/** How many entries of each kind the log holds. Counted, never assumed. */
function auditTally(merchant: DemoMerchant): { checks: number; settlements: number } {
  const entries = merchant.policy.audit.entries();
  const checks = entries.filter((entry) => entry.kind === 'mandate_check').length;
  return { checks, settlements: entries.length - checks };
}

// --- the two runs ---------------------------------------------------------

/** What a run produced, for the tests to assert on. */
export interface RunReport {
  /** The agent's own outcome word. */
  readonly agentOutcome: RunResult['outcome']['kind'];
  /** The order the merchant ended up with, once it was paid. */
  readonly paidOrderId: string | undefined;
  /** The confirmation token, when the order was held for a human. */
  readonly confirmationToken: string | undefined;
  /** The amount the quote came to, in minor units. */
  readonly amountMinor: number | undefined;
  /** What the policy decided, in order, as the audit log holds it. */
  readonly auditOutcomes: readonly string[];
  /** Total recorded against the mandate after the run. */
  readonly spentMinor: number;
}

/** Every run, so a test can read the whole demo without re-parsing the text. */
export interface DemoReport {
  readonly one: RunReport;
  readonly two: RunReport;
  readonly three: AttemptsReport;
}

/** The audit log's outcomes, in order. */
function auditOutcomes(merchant: DemoMerchant): readonly string[] {
  return merchant.policy.audit.entries().map((entry) => entry.outcome);
}

/** The shared opening: hand the agent a connection and let it shop. */
async function shop(
  merchant: DemoMerchant,
  identity: AgentIdentity,
): Promise<{
  result: RunResult;
  records: readonly CallRecord[];
  negotiated: Negotiated;
}> {
  const connection = await merchant.open();
  try {
    const records: CallRecord[] = [];
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: recording(connection, records),
      identity,
    });
    return {
      result,
      records,
      negotiated: { version: connection.protocolVersion, era: connection.protocolEra },
    };
  } finally {
    await connection.close();
  }
}

/**
 * Run 1: the mandate covers the basket, so nobody is interrupted.
 *
 * This is the happy path and the one a reader should be able to follow
 * without knowing anything about MCP.
 */
async function runOne(
  p: Printer,
  keys: MandateKeyPair,
  encodedPublicKey: string,
  railFactory: RailFactory,
): Promise<RunReport> {
  const mandate = issue(demoClaims(RUN_ONE), keys.privateKey);
  const merchant = startMerchant(encodedPublicKey, railFactory);

  p.run('RUN 1 — the mandate covers the basket, so the agent just buys');
  describeMandate(p, mandate);
  printMandateJson(p, mandate);

  const { result, records, negotiated } = await shop(merchant, { agent: AGENT, mandate });
  printConnection(p, negotiated);
  printSteps(p, result, records);

  const paid = result.outcome.kind === 'ordered' ? result.outcome.order : undefined;
  if (paid !== undefined) {
    const stored = merchant.orders.get(paid.order_id);
    printOrder(
      p,
      'THE ORDER — paid, in one call',
      paid.order_id,
      stored?.status ?? 'paid',
      result,
      merchant,
      mandate,
    );
    printRail(p, merchant);
  } else {
    p.section('THE ORDER');
    p.item(`No order: the run ended ${result.outcome.kind}.`);
  }

  printAudit(p, merchant);

  return {
    agentOutcome: result.outcome.kind,
    paidOrderId: paid?.order_id,
    confirmationToken: undefined,
    amountMinor: result.memory.quote === undefined ? undefined : totalOf(result.memory.quote),
    auditOutcomes: auditOutcomes(merchant),
    spentMinor: merchant.policy.ledger.spent(mandate.mandate_id),
  };
}

/**
 * Run 2: the same basket under the README mandate, so a human has to say yes.
 *
 * The agent stops with a token and does not use it (D74). The demo then puts
 * on the principal's hat: a second MCP client, which has never seen the
 * mandate, calls `confirm_order` with the token and nothing else.
 */
async function runTwo(
  p: Printer,
  keys: MandateKeyPair,
  encodedPublicKey: string,
  railFactory: RailFactory,
): Promise<RunReport> {
  const mandate = issue(demoClaims(RUN_TWO), keys.privateKey);
  const merchant = startMerchant(encodedPublicKey, railFactory);

  p.run('RUN 2 — the same basket, a lower threshold, so a human must confirm');
  describeMandate(p, mandate);

  const { result, records } = await shop(merchant, { agent: AGENT, mandate });
  printSteps(p, result, records);

  if (result.outcome.kind !== 'awaiting_confirmation') {
    p.section('THE HOLD');
    p.item(`Expected a hold; the run ended ${result.outcome.kind}. See the audit log below.`);
    printAudit(p, merchant);
    return {
      agentOutcome: result.outcome.kind,
      paidOrderId: undefined,
      confirmationToken: undefined,
      amountMinor: result.memory.quote === undefined ? undefined : totalOf(result.memory.quote),
      auditOutcomes: auditOutcomes(merchant),
      spentMinor: merchant.policy.ledger.spent(mandate.mandate_id),
    };
  }

  const held = result.outcome.held;
  const amount = result.memory.quote === undefined ? undefined : totalOf(result.memory.quote);

  p.section('THE AGENT STOPS HERE');
  p.field('order', `${held.order_id} — awaiting_confirmation`);
  p.field('confirmation token', held.confirmation_token);
  p.item(
    `${amount === undefined ? 'The basket' : money(amount)} is above the ${money(mandate.human_confirm_above_minor)} this mandate allows`,
  );
  p.item('without asking, so the merchant is holding the order and has handed');
  p.item('back a token. The agent does not use it and does not try again: an');
  p.item('agent that confirms its own order has removed the control it exists');
  p.item('to respect (D74). Nothing has been charged.');

  p.section('>>> THE HUMAN’S STEP — this is the principal, not the agent');
  p.item(`${PRINCIPAL} now calls confirm_order with the token, on a separate`);
  p.item('connection that has never held the mandate. In a product this is');
  p.item('the push notification, the e-mail link or the banking app prompt;');
  p.item('here it is the demo making the call the agent would not make.');

  const principal = await merchant.open();
  let confirmed: ToolOutcome;
  try {
    confirmed = await principal.callTool('confirm_order', {
      confirmation_token: held.confirmation_token,
    });
  } finally {
    await principal.close();
  }

  if (!confirmed.ok) {
    p.item(`confirm_order was refused: ${describeRefusal(confirmed.refusal)}`);
    printAudit(p, merchant);
    return {
      agentOutcome: result.outcome.kind,
      paidOrderId: undefined,
      confirmationToken: held.confirmation_token,
      amountMinor: amount,
      auditOutcomes: auditOutcomes(merchant),
      spentMinor: merchant.policy.ledger.spent(mandate.mandate_id),
    };
  }

  const stored = merchant.orders.get(held.order_id);
  printOrder(
    p,
    'THE ORDER — paid, after the human confirmed',
    held.order_id,
    stored?.status ?? 'paid',
    result,
    merchant,
    mandate,
  );
  printRail(p, merchant);
  printAudit(p, merchant);

  // Read off the log rather than written down: a sentence that counted for
  // itself was wrong the moment T07c added a settlement entry (D94).
  const tally = auditTally(merchant);
  p.item(
    `${count(tally.checks, 'mandate check')} and ${count(tally.settlements, 'settlement')} above.`,
  );
  p.item('The policy was asked when the order was held and asked again when');
  p.item('the token came back, because the window, the caps and the budget');
  p.item('can all have moved in between (D83). The settlement is the payment');
  p.item('they authorised between them.');

  return {
    agentOutcome: result.outcome.kind,
    paidOrderId: stored?.status === 'paid' ? stored.order_id : undefined,
    confirmationToken: held.confirmation_token,
    amountMinor: amount,
    auditOutcomes: auditOutcomes(merchant),
    spentMinor: merchant.policy.ledger.spent(mandate.mandate_id),
  };
}

// --- run 3: attempts to go past the mandate ------------------------------

/** The five attempts, in the order run 3 makes them. */
export const ATTEMPTS = [
  'per_order_cap',
  'remaining_budget',
  'wrong_merchant',
  'replay',
  'field_added',
] as const;

export type AttemptName = (typeof ATTEMPTS)[number];

/** What one attempt left behind, read off the merchant it was made at. */
export interface AttemptReport {
  readonly name: AttemptName;
  /** The merchant's refusal code, or undefined if the attempt was not refused. */
  readonly code: string | undefined;
  /** The failed mandate checks, in check order. Empty but for `mandate_refused`. */
  readonly reasons: readonly string[];
  /** The audit lines the attempt added, as `formatEntry` prints them. */
  readonly auditLines: readonly string[];
  /** The rail log entries the attempt caused, across both merchants. */
  readonly railEntries: readonly RailLogEntry[];
  /** Spent under the mandate at that merchant, before and after. */
  readonly spentBeforeMinor: number;
  readonly spentAfterMinor: number;
}

/** Run 3, for the tests. The rail log is a copy, not a view. */
export interface AttemptsReport {
  /** The two orders paid between attempts 1 and 2, which spend most of the budget. */
  readonly paidOrderIds: readonly string[];
  readonly attempts: readonly AttemptReport[];
  /** Spent under the mandate at the end of the run, summed over both merchants. */
  readonly spentMinor: number;
  /** Both merchants' rail logs at the end of the run, run 3's merchant first. */
  readonly railLog: readonly RailLogEntry[];
}

/** How an attempt ended: refused, or (if the code let it through) not. */
type AttemptEnd =
  | { readonly refused: true; readonly refusal: MerchantRefusal }
  | { readonly refused: false; readonly what: string };

/** What the agent tries, for the printout, and how it is run. */
interface Attempt {
  readonly name: AttemptName;
  readonly heading: string;
  readonly at: DemoMerchant;
  /** One or two lines: what is presented, and the limit it meets. */
  readonly tries: readonly string[];
  run(): Promise<AttemptEnd>;
}

/** The agent's run, reduced to how it ended. */
function endOf(result: RunResult): AttemptEnd {
  switch (result.outcome.kind) {
    case 'refused':
      return { refused: true, refusal: result.outcome.refusal };
    case 'ordered':
      return { refused: false, what: `order ${result.outcome.order.order_id} is ${result.outcome.order.status}` };
    case 'awaiting_confirmation':
      return { refused: false, what: `order ${result.outcome.held.order_id} held for a human` };
    case 'stopped':
      return { refused: false, what: `the agent stopped: ${result.outcome.why}` };
  }
}

/** The agent shopping for named products at a merchant, under an identity. */
async function buy(
  merchant: DemoMerchant,
  identity: AgentIdentity,
  ...productIds: string[]
): Promise<RunResult> {
  const connection = await merchant.open();
  try {
    return await runPlan({
      planner: scriptedPlanner({ choose: pickIds(...productIds) }),
      caller: connection,
      identity,
    });
  } finally {
    await connection.close();
  }
}

/** The catalogue's name for a product id. The demo's own catalogue, not the agent's. */
function nameOf(productId: string): string {
  return CATALOGUE.find((product) => product.id === productId)?.name ?? productId;
}

/** The catalogue's price for some products, one of each. */
function priceOfAll(...productIds: string[]): number {
  return productIds.reduce(
    (sum, id) => sum + (CATALOGUE.find((product) => product.id === id)?.price_minor ?? 0),
    0,
  );
}

/** "A and B": the products of a basket, by name. */
function names(...productIds: string[]): string {
  return productIds.map(nameOf).join(' and ');
}

/** Spent under the mandate, summed over the merchants. */
function spentUnder(mandate: Mandate, merchants: readonly DemoMerchant[]): number {
  return merchants.reduce((sum, m) => sum + m.policy.ledger.spent(mandate.mandate_id), 0);
}

/** The label column of an attempt's lines. */
const FIELD = 13;

/** One attempt, printed: what was tried, how it was refused, what it left. */
async function attempt(
  p: Printer,
  index: number,
  spec: Attempt,
  mandate: Mandate,
  merchants: readonly DemoMerchant[],
): Promise<AttemptReport> {
  // Every merchant is measured, not only the one the attempt was made at, so
  // money moved anywhere would show.
  const auditBefore = spec.at.policy.audit.size;
  const railBefore = merchants.map((m) => m.railLog.length);
  const spentBefore = spentUnder(mandate, merchants);

  const end = await spec.run();

  const auditLines = spec.at.policy.audit.entries().slice(auditBefore).map(formatEntry);
  const railEntries = merchants.flatMap((m, i) => m.railLog.slice(railBefore[i]));
  const railCalls = railEntries.length;
  const spentAfter = spentUnder(mandate, merchants);

  p.section(`ATTEMPT ${String(index + 1)} OF ${String(ATTEMPTS.length)} — ${spec.heading}`);
  for (const line of spec.tries) {
    p.item(line);
  }
  if (end.refused) {
    const reasons = end.refusal.reasons.map((entry) => entry.reason);
    p.field(
      'refused',
      reasons.length === 0 ? end.refusal.code : `${end.refusal.code} [${reasons.join(', ')}]`,
      FIELD,
    );
    // A mandate refusal's own message only repeats the codes; its reasons
    // carry the sentences.
    const why =
      end.refusal.reasons.length === 0
        ? [end.refusal.message]
        : end.refusal.reasons.map((entry) => entry.message);
    for (const message of why) {
      p.field('why', message, FIELD);
    }
  } else {
    p.field('NOT REFUSED', end.what, FIELD);
  }
  if (auditLines.length === 0) {
    p.field('audit line', 'none: refused before the mandate check (D65, D127)', FIELD);
  } else {
    p.item(count(auditLines.length, 'audit line') + ':');
    for (const line of auditLines) {
      p.item(`  ${line}`);
    }
  }
  p.field(
    'money',
    `${count(railCalls, 'rail call')}; spent ${spentAfter === spentBefore ? `${money(spentBefore)}, unchanged` : `${money(spentBefore)}, now ${money(spentAfter)}`}`,
    FIELD,
  );

  return {
    name: spec.name,
    code: end.refused ? end.refusal.code : undefined,
    reasons: end.refused ? end.refusal.reasons.map((entry) => entry.reason) : [],
    auditLines,
    railEntries,
    spentBeforeMinor: spentBefore,
    spentAfterMinor: spentAfter,
  };
}

/**
 * Run 3: five attempts to spend past what the mandate allows.
 *
 * The agent makes each one through its own code, as in runs 1 and 2: the
 * planner, the step runner, and `placeOrder`, the one place a mandate is put
 * on the wire. The replay is `placeOrder` called again with a quote that was
 * already ordered, which the agent's planner would never do by itself. What
 * each attempt printed is what the merchant answered, and what it left is
 * read off the audit log, the rail log and the ledger, never written down.
 *
 * The budget attempt needs most of the budget gone, so two orders the mandate
 * covers are paid first. One of them is the order the replay resends. Those
 * two are the only money run 3 moves, and the closing line measures the five
 * attempts from after them.
 */
async function runThree(
  p: Printer,
  keys: MandateKeyPair,
  encodedPublicKey: string,
  railFactory: RailFactory,
): Promise<AttemptsReport> {
  const mandate = issue(demoClaims(RUN_THREE), keys.privateKey);
  const merchant = startMerchant(encodedPublicKey, railFactory);
  const other = startMerchant(encodedPublicKey, railFactory, OTHER_MERCHANT);
  const identity: AgentIdentity = { agent: AGENT, mandate };
  const both = [merchant, other];

  p.run('RUN 3 — five attempts to spend past the mandate');
  describeMandate(p, mandate);
  p.item('The same limits as run 1, under a mandate id of its own. Each');
  p.item('attempt below is the agent presenting this mandate, and each one is');
  p.item('printed with what the merchant answered and what it left behind.');

  const cap = ['prod_gallowbrook_cafetiere'];
  const pair = ['prod_elderflint_notebook', 'prod_dunlin_merino_socks'];
  const small = ['prod_elderflint_notebook'];

  const attempts: AttemptReport[] = [];

  attempts.push(
    await attempt(
      p,
      0,
      {
        name: 'per_order_cap',
        heading: 'over the per-order cap',
        at: merchant,
        tries: [
          `tries        ${names(...cap)}, ${money(priceOfAll(...cap))}, in one order`,
          `the limit    at most ${money(mandate.per_transaction_cap_minor)} in any one order`,
        ],
        run: async () => endOf(await buy(merchant, identity, ...cap)),
      },
      mandate,
      both,
    ),
  );

  // Most of the budget goes, on two orders the mandate covers.
  p.section('BETWEEN ATTEMPTS 1 AND 2 — two orders the mandate does cover');
  const paidOrderIds: string[] = [];
  let replayQuote: string | undefined;
  for (let order = 0; order < 2; order += 1) {
    const result = await buy(merchant, identity, ...pair);
    if (result.outcome.kind === 'ordered') {
      paidOrderIds.push(result.outcome.order.order_id);
      replayQuote = result.memory.quote?.id;
      const quote = result.memory.quote;
      p.item(
        `${result.outcome.order.order_id} — ${result.outcome.order.status}, ${quote === undefined ? 'no quote' : `${money(totalOf(quote))}, quote ${quote.id}`}`,
      );
    } else {
      p.item(`Expected a paid order; the run ended ${result.outcome.kind}.`);
    }
  }
  p.item(`Each one is ${names(...pair)},`);
  p.item('the basket of runs 1 and 2.');
  const spent = merchant.policy.ledger.spent(mandate.mandate_id);
  p.item(
    `Mandate budget: ${money(spent)} spent of ${money(mandate.amount_cap_minor)}, ${money(mandate.amount_cap_minor - spent)} left`,
  );
  p.item('These are the only payments in run 3. Each attempt is measured on');
  p.item('its own, from just before it to just after it.');

  const left = mandate.amount_cap_minor - spent;

  attempts.push(
    await attempt(
      p,
      1,
      {
        name: 'remaining_budget',
        heading: 'over the budget left',
        at: merchant,
        tries: [
          `tries        ${names(...pair)},`,
          `             ${money(priceOfAll(...pair))}, the basket of runs 1 and 2`,
          `the limit    ${money(left)} left of the ${money(mandate.amount_cap_minor)} in total`,
        ],
        run: async () => endOf(await buy(merchant, identity, ...pair)),
      },
      mandate,
      both,
    ),
  );

  attempts.push(
    await attempt(
      p,
      2,
      {
        name: 'wrong_merchant',
        heading: 'at a merchant the mandate does not name',
        at: other,
        tries: [
          `tries        ${names(...pair)},`,
          `             ${money(priceOfAll(...pair))}, at ${OTHER_MERCHANT}`,
          `the limit    good at ${mandate.merchant} and nowhere else; ${OTHER_MERCHANT}`,
          '             trusts the same issuer, so the signature holds',
        ],
        run: async () => endOf(await buy(other, identity, ...pair)),
      },
      mandate,
      both,
    ),
  );

  attempts.push(
    await attempt(
      p,
      3,
      {
        name: 'replay',
        heading: 'a replay of an order already paid',
        at: merchant,
        tries: [
          `tries        place_order again with ${replayQuote ?? 'the last quote'}, which ${paidOrderIds.at(-1) ?? 'an order'} paid`,
          'the limit    a quote is good for one order (D64, D127)',
        ],
        run: async () => {
          const connection = await merchant.open();
          try {
            const outcome = await placeOrder(connection, identity, replayQuote ?? '');
            switch (outcome.status) {
              case 'refused':
                return { refused: true, refusal: outcome.refusal };
              case 'approved':
                return { refused: false, what: `order ${outcome.order.order_id} is ${outcome.order.status}` };
              case 'awaiting_confirmation':
                return { refused: false, what: `order ${outcome.held.order_id} held for a human` };
            }
          } finally {
            await connection.close();
          }
        },
      },
      mandate,
      both,
    ),
  );

  // Not typed as a `Mandate`: the extra field is the point, and the agent
  // puts on the wire whatever object its identity carries.
  const tampered = { ...mandate, ...ADDED_FIELD };
  const [field, value] = Object.entries(ADDED_FIELD)[0] ?? ['', 0];
  attempts.push(
    await attempt(
      p,
      4,
      {
        name: 'field_added',
        heading: 'the mandate with a field added after signing',
        at: merchant,
        tries: [
          `tries        ${names(...small)}, ${money(priceOfAll(...small))}, within the`,
          `             ${money(left)} left, with "${field}": ${String(value)}`,
          '             added to the mandate after it was signed',
          'the limit    every field but the signature is signed (D23)',
        ],
        run: async () => endOf(await buy(merchant, { agent: AGENT, mandate: tampered }, ...small)),
      },
      mandate,
      both,
    ),
  );

  const refused = attempts.filter((entry) => entry.code !== undefined).length;
  const during = attempts.flatMap((entry) => entry.railEntries);
  const captured = during
    .filter((entry) => entry.call === 'capture' && entry.outcome === 'ok')
    .reduce((sum, entry) => sum + (entry.amount_minor ?? 0), 0);
  const ledgerMoved = attempts.reduce(
    (sum, entry) => sum + entry.spentAfterMinor - entry.spentBeforeMinor,
    0,
  );

  p.section('THE INVARIANT — read off both ledgers and both rail logs');
  p.item(
    `${count(attempts.length, 'attempt')}, ${String(refused)} refused. Money moved by them: ${money(captured)}.`,
  );
  p.item(
    `Rail calls they caused: ${String(during.length)}. Added to the ledger: ${money(ledgerMoved)}.`,
  );
  if (during.length === 0) {
    p.item('No attempt reached the rail, and the ledger moves only after the');
    p.item('rail captures (D45), so none of them could move it.');
  } else {
    p.item('An attempt reached the rail: see its money line above.');
  }

  return {
    paidOrderIds,
    attempts,
    spentMinor: spentUnder(mandate, both),
    railLog: both.flatMap((m) => [...m.railLog]),
  };
}

// --- the demo -------------------------------------------------------------

/** How to vary the demo. The tests are the only caller that does. */
export interface DemoOptions {
  /**
   * The issuer's key pair. Generated per run by default, which is what keeps
   * a private key out of the repository; a test injects one so it can check
   * that neither half of it reaches the output.
   */
  readonly keys?: MandateKeyPair;
  /** Builds each run's rail. Default: the stub, which keeps the output byte-identical. */
  readonly rail?: RailFactory;
}

/**
 * Runs the whole demo and writes it to `stream`.
 *
 * The stream is a parameter for the same reason `AuditLog.print()` takes one
 * (D46): nothing in this repository should assume which stream it may write
 * to. The entry point below passes `process.stdout`, which is safe here
 * because the merchant is reached over an in-memory transport and no part of
 * this process's stdout is an MCP channel (D102).
 */
export async function runDemo(stream: OutputStream, options: DemoOptions = {}): Promise<DemoReport> {
  const p = new Printer(stream);
  const keys = options.keys ?? generateMandateKeyPair();
  const encodedPublicKey = exportPublicKey(keys.publicKey);
  const railFactory = options.rail ?? stubRailFactory;

  p.title('agentic-checkout-reference — an agent buys something, twice');
  p.line();
  p.line('An agent shops at a merchant and pays, inside limits a person');
  p.line('signed in advance. Run 1 stays inside them. Run 2 goes over the');
  p.line('threshold the person set for being asked, so a human confirms.');
  p.line('Nothing here touches real money: the payment rail is a stub.');

  p.section('HOW THIS DEMO IS WIRED');
  p.field('merchant', 'in this process, over the MCP in-memory transport');
  p.field('why', 'so the demo can print the merchant’s own audit log');
  p.field('stdio path', 'scripts/stdio-smoke.test.ts, against merchant/stdio.ts');
  p.field('clock', `frozen at ${DEMO_NOW}`);
  p.field('ids', 'sequential, so two runs print the same text');
  p.field('keys', 'generated in memory; no private key is ever printed');

  const one = await runOne(p, keys, encodedPublicKey, railFactory);
  const two = await runTwo(p, keys, encodedPublicKey, railFactory);
  const three = await runThree(p, keys, encodedPublicKey, railFactory);

  p.line();
  p.rule('=');
  p.line(' WHAT TO READ NEXT');
  p.rule('=');
  p.field('mandate/policy.ts', 'the seven checks, in the order they run', 28);
  p.field('mandate/audit.ts', 'the log above, and why it takes a stream', 28);
  p.field('merchant/place-order.ts', 'the money-out gate, step by step', 28);
  p.field('merchant/confirm-order.ts', 'what a human’s yes re-checks', 28);
  p.field('agent/order.ts', 'the one place a mandate is presented', 28);
  p.field('docs/PRD.md', 'what this is for; DECISIONS.md, why', 28);
  p.line();

  return { one, two, three };
}

/** True when this file is the process's entry point rather than an import. */
function isRunDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === entry;
}

if (isRunDirectly()) {
  // ACR_RAIL picks the rail (rail/select.ts). A refusal — an unknown name, or
  // stripe without a test-mode key — is one line on stderr before anything
  // else is printed.
  let rail: RailFactory;
  try {
    rail = railFactoryFromEnvironment(process.env);
  } catch (refused) {
    process.stderr.write(`demo: ${refused instanceof Error ? refused.message : String(refused)}\n`);
    process.exit(1);
  }
  await runDemo(process.stdout, { rail });
}
