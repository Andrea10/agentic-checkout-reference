/**
 * Tests for the policy check: one test for every way a purchase can be
 * refused, one for the amount having to be a whole number of pence, one for
 * each edge of the validity window and the caps, and one for the
 * human-confirm threshold, which is not a refusal.
 */

import { describe, expect, it } from 'vitest';

import {
  AuditLog,
  checkMandate,
  createMandatePolicy,
  createMemoryLedger,
  fixedClock,
  generateMandateKeyPair,
  issue,
  recordSpend,
} from '../../mandate/index.js';

import type {
  MandateClaims,
  MandatePolicy,
  MandatePolicyOptions,
  PolicyDecision,
  PolicyRefusalReason,
  PolicyRequest,
} from '../../mandate/index.js';

/** Keys are generated every run. Nothing secret is ever committed here. */
const keys = generateMandateKeyPair();

const AGENT = 'agent-buyer-1';
const MERCHANT = 'merchant-demo';

/** Inside the mandate's window, which opens at midnight on the 25th. */
const NOW = '2026-10-25T12:00:00.000Z';

/** The example mandate from README.md. */
const claims: MandateClaims = {
  mandate_id: '7f1c2a5e-9b3d-4c81-a2f6-0d5e8b4a1c33',
  principal: 'user-andrea',
  agent: AGENT,
  merchant: MERCHANT,
  currency: 'GBP',
  amount_cap_minor: 5000,
  per_transaction_cap_minor: 2500,
  valid_from: '2026-10-25T00:00:00Z',
  valid_until: '2026-10-26T00:00:00Z',
  human_confirm_above_minor: 2000,
};

/** A mandate signed by the issuer the policy below trusts. */
function mandateWith(overrides: Partial<MandateClaims> = {}) {
  return issue({ ...claims, ...overrides }, keys.privateKey);
}

const mandate = mandateWith();

/** A policy with a frozen clock, so every run gets the same answer. */
function policyWith(options: Partial<MandatePolicyOptions> = {}): MandatePolicy {
  return createMandatePolicy({
    publicKey: keys.publicKey,
    clock: fixedClock(NOW),
    ...options,
  });
}

/** 1500 pence: inside every cap and below the confirm threshold of 2000. */
function check(
  overrides: Partial<PolicyRequest> = {},
  policy: MandatePolicy = policyWith(),
): PolicyDecision {
  return checkMandate(policy, {
    mandate,
    agent: AGENT,
    merchant: MERCHANT,
    amount_minor: 1500,
    currency: 'GBP',
    ...overrides,
  });
}

/** The reason codes of a refusal, or an empty list if it was not refused. */
function reasons(decision: PolicyDecision): readonly PolicyRefusalReason[] {
  return decision.outcome === 'refuse' ? decision.refusals.map((r) => r.reason) : [];
}

describe('checkMandate, a purchase the mandate covers', () => {
  it('allows it', () => {
    expect(check()).toMatchObject({
      outcome: 'allow',
      mandate_id: claims.mandate_id,
      agent: AGENT,
      merchant: MERCHANT,
      amount_minor: 1500,
      currency: 'GBP',
      checked_at: NOW,
    });
  });

  it('reports the budget left before this purchase is counted', () => {
    expect(check()).toMatchObject({ outcome: 'allow', remaining_budget_minor: 5000 });
  });

  it('allows a zero amount, which is a non-negative integer', () => {
    expect(check({ amount_minor: 0 }).outcome).toBe('allow');
  });

  it('allows an amount exactly at the per-transaction cap', () => {
    const generous = mandateWith({ human_confirm_above_minor: 5000 });

    expect(check({ mandate: generous, amount_minor: 2500 }).outcome).toBe('allow');
  });

  it('allows an amount exactly equal to the budget left', () => {
    const ledger = createMemoryLedger();
    ledger.record(claims.mandate_id, 3000);
    const generous = mandateWith({ per_transaction_cap_minor: 5000, human_confirm_above_minor: 5000 });

    expect(check({ mandate: generous, amount_minor: 2000 }, policyWith({ ledger }))).toMatchObject({
      outcome: 'allow',
      remaining_budget_minor: 2000,
    });
  });

  it.each(['2026-10-25T00:00:00.000Z', '2026-10-26T00:00:00.000Z'])(
    'allows it at %s, because the window includes both of its ends',
    (at) => {
      expect(check({}, policyWith({ clock: fixedClock(at) })).outcome).toBe('allow');
    },
  );
});

