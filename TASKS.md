# TASKS.md: queue for agentic-checkout-reference

Format: id · title · depends on · dirs allowed · auto (ignored at level B: Andrea merges everything; kept so the queue needs no edit if the level changes) · definition of done.
Workers take the lowest-numbered task whose dependencies are merged and which no one has claimed (claim = branch `task/<id>` exists). One task per branch per PR.

## Stage 1

- **T01 · Repo plumbing** · depends: none · dirs: root, `.github/` (this task only) · auto: no (touches `.github/`) · DoD: package.json scripts build/test/demo/lint; TypeScript strict; Vitest; ESLint; CI workflow running lint, build, test on push and PR; `npm test` passes with one placeholder test; PR template added at `.github/pull_request_template.md`.
- **T02 · SOURCES.md** · depends: none · dirs: root · auto: no (Andrea reads sources) · DoD: MCP spec and TypeScript SDK, ACP spec, AP2 mandate model listed with URL and date read; each URL opened and confirmed; nothing listed that was not opened.
- **T03 · Mandate types and signing** · depends: T01 · dirs: `mandate/`, `test/mandate/` · auto: yes · DoD: schema from README as TypeScript types; `issue()` with Ed25519; `verify()` signature check only; tests: valid, tampered.
- **T04 · Mandate policy and audit log** · depends: T03 · dirs: `mandate/`, `test/mandate/` · auto: yes · DoD: verify checks agent, merchant, window, per-transaction cap, remaining budget, currency, human-confirm threshold; AuditLog append-only with print(); tests for every refusal and the confirm threshold.
- **T05 · Stub rail** · depends: T01 · dirs: `rail/`, `test/rail/` · auto: yes · DoD: Rail interface authorise/capture; StubRail always succeeds and logs; tests.
- **T06 · Merchant MCP server, read tools** · depends: T01 · dirs: `merchant/`, `test/merchant/` · auto: yes · DoD: stdio MCP server; synthetic catalogue 8 to 12 GBP products; tools list_products, get_product, create_cart, add_to_cart, get_quote; ACP-shaped product and checkout objects where they fit; divergences noted in docs/DECISIONS.md (append only); tests.
- **T07 · Merchant place_order and confirm_order** · depends: T04, T05, T06 · dirs: `merchant/`, `test/merchant/` · auto: yes · DoD: place_order requires a mandate, calls verify, refuses with structured error, returns awaiting_confirmation plus token above threshold; confirm_order completes; success calls the rail and returns status paid; tests for all paths.
- **T08 · Buyer agent** · depends: T06 · dirs: `agent/`, `test/agent/` · auto: yes · DoD: MCP client; Planner interface; ScriptedPlanner runs list, pick two, cart, quote, place_order with mandate; deterministic; tests against the merchant server.
- **T09 · Demo script** · depends: T07, T08 · dirs: `scripts/`, root (package.json demo script only) · auto: yes · DoD: `npm run demo` issues a mandate, starts the server, runs the agent, prints order and audit log; second run trips human-confirm and shows the confirmation; runs clean from fresh clone.
- **T10 · Docs** · depends: T09 · dirs: `docs/`, README status table only · auto: no (Andrea reads docs) · DoD: ARCHITECTURE.md, SEQUENCE.md (Mermaid, both paths), MANDATE.md, DECISIONS.md consolidated; README Stage 1 marked done.

## Stage 2

- **T11 · Stripe test-mode rail** · depends: T10 · dirs: `rail/`, `test/rail/`, `.env.example` · auto: no (rail/stripe is outside the allowlist) · DoD: StripeRail behind the same interface using PaymentIntents in test mode; key via env only; `.env.example`; tests with Stripe mocked; demo switchable by env.
- **T12 · Failure-case suite and replay protection** · depends: T07 · dirs: `mandate/`, `merchant/`, `test/` · auto: yes · DoD: nonce or order-id replay rejected; expired, wrong merchant, over cap, replay each tested end to end through the server; audit log shows each.

## Claimed / done

(workers append: id · branch · PR · merged date)
