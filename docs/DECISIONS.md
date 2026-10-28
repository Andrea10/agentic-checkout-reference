# DECISIONS.md

Design decisions for agentic-checkout-reference, newest at the bottom.

Each entry carries a **decision**, the **alternative** not taken, **why**, and
the **cost** it leaves behind. A decision is `PROPOSED` until Andrea rules on
it, then `ACCEPTED` (or dropped). Workers append; they never edit an entry
above their own, and they never mark their own entries `ACCEPTED` on their own
judgement — only to record a ruling Andrea has given, naming the date. T10
consolidates this file.

Created by T06a, seeded with the decisions T01 proposed and Andrea ruled on.

---

## D01 · TypeScript pinned to 6.0.3, not npm `latest` 7.0.2 — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Pin `typescript` to 6.0.3.
- **Alternative.** TypeScript 7 (the native port, `latest` on npm at the time)
  with type-aware ESLint rules switched off.
- **Why.** `typescript-eslint@8.72.1` declares `typescript >=4.8.4 <6.1.0`, so
  TS 7 would break type-aware linting. 6.0.3 is the newest version the linter
  supports.
- **Cost.** The repo tracks one major behind `latest`. Revisit when
  typescript-eslint ships TS 7 support.

## D02 · Exact versions, no caret ranges, lockfile committed — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Every dependency is pinned to an exact version and
  `package-lock.json` is committed.
- **Alternative.** `^` ranges.
- **Why.** A reference implementation should build the same way in a year.
- **Cost.** Upgrades are manual; nothing picks up a patch release on its own.

## D03 · Placeholder files sit at the repo root — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `demo.ts` and `smoke.test.ts` live at the repo root.
- **Alternative.** Creating `scripts/` and `test/` in T01, outside T01's
  directory allowance.
- **Why.** T01 may only touch root and `.github/`: `scripts/` belongs to T09
  and `test/<area>/` to T03 onward. The tsconfig `include` (`**/*.ts`) and
  Vitest's default glob already cover the eventual layout.
- **Cost.** Two files at the root that exist only to be replaced. T09 moves
  `demo.ts` to `scripts/demo.ts` and updates the one `demo` script line; T03
  deletes `smoke.test.ts` when the first real suite lands.

## D04 · `engines.node` is `>=22.13.0` — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `engines.node` is `>=22.13.0`. (Corrected in T01 review round 1
  from the `>=22.12.0` originally proposed.)
- **Alternative.** `>=22.12.0`, the floor `vitest@5.0.5` alone implies, or a
  looser `>=22.0.0`.
- **Why.** `eslint@10.13.0` declares `node ^20.19.0 || ^22.13.0 || >=24`, the
  highest floor in the dependency set. The rest are lower:
  `typescript-eslint@8.72.1` `>=21.1.0`, `tsx@4.23.15` `>=18.0.0`,
  `typescript@6.0.3` `>=14.17`, `@types/node@22.20.5` none.
- **Cost.** `>=22.12.0` would have admitted Node 22.12.x, a version eslint does
  not support, so `npm ci` would emit `EBADENGINE` and `npm run lint` would run
  on an unsupported engine. CI hides that, because `node-version: '22'`
  resolves to the latest 22.x, so the gap would only reach a contributor who
  pins 22.12 — the exact reader the `engines` field is written for. README's
  "Node 22+" stays true either way.

## D05 · Strict is stricter than `strict` — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `strict` plus `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- **Alternative.** Plain `strict`.
- **Why.** Worth it for a repo whose whole subject is checking things.
- **Cost.** It constrains every later task. `noUncheckedIndexedAccess` in
  particular forces explicit handling of array and record lookups in the
  catalogue and cart code.

## D06 · ESM throughout — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `type: module` and `moduleResolution: nodenext`, so relative
  imports carry a `.js` extension even from `.ts` sources (`./demo.js`).