describe('checkMandate, the amount has to be a whole number of minor units', () => {
  it.each([
    1500.5,
    0.5,
    -1,
    -1500,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 2,
  ])('refuses %p', (amount) => {
    const decision = check({ amount_minor: amount });

    expect(decision.outcome).toBe('refuse');
    expect(reasons(decision)).toEqual(['amount_not_integer_minor_units']);
  });

  it('says so in words a person can read', () => {
    const decision = check({ amount_minor: 19.99 });

    expect(decision.outcome === 'refuse' && decision.refusals[0]?.message).toContain(
      'non-negative whole number of minor units',
    );
  });

  it('checks the amount before anything else, so a bad amount is the only reason', () => {
    const decision = check({ amount_minor: 1500.5, agent: 'agent-rogue', currency: 'USD' });

    expect(reasons(decision)).toEqual(['amount_not_integer_minor_units']);
  });
});

describe('checkMandate, the mandate has to be the issuer’s', () => {
  it('refuses a mandate whose claims changed after signing', () => {
    const tampered = { ...mandate, amount_cap_minor: 500000 };

    expect(reasons(check({ mandate: tampered }))).toEqual(['signature_invalid']);
  });

  it('refuses a mandate signed by somebody else', () => {
    const attacker = generateMandateKeyPair();
    const forged = issue(claims, attacker.privateKey);

    expect(reasons(check({ mandate: forged }))).toEqual(['signature_invalid']);
  });

  it('refuses a mandate with no signature as unreadable', () => {
    const unsigned = { ...claims, signature: '' };

    expect(reasons(check({ mandate: unsigned }))).toEqual(['mandate_malformed']);
  });

  it('runs no scope check on claims it cannot trust', () => {
    const tampered = { ...mandate, merchant: 'merchant-other', currency: 'USD' };

    expect(reasons(check({ mandate: tampered }))).toEqual(['signature_invalid']);
  });

  it('reports both gates when the amount and the signature are both wrong', () => {
    const tampered = { ...mandate, agent: 'agent-rogue' };

    expect(reasons(check({ mandate: tampered, amount_minor: -1 }))).toEqual([
      'amount_not_integer_minor_units',
      'signature_invalid',
    ]);
  });
});

describe('checkMandate, scope', () => {
  it('refuses an agent the mandate was not granted to', () => {
    const decision = check({ agent: 'agent-rogue' });

    expect(reasons(decision)).toEqual(['agent_mismatch']);
    expect(decision.outcome === 'refuse' && decision.refusals[0]?.message).toContain(AGENT);
  });

  it('refuses a merchant the mandate is not good at', () => {
    expect(reasons(check({ merchant: 'merchant-other' }))).toEqual(['merchant_mismatch']);
  });

  it('refuses a currency the mandate is not denominated in', () => {
    expect(reasons(check({ currency: 'USD' }))).toEqual(['currency_mismatch']);
  });

  it('compares the currency exactly: lower case is a different code', () => {
    expect(reasons(check({ currency: 'gbp' }))).toEqual(['currency_mismatch']);
  });

  it('does not compare amounts to caps in another currency', () => {
    const decision = check({ currency: 'USD', amount_minor: 999_999 });

    expect(reasons(decision)).toEqual(['currency_mismatch']);
  });
});

describe('checkMandate, the validity window', () => {
  it('refuses a mandate whose window has not opened', () => {
    const decision = check({}, policyWith({ clock: fixedClock('2026-10-24T23:59:59.999Z') }));

    expect(reasons(decision)).toEqual(['mandate_not_yet_valid']);
  });

  it('refuses a mandate whose window has closed', () => {
    const decision = check({}, policyWith({ clock: fixedClock('2026-10-26T00:00:00.001Z') }));

    expect(reasons(decision)).toEqual(['mandate_expired']);
  });

  it('refuses a mandate whose window cannot be read', () => {
    const broken = mandateWith({ valid_until: 'whenever' });

    expect(reasons(check({ mandate: broken }))).toEqual(['mandate_window_invalid']);
  });

  it('reads the time from the injected clock, not the system clock', () => {
    const policy = policyWith();

    expect(check({}, policy).outcome).toBe('allow');
    expect(check({}, policyWith({ clock: fixedClock('2027-01-01T00:00:00.000Z') })).outcome).toBe(
      'refuse',
    );
  });

  it('refuses to run on a clock that does not return an instant', () => {
    const policy = policyWith({ clock: () => 'half past three' });

    expect(() => check({}, policy)).toThrow(TypeError);
  });
});

