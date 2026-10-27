# TASKS.md: queue for agentic-checkout-reference

Format: id · title · depends on · dirs allowed · auto (ignored at level B: Andrea merges everything; kept so the queue needs no edit if the level changes) · definition of done.
Workers take the lowest-numbered task whose dependencies are merged and which no one has claimed (claim = branch `task/<id>` exists). One task per branch per PR.

## Stage 1

Ruling 26 Oct (Andrea OS, S133-9): `docs/DECISIONS.md` is append-only and allowed for every build task from T06a onward; T10 consolidates it. Parallel runs only on disjoint dirs; T01 runs alone first.

- **T01 · Repo plumbing** · depends: none · dirs: root, `.github/` (this task only) · auto: no (touches `.github/`) · DoD: package.json scripts build/test/demo/lint; TypeScript strict; Vitest; ESLint; CI workflow running lint, build, test on push and PR; `npm test` passes with one placeholder test; PR template added at `.github/pull_request_template.md`.
- **T02 · SOURCES.md** · depends: none · dirs: `SOURCES.md` only · auto: no (Andrea reads sources) · DoD: MCP spec and TypeScript SDK, ACP spec, AP2 mandate model listed with URL and date read; each URL opened and confirmed; nothing listed that was not opened. If the sandbox has no web access, list the sources with `UNVERIFIED (no network)` next to each and stop; Andrea verifies the URLs by hand before merging.
- **T03 · Mandate types and signing** · depends: T01 · dirs: `mandate/`, `test/mandate/` · auto: yes · DoD: schema from README as TypeScript types; `issue()` with Ed25519; `verify()` signature check only; tests: valid, tampered.
- **T04 · Mandate policy and audit log** · depends: T03 · dirs: `mandate/`, `test/mandate/` · auto: yes · DoD: verify checks agent, merchant, window, per-transaction cap, remaining budget, currency, human-confirm threshold; AuditLog append-only with print(); tests for every refusal and the confirm threshold.
- **T05 · Stub rail** · depends: T01 · dirs: `rail/`, `test/rail/` · auto: yes · DoD: Rail interface authorise/capture; StubRail always succeeds and logs; tests.
- **T06a · Merchant MCP server, catalogue and cart** · depends: T01 · dirs: `merchant/`, `test/merchant/`, `docs/DECISIONS.md` (append only) · auto: yes · DoD: stdio MCP server; synthetic catalogue 8 to 12 GBP products; tools list_products, get_product, create_cart, add_to_cart; tests.
- **T06b · Merchant quote and ACP shaping** · depends: T06a · dirs: `merchant/`, `test/merchant/`, `docs/DECISIONS.md` (append only) · auto: yes · DoD: get_quote tool; product and checkout objects shaped to ACP product-feed and checkout vocabulary where it fits; each divergence appended to docs/DECISIONS.md as PROPOSED; tests.
- **T07a · Merchant place_order with mandate** · depends: T04, T05, T06b · dirs: `merchant/`, `test/merchant/`, `docs/DECISIONS.md` (append only) · auto: yes · DoD: place_order requires a mandate, calls mandate.verify, refuses with a structured error on failure, returns status awaiting_confirmation plus a confirmation_token above the human-confirm threshold; tests for every refusal and the awaiting path.
- **T07b · Merchant confirm_order and rail call** · depends: T07a · dirs: `merchant/`, `test/merchant/`, `docs/DECISIONS.md` (append only) · auto: yes · DoD: confirm_order(confirmation_token) completes a held order; successful orders call the rail and return status paid; tests for confirm, bad token, and paid path.
- **T08 · Buyer agent** · depends: T06b · dirs: `agent/`, `test/agent/`, `docs/DECISIONS.md` (append only) · auto: yes · DoD: MCP client; Planner interface; ScriptedPlanner runs list, pick two, cart, quote, place_order with mandate; deterministic; tests against the merchant server.
- **T09 · Demo script** · depends: T07b, T08 · dirs: `scripts/`, `package.json` (demo script line only), `docs/DECISIONS.md` (append only) · auto: yes · DoD: `npm run demo` issues a mandate, starts the server, runs the agent, prints order and audit log; second run trips human-confirm and shows the confirmation; runs clean from fresh clone.
- **T10 · Docs** · depends: T09 · dirs: `docs/`, README status table only · auto: no (Andrea reads docs) · DoD: ARCHITECTURE.md, SEQUENCE.md (Mermaid, both paths), MANDATE.md, DECISIONS.md consolidated; README Stage 1 marked done.

## Stage 2

- **T11 · Stripe test-mode rail** · depends: T10 · dirs: `rail/`, `test/rail/`, `.env.example` · auto: no (rail/stripe is outside the allowlist) · DoD: StripeRail behind the same interface using PaymentIntents in test mode; key via env only; `.env.example`; tests with Stripe mocked; demo switchable by env.
- **T12 · Failure-case suite and replay protection** · depends: T07b · dirs: `mandate/`, `merchant/`, `test/` · auto: yes · DoD: nonce or order-id replay rejected; expired, wrong merchant, over cap, replay each tested end to end through the server; audit log shows each.

## Claimed / done

(workers append: id · branch · PR · merged date)

- T01 · `task/T01` · PR #2 · not merged