- **Alternative.** CommonJS (`type: commonjs`, `moduleResolution: node16`),
  which removes the `.js`-extension requirement on every relative import.
- **Why.** ESM is the shape the MCP SDK and the rest of the ecosystem publish
  in, and it keeps top-level await available for the demo entry point and the
  server bootstrap.
- **Cost.** Every relative import in every later task carries a `.js`
  extension pointing at a `.ts` file — the real ergonomic cost, and one every
  task pays. The SDK named in T01's review round was
  `@modelcontextprotocol/sdk` 1.32.2, published `"type": "module"` with its
  `types` and `import` conditions resolving to `dist/esm`; a `require`
  condition at `dist/cjs` exists, so CommonJS would have worked, but as the
  secondary path. CommonJS would also have given up top-level await.

## D07 · No `@eslint/js` dependency — ACCEPTED (Andrea, 27 Oct)

- **Decision.** The flat config uses only `typescript-eslint`'s
  `recommendedTypeChecked` over `**/*.ts`.
- **Alternative.** Adding `@eslint/js` for `js.configs.recommended`.
- **Why.** T01 named ESLint and its TypeScript plugin and config; `@eslint/js`
  would have been a seventh dependency the task did not name.
- **Cost.** Plain `.js` files — today only `eslint.config.js` — get no rules.

## D08 · CI runs on every push to every branch — ACCEPTED (Andrea, 27 Oct)

- **Decision.** The `ci` workflow runs on every push and every pull request.
- **Alternative.** Restricting pushes to `main` and `task/**`.
- **Why.** A worker sees red before it opens a PR.
- **Cost.** More Actions minutes, including on throwaway branches.

## D09 · MCP TypeScript SDK v2, not v1.x — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Build on the MCP TypeScript SDK v2 —
  `@modelcontextprotocol/server` and `@modelcontextprotocol/client`, 2.x,
  implementing MCP revision 2026-07-28.
- **Alternative.** The v1.x `@modelcontextprotocol/sdk` package.
- **Why.** v2 is the current SDK line for the current protocol revision; a
  reference implementation written against the superseded package would be
  teaching the old shape on the day it is published.
- **Cost.** v2 maturity and API churn, mitigated by exact pins (D02).

## D10 · Keep the flat mandate for Stage 1 — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Keep the flat mandate from README.md for Stage 1 and document
  the gap to AP2's Checkout Mandate and Payment Mandate (SD-JWT) in
  `docs/MANDATE.md` (T10).
- **Alternative.** Restructure the mandate into AP2's two-mandate model now.
- **Why.** The gap is better described than half-implemented, and T10 is the
  task that owns the description.
- **Cost.** A stated divergence from AP2. Reasonable because a stub rail has no
  payment processor to hold a Payment Mandate.

---

## T06a · Merchant MCP server, catalogue and cart

Andrea ruled on D11 to D20 on 27 Oct: all ACCEPTED, with D12 amended — he
chose the alternative, so D12 below is rewritten to describe what is now
implemented. D21 is PROPOSED and awaits a ruling.

## D11 · A cart is addressed only by an explicit `cart_id` — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `create_cart` returns a `cart_id`; every later cart call
  carries it. Carts live in an in-process `Map` inside a `CartStore`, one store
  per server instance, created by the stdio entry per connection.
- **Alternative.** An implicit per-session cart the server remembers, or
  persisting carts to disk or SQLite.
- **Why.** MCP v2 is stateless: nothing survives between calls unless the
  client hands it back, so the identifier has to be explicit and in the
  arguments. An in-process map is the smallest thing that holds carts for the
  life of a stdio connection.
- **Cost.** Carts die with the process and are never evicted while it lives.
  Nothing is shared across processes, so T09's demo must keep one server alive
  for the whole run, and a horizontally scaled merchant would need a real
  store.

## D12 · Cart ids are random by default, sequential only when injected — ACCEPTED (Andrea, 27 Oct, amended)