describe('checkMandate, the caps', () => {
  it('refuses a purchase above the per-transaction cap', () => {
    const decision = check({ amount_minor: 2501 });

    expect(reasons(decision)).toEqual(['per_transaction_cap_exceeded']);
  });

  it('refuses a purchase above the budget left under the total cap', () => {
    const ledger = createMemoryLedger();
    ledger.record(claims.mandate_id, 4000);

    const decision = check({ amount_minor: 1500 }, policyWith({ ledger }));

    expect(reasons(decision)).toEqual(['budget_exceeded']);
  });

  it('says how much is left, in words a person can read', () => {
    const ledger = createMemoryLedger();
    ledger.record(claims.mandate_id, 4500);

    const decision = check({ amount_minor: 1000 }, policyWith({ ledger }));

    expect(decision.outcome === 'refuse' && decision.refusals[0]?.message).toContain('500 GBP');
  });

  it('counts budget per mandate, not across mandates', () => {
    const ledger = createMemoryLedger();
    ledger.record('some-other-mandate', 5000);

    expect(check({}, policyWith({ ledger })).outcome).toBe('allow');
  });

  it('names both caps when a purchase breaks both', () => {
    const ledger = createMemoryLedger();
    ledger.record(claims.mandate_id, 4000);

    const decision = check({ amount_minor: 3000 }, policyWith({ ledger }));

    expect(reasons(decision)).toEqual(['per_transaction_cap_exceeded', 'budget_exceeded']);
  });

  it('refuses a mandate whose own caps are not whole numbers of minor units', () => {
    const broken = mandateWith({ per_transaction_cap_minor: 2500.5 });

    expect(reasons(check({ mandate: broken }))).toEqual(['mandate_limits_invalid']);
  });

  it('refuses a mandate whose threshold is negative', () => {
    const broken = mandateWith({ human_confirm_above_minor: -1 });

    expect(reasons(check({ mandate: broken }))).toEqual(['mandate_limits_invalid']);
  });

  it('does not compare amounts to a cap it has already called unusable', () => {
    const broken = mandateWith({ amount_cap_minor: 0.5 });

    expect(reasons(check({ mandate: broken, amount_minor: 2000 }))).toEqual([
      'mandate_limits_invalid',
    ]);
  });
});

describe('checkMandate, the human-confirm threshold', () => {
  it('allows an amount exactly at the threshold: only above it needs asking', () => {
    expect(check({ amount_minor: 2000 }).outcome).toBe('allow');
  });

  it('asks for a human one penny above the threshold', () => {
    expect(check({ amount_minor: 2001 })).toMatchObject({
      outcome: 'confirm_required',
      human_confirm_above_minor: 2000,
      remaining_budget_minor: 5000,
      amount_minor: 2001,
    });
  });

  it('is not a refusal: there is nothing wrong with the mandate', () => {
    const decision = check({ amount_minor: 2500 });

    expect(decision.outcome).toBe('confirm_required');
    expect(reasons(decision)).toEqual([]);
  });

  it('is reached only once every other check has passed', () => {
    const decision = check({ amount_minor: 2600 });

    expect(reasons(decision)).toEqual(['per_transaction_cap_exceeded']);
  });

  it('does not consume budget while it waits', () => {
    const policy = policyWith();

    check({ amount_minor: 2500 }, policy);

    expect(policy.ledger.spent(claims.mandate_id)).toBe(0);
  });
});

describe('checkMandate, several failures at once', () => {
  it('names every failed check, in the order the checks are made', () => {
    const wrongWay = mandateWith({
      agent: 'agent-other',
      merchant: 'merchant-other',
      currency: 'EUR',
      valid_until: '2026-10-25T06:00:00Z',
    });

    expect(reasons(check({ mandate: wrongWay }))).toEqual([
      'agent_mismatch',
      'merchant_mismatch',
      'mandate_expired',
      'currency_mismatch',
    ]);
  });

  it('gives a message for every reason', () => {
    const wrongWay = mandateWith({ agent: 'agent-other', merchant: 'merchant-other' });
    const decision = check({ mandate: wrongWay });

    expect(decision.outcome === 'refuse' && decision.refusals.map((r) => r.message.length > 0))
      .toEqual([true, true]);
  });

  it('never refuses without a reason', () => {
    const decision = check({ agent: 'agent-rogue' });

    expect(decision.outcome === 'refuse' && decision.refusals.length).toBeGreaterThan(0);
  });
});

