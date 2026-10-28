# agentic-checkout-reference

An independent, runnable reference implementation of an **agentic checkout**: an AI agent that discovers products, builds a cart and completes a purchase on a user's behalf, inside limits the user set in advance.

Built from public specifications only. No employer code.

## Why this exists

Agents are starting to buy things. The hard problem is not the cart; it is **authorisation**: how a human delegates bounded spending authority to software, how a merchant verifies that authority, and how a regulator (SCA under PSD2, soon PSD3/PSR) sees a transaction the user never clicked.

This repo makes that concrete. It implements the three pieces that have to agree:

1. **A merchant** that exposes catalogue, cart and order tools over the Model Context Protocol (MCP), shaped to the Agentic Commerce Protocol (ACP) product-feed and checkout surfaces.
2. **A buyer agent** that negotiates a purchase through those tools.
3. **A mandate layer**: a signed, scoped authorisation (merchant, amount cap, currency, expiry) checked on every money-out, with a human confirmation step above the cap and an audit log of every decision.

Payments run against a pluggable rail: a stub in Stage 1, Stripe test mode in Stage 2.

## Status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Skeleton that runs end to end on a stub rail; ACP-shaped merchant tools; mandate checks; tests; CI | **done** |
| 2 | Stripe test-mode rail; failure-case suite and replay protection (expired, wrong merchant, over cap, replay) | planned |
| 3 | Demo recording; design decisions; protocol divergence notes | planned |

## Run it

```bash
npm install
npm test
npm run demo        # two runs: one the mandate covers outright, one a human must confirm
```

`npm run demo` issues a mandate, starts the merchant, runs the agent, pays
through the stub rail and prints the order, the rail transcript and the audit
log — twice. The second run trips the human-confirm threshold, so the agent
stops with a token and the principal confirms. Two runs print byte-identical
text.

Node 22+. No keys needed for Stage 1. `npm run lint`, `npm run build` and
`npm run typecheck` are the other three scripts.

## Documents

| Document | What it answers |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | what this is for, and what it is not |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the pieces, the order states, where each check runs, and **what Stage 1 does not do** |
| [docs/SEQUENCE.md](docs/SEQUENCE.md) | both paths the demo shows, as diagrams |
| [docs/MANDATE.md](docs/MANDATE.md) | the mandate field by field, how it is signed, and the field-by-field mapping to AP2 |
| [docs/DECISIONS_INDEX.md](docs/DECISIONS_INDEX.md) | all 115 decisions in one table, and the ten that matter |
| [docs/DECISIONS.md](docs/DECISIONS.md) | every decision in full: what, the alternative, why, and what it cost |

## Layout

```
merchant/   MCP server: catalogue, cart, quote, place_order, confirm_order (synthetic data)
agent/      buyer agent that calls the merchant tools
mandate/    issue, sign, verify; policy checks; audit log
rail/       payment interface; stub implementation (Stage 1), Stripe test mode (Stage 2)
docs/       PRD, architecture, sequence diagrams, the mandate and AP2, decisions
test/
```

## The mandate

```json
{
  "mandate_id": "uuid",
  "principal": "user-id",
  "agent": "agent-id",
  "merchant": "merchant-id",
  "currency": "GBP",
  "amount_cap_minor": 5000,
  "per_transaction_cap_minor": 2500,
  "valid_from": "2026-10-25T00:00:00Z",
  "valid_until": "2026-10-26T00:00:00Z",
  "human_confirm_above_minor": 2000,
  "signature": "..."
}
```

Every `place_order` call carries a mandate. The merchant verifies the signature, the scope and the remaining budget before it touches the rail. Anything above `human_confirm_above_minor` pauses for a human decision. Every mandate check, pass or fail, is written to the audit log; so is every payment outcome.

## What this is not

- Not a product. Synthetic catalogue, no real money, no accounts.
- Not a conformance claim. ACP and AP2 are referenced for shape and vocabulary; divergences are documented in `docs/DECISIONS.md`.
- Not derived from any employer system. Sources are listed in `SOURCES.md`.

## Sources

See `SOURCES.md` for the specifications and documents this design was taken from, with dates.

## Author

Andrea Caputo, product leader in payments and agentic commerce. Writes at [Payment Stacking](https://andyldn.substack.com).

MIT licence.