T06a proposed sequential ids as the default. Andrea chose the alternative. The
entry below describes what is implemented.

- **Decision.** `CartStore` defaults to `randomCartIds`, which returns
  `cart_` followed by a `crypto.randomUUID()`. The `CartIdFactory` stays
  injectable, and `sequentialCartIds()` remains exported for tests and for the
  T09 demo, which pass it explicitly when they need a stable transcript.
- **Alternative.** Sequential `cart_000001` ids as the default, as T06a first
  proposed.
- **Why.** A cart id is the only thing standing between a caller and someone
  else's cart (D11), so the default has to be unguessable. Determinism is a
  property the tests and the demo need, not the server, and injecting the
  factory gives it to them without weakening the default.
- **Cost.** Nothing that reads a cart id can assume a shape or an order, so
  the one protocol test that asserted on the id now matches a UUID. Any caller
  wanting a reproducible transcript must inject the factory and say so.

## D13 · Refusals are `isError` with a JSON body, and no `structuredContent` — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Handlers throw a `MerchantError` carrying a code; the MCP layer
  returns `isError: true` with one text block holding
  `{"error":{"code","message"}}` and omits `structuredContent`. Codes so far:
  `product_not_found`, `cart_not_found`, `invalid_quantity`,
  `insufficient_stock`.
- **Alternative.** Putting the same error body in `structuredContent` as well.
- **Why.** Each tool advertises an `outputSchema` for its success shape. An
  error body does not match that schema, so sending it as `structuredContent`
  would contradict what the tool advertised.
- **Cost.** A client that reads only `structuredContent` has to fall back to
  parsing the text block whenever `isError` is set. T07 inherits this envelope
  for mandate refusals.

## D14 · Tool logic sits in plain functions, apart from MCP registration — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `merchant/tools.ts` holds the four handlers as ordinary
  functions over a `MerchantState`; `merchant/server.ts` registers them.
- **Alternative.** Putting the logic inside the `registerTool` callbacks.
- **Why.** A refusal can then be tested without a transport, and T06b and T07
  add tools without touching the registration seam.
- **Cost.** One more indirection. The SDK validates arguments against the
  advertised schema, so a handler called directly is *not* schema-checked;
  tests that care about the boundary must parse with the zod schema explicitly,
  and they do.

## D15 · The catalogue shape is internal, not ACP, in T06a — ACCEPTED (Andrea, 27 Oct)

- **Decision.** Products and carts use plain internal field names
  (`price_minor`, `subtotal_minor`, `line_total_minor`).
- **Alternative.** Shaping to the ACP product-feed and checkout vocabulary now.
- **Why.** T06b owns ACP shaping and is required to open the ACP spec files
  first. Guessing at the vocabulary here would be the kind of unverified claim
  the factory rules forbid.
- **Cost.** T06b will rename or remap these fields, and anything written
  against the T06a shape before then has to follow.

## D16 · Money is an integer of minor units in one hard-coded currency — ACCEPTED (Andrea, 27 Oct)

- **Decision.** All money is an integer number of GBP pence. `CURRENCY` is the
  literal `'GBP'`; no float appears anywhere.
- **Alternative.** A decimal string, or a money library.
- **Why.** It matches the `*_minor` fields of the mandate in README.md, and
  integer arithmetic means line totals and subtotals never round.
- **Cost.** No multi-currency. A second currency would need a real `Money` type
  and a currency check at every boundary, including the mandate's.

## D17 · Stock is checked but never reserved — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `add_to_cart` refuses when the *merged* line quantity exceeds
  `product.stock`, but nothing is held back for that cart.
- **Alternative.** Reserving stock when it enters a cart.
- **Why.** The catalogue is synthetic and static, and a reservation needs an
  expiry, a release path and a sweeper — machinery with no payoff at Stage 1.