describe('recordSpend', () => {
  it('is a separate step: a check on its own consumes nothing', () => {
    const policy = policyWith();

    check({ amount_minor: 1500 }, policy);
    check({ amount_minor: 1500 }, policy);

    expect(policy.ledger.spent(claims.mandate_id)).toBe(0);
  });

  it('takes a decision straight back, because a decision is a spend record', () => {
    const policy = policyWith();
    const decision = check({ amount_minor: 1500 }, policy);

    expect(recordSpend(policy, decision)).toBe(1500);
  });

  it('is what makes the next check see less budget', () => {
    const policy = policyWith();

    expect(check({ amount_minor: 2000 }, policy)).toMatchObject({ remaining_budget_minor: 5000 });
    recordSpend(policy, { mandate_id: claims.mandate_id, amount_minor: 2000 });
    expect(check({ amount_minor: 2000 }, policy)).toMatchObject({ remaining_budget_minor: 3000 });
  });

  it('eventually exhausts the mandate', () => {
    const policy = policyWith();

    for (const amount of [2000, 2000, 1000]) {
      recordSpend(policy, { mandate_id: claims.mandate_id, amount_minor: amount });
    }

    expect(reasons(check({ amount_minor: 1 }, policy))).toEqual(['budget_exceeded']);
  });

  it('refuses to record an amount that is not a whole number of minor units', () => {
    const policy = policyWith();

    expect(() => recordSpend(policy, { mandate_id: claims.mandate_id, amount_minor: 19.99 })).toThrow(
      TypeError,
    );
  });
});

describe('checkMandate writes every check to the audit log', () => {
  it('records a check that passed', () => {
    const policy = policyWith();

    check({ amount_minor: 1500 }, policy);

    expect(policy.audit.entries()).toEqual([
      {
        at: NOW,
        mandate_id: claims.mandate_id,
        agent: AGENT,
        merchant: MERCHANT,
        amount_minor: 1500,
        currency: 'GBP',
        outcome: 'allow',
        reasons: [],
      },
    ]);
  });

  it('records a check that was refused, with its reason', () => {
    const policy = policyWith();

    check({ merchant: 'merchant-other' }, policy);

    expect(policy.audit.entries()[0]).toMatchObject({
      outcome: 'refuse',
      merchant: 'merchant-other',
      reasons: ['merchant_mismatch'],
    });
  });

  it('records a check that is waiting for a human', () => {
    const policy = policyWith();

    check({ amount_minor: 2500 }, policy);

    expect(policy.audit.entries()[0]).toMatchObject({
      outcome: 'confirm_required',
      reasons: [],
    });
  });

  it('timestamps the entry from the injected clock', () => {
    const policy = policyWith({ clock: fixedClock('2026-10-25T18:30:00.000Z') });

    check({}, policy);

    expect(policy.audit.entries()[0]?.at).toBe('2026-10-25T18:30:00.000Z');
  });

  it('keeps one entry per check, in order, pass or fail', () => {
    const policy = policyWith();

    check({ amount_minor: 1500 }, policy);
    check({ agent: 'agent-rogue' }, policy);
    check({ amount_minor: 2500 }, policy);
    check({ amount_minor: -1 }, policy);

    expect(policy.audit.entries().map((entry) => entry.outcome)).toEqual([
      'allow',
      'refuse',
      'confirm_required',
      'refuse',
    ]);
  });

  it('records the mandate id that was presented, even when the signature fails', () => {
    const policy = policyWith();
    const tampered = { ...mandate, principal: 'user-mallory' };

    check({ mandate: tampered }, policy);

    expect(policy.audit.entries()[0]).toMatchObject({
      mandate_id: claims.mandate_id,
      reasons: ['signature_invalid'],
    });
  });

  it('writes to a log shared across policies, so a merchant keeps one', () => {
    const audit = new AuditLog();

    check({}, policyWith({ audit }));
    check({ agent: 'agent-rogue' }, policyWith({ audit }));

    expect(audit.size).toBe(2);
  });
});

describe('createMandatePolicy', () => {
  it('needs only a public key, and brings its own clock, ledger and log', () => {
    const policy = createMandatePolicy({ publicKey: keys.publicKey });

    const decision = checkMandate(policy, {
      mandate,
      agent: AGENT,
      merchant: MERCHANT,
      amount_minor: 1500,
      currency: 'GBP',
    });

    // The real clock is now, long after the mandate in README.md expired.
    expect(reasons(decision)).toEqual(['mandate_expired']);
    expect(policy.audit.size).toBe(1);
    expect(policy.ledger.spent(claims.mandate_id)).toBe(0);
  });

  it('gives each policy its own ledger and log unless they are passed in', () => {
    const first = createMandatePolicy({ publicKey: keys.publicKey });
    const second = createMandatePolicy({ publicKey: keys.publicKey });

    recordSpend(first, { mandate_id: claims.mandate_id, amount_minor: 1500 });

    expect(second.ledger.spent(claims.mandate_id)).toBe(0);
    expect(second.audit.size).toBe(0);
  });
});
