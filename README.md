# Stage 1 brief: agentic-checkout-reference

Run this in Claude Code on the Mac, inside a fresh clone of https://github.com/Andrea10/agentic-checkout-reference. Work on a branch `stage-1`, open a pull request at the end, do not merge. Andrea reviews and merges.

## Goal

A public, runnable skeleton: MCP merchant server, buyer agent, mandate layer, stub payment rail, tests, CI. `npm test` green and `npm run demo` runs the full flow and prints every mandate check. Nothing here touches real money or real keys.

## Hard rules

1. TypeScript on Node 22. Use `@modelcontextprotocol/sdk` for the MCP server and client. Verify the current package name and version on npm before installing; do not guess.
2. No code, naming, data or structure taken from any employer system. Design from the public specs listed in SOURCES.md. If you are unsure whether something is public, leave it out.
3. No secrets anywhere. `.env.example` only. No Stripe in this stage.
4. Synthetic data only: a catalogue of 8 to 12 made-up products with made-up names and prices in GBP minor units.
5. Every design choice that has an alternative goes into `docs/DECISIONS.md` as: decision, alternative, why, what it costs.
6. Keep the README as given; update only the Status table and the Run section if the commands change.
7. Commit in small steps with plain messages. No force-push.

## Build, in this order

### 1. Repo plumbing
- `package.json` with scripts: `build`, `test`, `demo`, `lint`.
- TypeScript strict. Vitest for tests. ESLint minimal.
- `.github/workflows/ci.yml`: install, lint, build, test on push and pull request.
- `SOURCES.md`: list, with URLs and the date you read them: the Model Context Protocol specification and TypeScript SDK; the Agentic Commerce Protocol specification (Stripe and OpenAI, Apache 2.0); the Agent Payments Protocol (AP2) mandate model (FIDO Alliance, v0.2). Verify each URL resolves. Do not cite anything you did not open.

### 2. `mandate/`
- Types: the mandate schema in the README.
- `issue(principal, agent, merchant, caps, window)`: returns a mandate signed with an Ed25519 key pair held by the principal (generate keys at runtime for the demo; `tweetnacl` or Node's `crypto`).
- `verify(mandate, request)`: checks signature, agent and merchant match, time window, per-transaction cap, remaining budget, currency. Returns `{ok, reason, requiresHumanConfirm}`.
- `AuditLog`: append-only in-memory log of every verify call with inputs, outcome and timestamp; `print()` for the demo.
- Tests: valid pass; expired; wrong merchant; wrong agent; over per-transaction cap; over remaining budget; wrong currency; tampered signature; human-confirm threshold.

### 3. `merchant/`
- MCP server over stdio exposing tools: `list_products`, `get_product`, `create_cart`, `add_to_cart`, `get_quote`, `place_order`.
- Shape the product and checkout objects to ACP's product-feed and checkout vocabulary where it fits (field names, status values). Where you diverge, note it in DECISIONS.md.
- `place_order` requires a mandate; it calls `mandate.verify` and refuses on failure with a structured error. On `requiresHumanConfirm`, it returns `status: "awaiting_confirmation"` and a `confirmation_token`; a second tool `confirm_order(confirmation_token)` completes it.
- On success it calls the rail and returns an order with `status: "paid"`.
- Tests: each tool; refusal paths; confirmation path.

### 4. `rail/`
- Interface: `authorise(amountMinor, currency, reference) -> {ok, rail_ref}` and `capture(rail_ref)`.
- `StubRail`: always succeeds, logs. Stage 2 replaces this with Stripe test mode behind the same interface.

### 5. `agent/`
- A buyer agent that connects to the merchant MCP server as a client and runs a scripted purchase: list products, pick two, build a cart, get a quote, place the order with the mandate.
- Deterministic in Stage 1: no LLM call. Structure it so an LLM-driven planner can be dropped in later (a `Planner` interface with a `ScriptedPlanner` implementation). Note this in DECISIONS.md.

### 6. `demo`
- `npm run demo`: issues a mandate, starts the merchant server, runs the agent, prints the order and the full audit log. Include one run that trips the human-confirm threshold and shows the confirmation step.

### 7. `docs/`
- `ARCHITECTURE.md`: one page, components and data flow.
- `SEQUENCE.md`: a Mermaid sequence diagram of the happy path and the human-confirm path.
- `MANDATE.md`: the schema with each field explained and the verify order.
- `DECISIONS.md`: as above.

## Definition of done

- `npm test` green locally and in CI.
- `npm run demo` runs clean from a fresh clone with `npm install` only.
- README Status table: Stage 1 marked done.
- Pull request open with a short summary and the test count.

## Report back

In the PR description: what was built, test count, anything in the specs you could not verify, and any decision you want Andrea to overrule.