- **Cost.** A cart can pass the stock check and still be unfulfillable when the
  order is placed. T07's `place_order` should re-check rather than trust the
  cart.

## D18 · `zod` is a direct dependency — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `zod` is pinned exactly at 4.6.7 in `dependencies`.
- **Alternative.** Relying on it transitively through
  `@modelcontextprotocol/server`, or hand-writing JSON Schema for the tools.
- **Why.** `merchant/tools.ts` imports zod directly to describe the tool
  schemas, and a package the code imports belongs in `package.json`. The SDK
  accepts any Standard Schema, but zod is already in the tree and is what the
  v2 documentation uses.
- **Cost.** One more exact pin to keep in step with the SDK's own range
  (`zod: ^4.2.0`). If a future SDK bump needs a zod major, both move together.

## D19 · Line quantity is capped at 99 and defaults to 1 — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `MAX_LINE_QUANTITY` is 99, enforced on the merged line as well
  as the increment. `add_to_cart`'s `quantity` defaults to 1.
- **Alternative.** No cap, and a required `quantity`.
- **Why.** It bounds the subtotal so the mandate cap tests in T07 mean
  something, and a mistyped quantity cannot build a six-figure cart.
- **Cost.** 99 is arbitrary and is not a merchant rule; a real catalogue would
  set it per product.

## D20 · Protocol tests drive raw JSON-RPC, not the MCP client — ACCEPTED (Andrea, 27 Oct)

- **Decision.** `test/merchant/protocol.test.ts` writes JSON-RPC messages by
  hand, over the SDK's `InMemoryTransport` pair and over a real spawned
  `merchant/stdio.ts` process.
- **Alternative.** Adding `@modelcontextprotocol/client` and using it.
- **Why.** That package is T08's named dependency; T06a may not add it.
- **Cost.** The opening exchange is hand-written and uses `protocolVersion`
  `2025-11-25`, which `serveStdio` serves through its default
  `legacy: 'serve'` path. The modern 2026-07-28 opening is therefore **not**
  exercised by these tests; T08 covers the client side and should exercise it.

## D21 · D06's cost cites an SDK that D09 replaced — PROPOSED (T06a)

- **Decision.** Leave D06's text exactly as ruled and record the consequence
  here instead. (T06a first wrote this as a dated note inside D06's Cost
  bullet; pre-review round 1 was right that an insertion into a ruled entry is
  not an append, so it was moved here whole.)
- **Alternative.** Amend D06 in place.
- **Why.** D06's cost names `@modelcontextprotocol/sdk` 1.32.2 and argues from
  how that package is published. D09 replaced it with the v2 SDK
  (`@modelcontextprotocol/server`), so that specific justification no longer
  applies. The ESM decision itself stands on its own: `type: module`,
  `moduleResolution: nodenext`, and a `.js` extension on every relative
  import, which is what T06a is built on.
- **Cost.** A reader of D06 has to reach D21 to learn that one line of its
  cost is stale, and the two entries are 150 lines apart. T10 consolidates
  this file and should fold them together then.

---

## T05 · Stub rail

The rail interface has to survive Stage 2 unchanged, so these entries lean on
what Stripe actually does rather than on what a stub finds convenient. Pages
opened and read on 28 Oct 2026, with the facts they settled:

- <https://docs.stripe.com/payments/capture-later> — a PaymentIntent created
  with `capture_method=manual` authorises without capturing, reaches status
  `requires_capture`, and is captured by `POST
  /v1/payment_intents/{id}/capture`, which "captures the total authorized
  amount by default"; "you can only perform one capture on an authorized
  payment for most payments"; an online card authorisation is typically valid
  7 days and, unexpired and uncaptured, is released.
- <https://docs.stripe.com/api/payment_intents/capture> — the id is in the
  path; `amount_to_capture` is an optional integer "Defaults to the full
  `amount_capturable` if it's not provided".
- <https://docs.stripe.com/api/errors> — `type` is one of `api_error`,
  `card_error`, `idempotency_error`, `invalid_request_error`; `decline_code`
  is populated "For card errors resulting from a card issuer decline".
- <https://docs.stripe.com/error-codes> — `card_declined`,
  `insufficient_funds` and `authentication_required` are real error codes, as
  are `charge_already_captured`, `capture_unauthorized_payment` and
  `invalid_charge_amount` ("must be a positive integer in the smallest
  currency unit").
- <https://docs.stripe.com/api/idempotent_requests> — idempotency is an
  `Idempotency-Key` HTTP request header the client generates, pruned after at
  least 24 hours; it is not a field on the object.

## D50 · A decline is a result; only a broken rail throws — PROPOSED (T05)

- **Decision.** `authorise` and `capture` return
  `{ ok: true, ... } | { ok: false, decline }`. A refusal never throws. An
  exception from a rail means the rail itself failed — no network, bad
  credentials, a timeout — and says nothing about the money.
- **Alternative.** Throw a `RailError` on a decline, as `merchant/` throws
  `MerchantError` for a refusal (D13).
- **Why.** A decline is the normal, expected answer that the order must record
  and the audit log must show; `mandate.verify` already returns a union rather
  than throwing (T03's `VerifyResult`), and the rail is the same kind of
  boundary. Keeping the two apart matters most in the case that actually hurts
  in payments: a timeout is *not* a decline, because the payment may have gone
  through, and code that catches both in one `catch` will quietly record a
  successful charge as a refused card.
- **Cost.** Two failure mechanisms at one seam, so a caller needs a branch
  *and* a `try`. T11 has to classify every Stripe failure into one or the
  other: by the error types above, `card_error` and `invalid_request_error`
  become declines, `api_error` and a transport failure throw, and
  `idempotency_error` is a caller bug that throws.

## D51 · One request object per call, and no knowledge of the mandate — PROPOSED (T05)

- **Decision.** `authorise` takes a single `AuthoriseRequest` of
  `order_ref`, `amount_minor` and `currency`; it returns an `Authorisation`
  that echoes all three plus a rail-issued `authorisation_id` and
  `authorised_at`. Both calls are `Promise`-returning even though the stub has
  nothing to await. `rail/` imports nothing from `mandate/` or `merchant/` and
  declares its own `MinorUnits`, `CurrencyCode` and `Instant` aliases.
- **Alternative.** Positional parameters (`authorise(orderRef, amount,
  currency)`), synchronous signatures on the stub, and passing the cart or the
  verified mandate so the rail could check the caps itself.
- **Why.** A request object means a field can be added later without touching
  a call site, which is the whole point of an interface that must outlive
  Stage 1. Async because a real rail is a network call and Stage 2 must not
  change the signature. And the rail must not see the mandate: authorisation
  is decided *before* the money moves, by `mandate.verify` and the merchant
  (R2, R9). A rail that could read the caps would invite a second, divergent
  copy of the policy — and no real PSP would ever be handed the user's
  mandate.
- **Cost.** The amount is stated twice in a flow, once to the mandate check
  and once to the rail, and nothing in the type system ties them together:
  the merchant could verify 2499 and authorise 9999. T07b is where that has
  to be got right, and its tests have to cover it. `rail/` also repeats three
  one-line type aliases that `mandate/` already has.

## D52 · `capture` takes the authorisation id and takes the lot — PROPOSED (T05)

- **Decision.** `capture({ authorisation_id })`. No amount: a capture settles
  the authorisation in full, and the `Capture` it returns carries the
  authorisation's own `order_ref`, `amount_minor` and `currency`. There is no
  capture id; a capture is identified by the authorisation it settled.
- **Alternative.** `capture({ authorisation_id, amount_minor })` for partial
  capture, or a capture that re-states the amount so the rail can check it.
- **Why.** It is what Stripe does: the id is in the path, and capture takes
  the full authorised amount unless `amount_to_capture` says otherwise. Full
  capture is also the only thing this repo needs — there is no cancel and no
  refund by the PRD, and the merchant captures exactly what it authorised.
  Omitting the amount removes a mismatch that would otherwise need a rule
  (what does a rail do when the capture amount differs from the hold?), and
  because the parameter is an object (D51) adding an optional `amount_minor`
  in Stage 2 would change no call site.
- **Cost.** A merchant that wants to capture less than it held cannot, until
  that optional field is added. Stripe also releases the remainder on a
  partial capture and allows only one capture per authorisation, so partial
  capture is a one-shot decision rather than a running balance — more
  semantics than a Stage 1 reference wants to teach.

## D53 · A decline carries a code, a message and an origin — PROPOSED (T05)

- **Decision.** `RailDecline` is `{ code, message, origin }`. `code` is a
  closed union of eight values; `origin` is `'issuer' | 'rail'`. All eight
  codes are declared now, including three — `card_declined`,
  `insufficient_funds`, `authentication_required` — that `StubRail` never
  produces.
- **Alternative.** Just `{ code, message }`, matching the merchant's error
  body (D13) exactly; and declaring only the codes the stub can produce,
  letting T11 widen the union.
- **Why.** `code` plus `message` is the envelope the repo already uses, so a
  reader learns one shape. `origin` is the distinction that only payments
  needs and that a product reader should see named: the issuer refusing a
  cardholder's money is a different event from the payment system rejecting a
  malformed request, and Stripe draws exactly this line between a `card_error`
  and an `invalid_request_error`. Declaring the issuer codes now is what keeps
  the promise that Stage 2 changes nothing: a widened union is a changed
  interface, and every `switch` over it would have to be revisited. The three
  names are Stripe's own error codes, so the mapping is one-to-one, and
  `authentication_required` is where SCA under PSD2 lands — the case this
  whole repo exists to make visible.
- **Cost.** Three declared codes nothing produces, which a reader may hunt
  for; `test/rail/log.test.ts` asserts both that they are in the union and
  that the stub never emits them, so the dead branches cannot drift
  unnoticed. `DECLINE_CODES` also has to be kept in step with the union by
  hand — a typed exhaustiveness check in the same test does that.

## D54 · The stub logs through an injected sink, and is silent by default — PROPOSED (T05)

- **Decision.** `StubRail` takes `log: (entry: RailLogEntry) => void`. It is
  handed structured entries, not strings, and the default is
  `discardRailLog`, which writes nowhere. `writeTo(stream)` turns any object
  with a `write(chunk: string)` into a sink, so `writeTo(process.stderr)` is
  the one-liner for a server, and `formatRailLogEntry` is the one-line text
  format it uses.
- **Alternative.** Take a `NodeJS.WritableStream` directly, as T04's
  `AuditLog.print()` does; or default to `process.stderr` so a rail
  constructed with no options still shows its work.
- **Why.** The merchant runs as an MCP stdio server, where stdout carries
  JSON-RPC frames and a stray `console.log` corrupts the protocol — so a rail
  must never pick a destination for itself, and silence is the only safe
  default. A callback over a stream because the entry is then a value a test
  can assert fields on and the T09 demo can render its own way, with no
  parsing; `writeTo` keeps the stream case to one call. Typing the stream as
  `{ write(chunk: string) }` rather than `NodeJS.WritableStream` lets a test
  pass a plain object.
- **Cost.** `new StubRail()` records nothing, which looks broken until you
  read the doc comment; the demo and every test that cares must pass a sink.
  The rail now has a second logging path alongside T04's `AuditLog`: the
  audit log is the record of *authorisation* decisions and this is the record
  of what the *rail* did, which T10 should explain, or fold together.

## D55 · The stub is deterministic by construction — PROPOSED (T05)

- **Decision.** Default authorisation ids are sequential — `auth_000001` — and
  the default clock starts at `STUB_RAIL_EPOCH` (`2026-01-01T00:00:00.000Z`)
  and steps one second per call. Nothing in `StubRail` reads
  `crypto.randomUUID` or the wall clock unless `randomAuthorisationIds` or
  `systemClock` is injected.
- **Alternative.** Random ids and real time by default, as `CartStore` has for
  cart ids (D12), with determinism injected by the tests; or a frozen clock
  with no step; or no default clock at all, so every caller must supply one.
- **Why.** The task requires it, and the reason it is the right requirement
  here is that a stub rail holds no money: an unguessable id protects nothing,
  whereas a repeatable transcript is the whole value of a stub — the T09 demo
  prints a rail log that has to look the same on every machine, and a test can
  assert on an exact id and timestamp instead of a regular expression. This
  does not contradict D12, which is about an id a client could use to reach
  someone else's cart; `randomAuthorisationIds` is exported for the case where
  a stub id does leak to an untrusted caller, and T11's ids come from Stripe.
  The clock steps rather than freezing because an authorise and the capture
  that settles it sharing a timestamp reads as a bug.
- **Cost.** The default ids are guessable, so nothing may treat a stub
  authorisation id as a secret, and the timestamps are fiction a reader must
  not mistake for wall-clock — `2026-01-01T00:00:00.000Z` is deliberately
  round so that it cannot be. The one-second step is arbitrary.

## D56 · `order_ref` is a reference, not an idempotency key — PROPOSED (T05)

- **Decision.** The rail echoes `order_ref` and logs it, and nothing more. Two
  `authorise` calls with the same `order_ref` produce two independent
  authorisations.
- **Alternative.** Treat `order_ref` as an idempotency key, so a repeated
  authorise returns the first authorisation instead of a second one.
- **Why.** Stripe's idempotency is an `Idempotency-Key` request header the
  client generates, with its own 24-hour-plus retention and a conflict error
  when the parameters of a retry differ — not a field on the PaymentIntent.
  Overloading `order_ref` with that meaning would teach a shape Stage 2 cannot
  honour. Replay is also already somebody else's job: the PRD puts replay
  protection in the mandate and merchant layers (R10, T12), which is where it
  belongs, because a replayed order must be refused before any money moves,
  not deduplicated after.
- **Cost.** A merchant that retries `authorise` after a timeout
  double-authorises, and the stub will cheerfully let it. Until T12 lands,
  nothing in the repo stops that; T11 should pass a real idempotency key, and
  an `idempotency_key` field on `AuthoriseRequest` is the natural place for it
  (a non-breaking addition, by D51).

## D57 · The rail refuses the second capture, not the merchant — PROPOSED (T05)

- **Decision.** `StubRail` remembers each authorisation and its state
  (`authorised` or `captured`) in an in-process `Map`. Capturing an unknown id
  gives `authorisation_not_found`; capturing a settled one gives
  `authorisation_already_captured`, with `origin: 'rail'`. The money is never
  taken twice. `statusOf()` and `size` expose the state for tests and the
  demo.
- **Alternative.** A stub that captures whatever it is asked to, leaving the
  merchant to track which orders it has already settled.
- **Why.** A real rail enforces this — Stripe allows one capture per
  authorisation and answers a repeat with `charge_already_captured` — so a
  stub that did not would let T07b ship a double-capture bug that only
  appeared against Stripe. Holding the state also makes the stub's refusals
  the honest ones a reference reader should see: it refuses only what it
  cannot honour, and never pretends an issuer said no.
- **Cost.** The stub is stateful, so authorisations die with the process and
  are never evicted, exactly as carts are (D11). An authorisation that is
  never captured simply sits there: there is no expiry, where a real card
  authorisation is released after about seven days, and no cancel, because the
  interface has none by the PRD. T10 should say so, since a reader who knows
  payments will look for it.
