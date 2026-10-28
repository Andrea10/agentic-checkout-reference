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
implemented. D21 was accepted by Andrea on 28 Oct.

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

## D21 · D06's cost cites an SDK that D09 replaced — ACCEPTED (Andrea, 28 Oct)

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

## T03 · Mandate types and signing

T03 ran before `docs/DECISIONS.md` existed, so it recorded its five decisions
as P1 to P5 in the description of PR #5. Andrea ruled on all five on 27 Oct.
T06b appends them here, wording unchanged except the numbering.

## D22 · Signing format: Ed25519 over a canonical serialisation of the flat mandate — ACCEPTED (Andrea, 27 Oct)

(Required entry; implements D10.)

- Decision: sign the canonical JSON of the mandate's claims with Ed25519, and
  carry the result in the mandate's own `signature` field.
- Alternative not taken: AP2's SD-JWT, where the mandate is a JWT with
  selective-disclosure salted claim digests.
- Why: the README mandate is a flat object every field of which the merchant
  needs, so there is nothing to selectively disclose; Ed25519 via `node:crypto`
  needs no dependency, and a reader can see the whole signing path in about
  thirty lines.
- Cost: a stated divergence from AP2. We get no selective disclosure, no JWT
  header to negotiate algorithms with, and no interoperability with an AP2
  verifier — if Stage 2 needs one, the signing format changes, not just the
  encoding. T10's `docs/MANDATE.md` owes the mapping.

## D23 · Canonical serialisation: sorted keys, `signature` excluded, compact JSON, UTF-8 — ACCEPTED (Andrea, 27 Oct)

- Decision: strip `signature`, sort the remaining keys by UTF-16 code unit,
  emit JSON with no insignificant whitespace, sign the UTF-8 bytes. Every field
  *present* is signed rather than a fixed allowlist, so a field added in T12
  (a nonce, say) is covered without editing the canonicaliser.
- Alternative not taken: JCS (RFC 8785), or signing the exact bytes as received
  and passing them alongside the parsed object.
- Why: the mandate is flat and holds only strings and integers, which is the
  subset where our rules and JCS agree; signing received bytes would mean every
  surface that touches a mandate has to keep the original octets intact, which
  the MCP tool boundary in T06a would make awkward.
- Cost: this is our own rule, not a cited standard, so a non-TypeScript
  verifier has to reimplement it from the doc comment. It would not survive
  nested objects or floats unchanged — if the mandate stops being flat, revisit
  before extending. Not JCS-conformant by construction, only by coincidence on
  this field set.

## D24 · Encoding: signatures base64url unpadded; public keys DER SPKI, base64url — ACCEPTED (Andrea, 27 Oct)

- Decision: `signature` is the 64 raw bytes as unpadded base64url (86 chars).
  `exportPublicKey`/`importPublicKey` move a public key as base64url DER SPKI
  (59 chars).
- Alternative not taken: hex, or standard base64, for the signature; raw
  32-byte keys, PEM, or a JWK for the key.
- Why: base64url survives JSON, URLs and MCP tool arguments with no escaping.
  SPKI carries the algorithm with the key, so a verifier cannot be handed 32
  bytes and talked into reading them as the wrong curve; `importPublicKey`
  additionally rejects anything that is not Ed25519.
- Cost: SPKI is bulkier and less obvious than raw bytes, and a reader has to
  know what SPKI is. PEM would be more familiar but needs newline handling in
  env vars and JSON.

## D25 · `verify()` returns a result union, not a boolean, and does not throw on a bad mandate — ACCEPTED (Andrea, 27 Oct)

- Decision: `verify` returns `{ ok: true } | { ok: false, reason }` with
  `reason` one of `signature_invalid` or `mandate_malformed`. It throws only on
  a caller error (a key that is not Ed25519). `MandateClaims` is the declared
  unsigned type and `Mandate extends MandateClaims`, rather than
  `Omit<Mandate, 'signature'>`.
- Alternative not taken: return `boolean`; or throw a `MandateError` per
  failure.
- Why: T04 has to append every check, pass or fail, to an audit log and add its
  own refusal reasons, which a boolean cannot carry and exceptions make
  awkward to log uniformly. Declaring the claims type first means the README
  fields appear once, in reading order, with their units.
- Cost: callers must read `.ok` rather than use the value as a condition — a
  truthy object is an easy mistake to make, and `if (verify(m, k))` is always
  true. T04 inherits the obligation to extend the reason union rather than
  invent a parallel error channel.

## D26 · `mandate_malformed` as a distinct reason from `signature_invalid` — ACCEPTED (Andrea, 27 Oct)

- Decision: an object that cannot be reduced to canonical bytes at all (an
  empty signature, a non-finite amount) reports `mandate_malformed`: no
  signature check was possible, as against one that was possible and failed.
- Alternative not taken: one `signature_invalid` reason for everything, or
  throwing.
- Why: the audit log should distinguish a forged mandate from a broken caller;
  they want different responses from the merchant.
- Cost: one more reason for T04 to handle, and a thin line to hold — it is
  structural validation, so it must not drift into the field-level checks that
  belong to T04.

---

## T06b · Merchant quote and ACP shaping

D27 to D39 were accepted by Andrea on 28 Oct. All thirteen come out of reading
four ACP files in full on 2026-10-28, under
`agentic-commerce-protocol/agentic-commerce-protocol/spec/2026-04-17/`:
`openapi/openapi.feed.yaml`, `json-schema/schema.feed.json`,
`openapi/openapi.agentic_checkout.yaml` and
`json-schema/schema.agentic_checkout.json`. Nothing below is a conformance
claim: the merchant speaks MCP, not ACP's HTTP endpoints, and these entries are
the list of places the two part company.

## D27 · ACP spec version 2026-04-17, not `unreleased` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Shape to the `spec/2026-04-17/` directory, the latest stable
  version, and name that version in the code (`ACP_SPEC_VERSION` in
  `merchant/acp.ts`).
- **Alternative.** `spec/unreleased/`, which is where the next version's field
  names appear first; or an older dated directory.
- **Why.** A reference implementation should be readable against something a
  reader can open and check. `unreleased` can change under us between a reader
  cloning the repo and running it, and SOURCES.md records dates read for
  exactly this reason.
- **Cost.** The repo will drift behind ACP. The version is in one constant and
  the mapping is in one file (`merchant/acp.ts`), so the drift is visible and
  cheap to close, but nothing automated tells us it has happened.

## D28 · ACP vocabulary on the wire only; the internal types keep `*_minor` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `merchant/catalogue.ts` and `merchant/cart.ts` keep
  `price_minor`, `unit_price_minor`, `line_total_minor` and `subtotal_minor`.
  The translation to ACP names (`price.amount`, `unit_amount`, `totals`)
  happens in `merchant/acp.ts` and `merchant/quote.ts`, at the wire boundary.
- **Alternative.** Rename the internal types too, so there is one vocabulary
  from the catalogue array to the JSON on stdout.
- **Why.** The `_minor` suffix is load-bearing for a reader: it says, at every
  use, that the number is pence and not pounds (D16), which is the single
  easiest mistake to make in payments code. ACP's `amount` says nothing about
  units at the point of use, only in its schema description. Keeping the
  internal names also means T07's mandate checks — which compare against
  `amount_cap_minor` on the mandate — read in one vocabulary throughout.
- **Cost.** Two names for the same number, and a reader has to hold the mapping
  in their head when moving between `merchant/cart.ts` and `merchant/quote.ts`.
  The mapping functions are the only place a rename can go wrong, which is why
  `test/merchant/acp.test.ts` asserts the whole shaped object field by field.

## D29 · One ACP variant per catalogue product, with the same id — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Each catalogue product becomes an ACP feed `Product` holding
  exactly one `Variant`, and the variant's `id` is the product's `id`.
- **Alternative.** A distinct variant id (`prod_x_default`, say), or giving the
  catalogue real variants with sizes and colours.
- **Why.** ACP's feed requires `variants` and makes the variant, not the
  product, the purchasable thing with a price. Our catalogue has one price per
  product, so the variant is not a dimension of anything — it is a wrapper. The
  same id means an agent that read a product id out of `list_products` can pass
  it straight to `add_to_cart` and `get_quote` without carrying a second
  identifier, which keeps the cart tools (D11) unchanged.
- **Cost.** It hides the distinction ACP is drawing. A real merchant's product
  id and variant id differ, and code written against this repo would have to
  learn that the moment a second size appeared. The variant also repeats the
  product's `title` and `description`, which is redundant on the wire.

## D30 · `stock` leaves the product object; the quote line carries the number — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The ACP product carries only `availability.available` and
  `availability.status`. The integer stock level appears once, on the quote's
  line item, as ACP's `available_quantity`.
- **Alternative.** Keep an integer `stock` field on the shaped product as a
  merchant extension.
- **Why.** The feed schema sets `additionalProperties: false` and has nowhere
  to put a count, so an extra field would make the object something the
  published schema rejects. ACP's checkout `LineItem` *does* define
  `available_quantity`, so the number has a proper home — and the quote is the
  better place for it anyway, because that is the moment the agent is deciding
  whether to commit.
- **Cost.** An agent browsing the catalogue learns only "in stock", "limited"
  or "out of stock", not how many. It cannot size a cart from `list_products`
  alone: it has to add items and read the quote, and may be refused on the way
  (D17 — stock is checked, never reserved). `available_quantity` on the quote is
  a snapshot for the same reason, so T07's `place_order` re-checks.

## D31 · The two ACP files disagree on the low-stock word, and each object keeps its own — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The product's `availability.status` uses the feed schema's
  `limited_stock`. The quote line's `availability_status` uses the checkout
  schema's `low_stock`. The two helpers in `merchant/acp.ts`
  (`feedAvailabilityStatus`, `checkoutAvailabilityStatus`) differ by that one
  token and nothing else.
- **Alternative.** Pick one word and use it in both objects.
- **Why.** This is a real divergence inside ACP 2026-04-17, not a mistake on
  our side: `schema.feed.json` describes `Availability.status` as extensible
  with known values `in_stock, limited_stock, backorder, preorder,
  out_of_stock, discontinued`, while `schema.agentic_checkout.json` defines
  `LineItem.availability_status` as a closed enum of `in_stock, low_stock,
  out_of_stock, backorder, pre_order`. The checkout one is a closed enum, so
  sending `limited_stock` there would be invalid. Note the two also spell
  pre-order differently (`preorder` against `pre_order`).
- **Cost.** Two words for one idea in one codebase, which looks like a bug
  until you read this entry — so `test/merchant/acp.test.ts` has a test whose
  only job is to assert the difference on purpose. If ACP reconciles the two
  files, this entry and one helper go away.

## D32 · The currency code stays upper case — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `GBP`, upper case, everywhere: on the ACP product price and on
  the quote.
- **Alternative.** Lower-case `gbp`, which is what the ACP checkout examples
  show (`currency: usd`).
- **Why.** ISO 4217 codes are upper case, and the feed schema enforces it:
  `Price.currency` carries `pattern: ^[A-Z]{3}$`. The checkout schema sets no
  pattern on `CheckoutSession.currency` and its examples are lower case, so
  only one of the two files constrains us, and it constrains us upwards.
- **Cost.** A quote whose `currency` does not look like ACP's own checkout
  examples. An ACP client that compares currency codes as raw strings against a
  lower-case literal would not match ours.

## D33 · `list_products` returns the ACP `ProductsResponse` exactly: no `count`, no `currency` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The body is `{ "products": [...] }` and nothing else. T06a's
  `count` and top-level `currency` are gone.
- **Alternative.** Keep them as a convenience superset of ACP.
- **Why.** `ProductsResponse` in the feed schema requires `products` and sets
  `additionalProperties: false`, so a superset is a body the published schema
  rejects. Both fields were also redundant: `count` is `products.length`, and
  the currency is on every price. The tool still takes this merchant's own
  `category` and `max_price_minor` filters, which is an addition to the *input*
  and not a divergence — the ACP feed API has no query parameters at all.
- **Cost.** A breaking change to a surface T06a shipped, which is what D15
  warned about. An agent that read `count` gets `undefined`.

## D34 · The cart keeps its own shape; the quote is the ACP checkout object — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `create_cart` and `add_to_cart` return the internal cart
  (`cart_id`, `items`, `subtotal_minor`, `version`). `get_quote` returns an
  object shaped to ACP's `CheckoutSession`.
- **Alternative.** Make the cart itself a `CheckoutSession` with status
  `incomplete`, so there is one object through the whole flow.
- **Why.** ACP has no unpriced cart: the checkout session is created already
  priced, with `totals`, `fulfillment_options` and a readiness `status`. A cart
  shaped as a session would have to answer "what do I owe you?" before anything
  had been quoted, and would carry nine required fields that are empty or
  meaningless until it is. Pricing is also exactly where the interesting
  decisions are (expiry, staleness, what is and is not quoted), so it deserves
  its own object. D11's cart tools were ruled and shipped; this leaves them
  alone.
- **Cost.** Two shapes in one flow, and the mapping from cart line to quote
  line is code that can drift from the cart. A reader coming from ACP will
  look for `/checkout_sessions` and find a cart plus a quote instead. If Stage
  2 ever speaks ACP over HTTP, the cart has nowhere to go.

## D35 · Money in a quote is ACP `Total` entries, with the currency stated once — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Every amount in a quote is a `{ type, display_text, amount }`
  triple in a `totals` array, per line and for the cart. `currency` appears
  once, on the quote. The cart-level array is `items_base_amount`, `subtotal`,
  `total`; the per-line array is `subtotal`, `total`.
- **Alternative.** A flat pair of integers (`subtotal_minor`, `total_minor`) as
  the cart has, or the ACP feed's `Price` object (`{ amount, currency }`) on
  each amount.
- **Why.** It is the checkout schema's own shape, `display_text` and all, and
  it is the shape that survives a merchant that *does* have tax and shipping:
  adding a line is adding an entry, not changing the type. The currency goes
  once because that is where the checkout session puts it, and repeating `GBP`
  on nine amounts invites them to disagree.
- **Cost.** Reading one number is a `find` over an array rather than a property
  access, which is why `totalOf()` exists in `merchant/quote.ts`. Nothing in
  the type system stops the array holding two `subtotal` entries or none. The
  three cart-level totals are all the same number today, which looks like
  padding until you know it is the quote saying there are no adjustments.

## D36 · No `tax` and no `fulfillment` lines at all, rather than zeros — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A quote carries no `tax` total, no `fulfillment` total and an
  empty `fulfillment_options`. `messages` and `links` are empty too, and the
  advertised schema says so with `maxItems: 0`.
- **Alternative.** Emit `tax` and `fulfillment` as zero-amount lines, so the
  shape is complete and an agent can sum a fixed set of keys.
- **Why.** There is no tax and no shipping anywhere in this repo: the
  catalogue has no tax class, no weight and no destination, and the PRD's
  non-goals say so. A zero tax line is a claim — "this purchase attracts no
  tax" — that a synthetic catalogue in one country cannot support. An absent
  line says "not computed", which is true. VAT on these goods would be 20% in
  the UK, so a zero would be wrong rather than merely incomplete.
- **Cost.** `total` equals `subtotal` in every quote this merchant issues,
  which is not what a real checkout looks like, and an agent written against
  this repo could reasonably assume it always will. An agent summing a fixed
  list of total types has to treat absent as zero, or as unknown, and we have
  not told it which. If Stage 2 adds a real rail, tax is the first thing
  missing.

## D37 · A quote is `ready_for_payment`, and an empty cart is refused — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Every quote this merchant issues has ACP status
  `ready_for_payment`. Quoting an empty cart is refused with a new
  `cart_empty` code through the D13 error envelope.
- **Alternative.** Use the status field to carry readiness — return a quote
  with status `not_ready_for_payment`, no line items and a `messages` entry
  explaining why — and never refuse.
- **Why.** The ACP statuses describe a session being filled in over several
  calls: `incomplete` until there is an address, `not_ready_for_payment` until
  there is a payment method. This merchant collects neither, so the only two
  honest answers are "here is your price" and "there is nothing to price".
  Refusing keeps one failure envelope for the agent to learn (D13's stated
  goal), and it keeps the rule that a quote is a priced promise: an object
  called a quote should never be a quote for nothing.
- **Cost.** `status` is a constant, so a reader may wonder why it is there at
  all — it is there because ACP requires it, and because T07 will need the
  `pending_approval` path when the mandate's human-confirm threshold trips. The
  alternative is arguably more ACP-native, since ACP's own design is to answer
  with a session and put the reason in `messages` rather than to fail the call;
  an agent that only reads `status` will not notice an `isError` result. This
  is the entry I would most like overruled if you disagree.

## D38 · A quote expires after fifteen minutes and is tied to one cart version — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A quote carries `created_at`, `expires_at`
  (`QUOTE_TTL_SECONDS` = 900) and `cart_version`, the cart's change counter at
  the moment it was priced. `QuoteStore.current()` refuses `quote_expired` once
  the expiry is reached and `quote_stale` once the cart has moved on. `Cart`
  gains a `version` integer, 1 on creation and +1 per successful change.
- **Alternative.** No expiry and no tie, re-pricing at order time instead; or a
  content hash of the cart lines instead of a counter; or ACP's `quote_id` and
  `quote_expires_at` fields, which exist for a session *based on* a separate
  quote.
- **Why.** These two are the authorisation point of the whole object. Without
  the version tie, an agent can be shown £14.50, have the cart changed under it,
  and place an order for whatever is in there now — the quote would be a
  decoration rather than a commitment. Without an expiry, the merchant owes a
  price forever, which is the thing every real merchant refuses to do. A
  counter rather than a hash because the cart is the only writer, the counter
  is one line, and it makes the refusal message say *which* version went stale.
  `expires_at` rather than `quote_expires_at` because this object *is* the
  quote, not a session referring to one.
- **Cost.** A counter invalidates on any change, including one that leaves the
  price identical — a hash would not, and would also catch a cart mutated by
  something that forgot to bump the counter. Fifteen minutes is our number, not
  a merchant rule or a spec default. The expiry is read off the injected clock,
  so a test or demo that freezes time freezes the expiry with it. `cart_id` and
  `cart_version` are fields ACP does not define, so a strict ACP client would
  reject the quote on `additionalProperties`.

## D39 · Quotes are held server-side and addressed by `quote_id` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A `QuoteStore` holds issued quotes in the server process,
  mirroring `CartStore`: random `quote_<uuid>` ids by default,
  `sequentialQuoteIds()` injectable for tests and the T09 demo. T07's
  `place_order` is expected to take a `quote_id` and call
  `QuoteStore.current()`.
- **Alternative.** Issue the quote and keep nothing: have `place_order` take
  the quote object back from the agent, or re-price the cart from scratch at
  order time.
- **Why.** The merchant has to be able to say "this is the price I quoted", and
  it cannot do that from an object the agent hands back, because the agent is
  the party the mandate exists to bound — a returned quote is an input to be
  distrusted, not a record. MCP is stateless, so the identifier has to be
  explicit in the arguments, which is D11's reasoning applied again. Re-pricing
  at order time would work but would lose the expiry and the staleness
  distinction: the agent would learn the price changed only by being charged a
  different number.
- **Cost.** Quotes die with the process and are never evicted while it lives,
  exactly as carts are (D11), so a long-lived server leaks them and a
  horizontally scaled merchant would need a real store. An expired quote is
  kept deliberately, so that the refusal can name expiry rather than a missing
  id — which means the map only ever grows. T09's demo must keep one server
  alive across the whole run, which D11 already required.

---

## T04 · Mandate policy and audit log

D40 to D49 are T04's. All were accepted by Andrea on 28 Oct.

## D40 · Policy is a separate call; `verify()` keeps its signature-only contract — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Add `checkMandate(policy, request)` alongside T03's `verify()`,
  which is unchanged. `verify()` answers "is this mandate the issuer's, and
  unchanged since"; `checkMandate()` answers "does it authorise *this*
  purchase", and calls `verify()` as its second gate.
- **Alternative.** Widen `verify()` to take the agent, merchant, amount,
  currency and a clock, and return one combined result.
- **Why.** They are two questions with different trust levels: the first says
  whether the claims can be believed at all, the second reads those claims.
  Widening `verify()` would also change T03's public API, which this task may
  not do without a ruling, and T12's replay suite still wants the narrow
  function on its own.
- **Cost.** A caller has to hold two concepts, and could call `verify()` alone
  and believe it had checked something. The doc comment on each says which is
  which; the merchant's `place_order` (T07a) is the only caller that matters
  and it uses `checkMandate()`.

## D41 · Three outcomes, not a boolean — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `PolicyDecision` is a union discriminated on `outcome`:
  `allow`, `confirm_required`, `refuse`.
- **Alternative.** Keeping T03's `{ ok }` shape and treating "needs a human"
  as one more refusal reason.
- **Why.** Above `human_confirm_above_minor` nothing is wrong: the mandate
  covers the purchase and the user asked to be consulted at that size. Calling
  that a refusal would make every caller special-case one reason code out of
  twelve, and T07a has to turn it into `awaiting_confirmation` rather than an
  error.
- **Cost.** Two result shapes in one package — T03's `VerifyResult` keeps
  `ok`, the policy returns `outcome` — and every `switch` has three arms to
  answer for, which is the point but is still more code than a boolean.

## D42 · Two gates, then every remaining check reported at once — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The amount's shape and the signature are gates: if either
  fails the pass stops, and both are reported if both failed. Past them, all
  seven scope and limit checks run and every failure is named in the refusal,
  in check order.
- **Alternative.** Fail fast on the first failed check, as PRD R2's wording
  ("checks, in order") can be read to mean.
- **Why.** An agent developer with a misconfigured mandate learns everything
  wrong with it in one call instead of one round trip per problem. But a scope
  failure read off claims whose signature did not hold would be reporting
  untrusted data as fact, and an amount that is not a number cannot be
  compared to a cap at all — hence the two gates.
- **Cost.** A refusal carries a list, so callers handle more than one reason
  and the order of that list is part of the contract (the tests pin it). An
  accumulated refusal is also a more generous oracle for someone probing a
  mandate than a fail-fast one would be; only a correctly signed mandate gets
  the full list, which bounds who can probe.

## D43 · Currency is checked before the caps, not after as PRD R2 lists them — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The order is agent, merchant, window, currency, the mandate's
  own limits, per-transaction cap, remaining budget. A currency mismatch or an
  unusable limit suppresses the amount comparisons that depend on it.
- **Alternative.** PRD R2's order exactly: per-transaction cap and remaining
  budget first, currency after.
- **Why.** A cap denominated in GBP says nothing about an amount in USD.
  Comparing them anyway would either refuse with a reason that is not the real
  one ("over cap" when the real answer is "wrong currency") or, worse, allow a
  purchase because 2500 of one currency is under a cap of 5000 of another.
- **Cost.** PRD R2's list no longer matches the code. T10 is required to check
  the PRD against the final decisions, and should correct the order there.

## D44 · Remaining budget lives in an injected `SpendLedger`, in memory for Stage 1 — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A `SpendLedger` interface with `spent()` and `record()`, keyed
  by `mandate_id`, injected into the policy. Stage 1's implementation,
  `createMemoryLedger()`, is a `Map` in the server process.
- **Alternative.** A running total carried on the mandate itself (impossible:
  it is signed, so it cannot change); passing "spent so far" in as a request
  argument and making the caller remember it; persisting to disk or SQLite now.
- **Why.** Remaining budget is a fact about history, not a property of a
  signed object, so it cannot live on the mandate. `mandate_id` is the one
  identifier the issuer and the merchant both already hold. An interface means
  Stage 2 replaces the storage without touching the policy.
- **Cost.** Memory only, and the same cost as D11's cart store: a restarted
  merchant honours the full cap again, and two merchant processes under one
  mandate would each allow the whole cap. Nothing is evicted, so the map grows
  with every mandate the process sees. A real deployment needs a durable,
  transactional ledger.

## D45 · Recording a spend is a separate call, made after the rail succeeds — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `recordSpend(policy, spend)` is the only thing that consumes
  budget; `checkMandate()` never writes to the ledger. A `PolicyDecision` is
  structurally a `SpendRecord`, so the usual call is
  `recordSpend(policy, decision)`.
- **Alternative.** Check-and-reserve in one call, with a release path for
  payments that then fail.
- **Why.** Budget consumed by a payment that failed is budget the user never
  gets back. The order of operations a reference implementation should show is
  check, authorise, then record.
- **Cost.** Between the check and the record, nothing holds the budget: two
  concurrent orders under one mandate can both pass a check and both be
  recorded, together exceeding the cap. Stage 1 is single-threaded and T09's
  demo is sequential, so it cannot happen here, but it is a real gap and is
  named rather than hidden. Closing it needs either a reservation with an
  expiry and a sweeper, or a ledger that checks and records in one
  transaction — the same machinery D17 declined for stock, and adjacent to
  T12's replay protection.

## D46 · `print()` takes its stream, and the lines are text, not JSON — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `AuditLog.print(stream)` has no default stream. `OutputStream`
  is the smallest useful shape, `{ write(chunk: string): unknown }`, so a test
  can pass a collector and the demo can pass `process.stderr`. Each entry
  prints as one human-readable line.
- **Alternative.** Defaulting the stream to `process.stdout` or
  `process.stderr`; emitting JSON Lines; or sending entries through MCP's own
  Logging utility.
- **Why.** The merchant speaks MCP over stdio, where stdout carries protocol
  messages and one stray line corrupts the conversation, so the safe default
  is no default. MCP's Logging utility is deprecated in revision 2026-07-28
  (SEP-2577), and the migration path that revision states is "Log to `stderr`
  for stdio transports; use OpenTelemetry for observability" — read at
  `/specification/2026-07-28/deprecated` on 2026-10-28, which is also where
  the Logging row lives. SOURCES.md's note on SEP-2577 names Sampling and
  Roots only; the registry lists Logging under the same SEP. The log's one
  human reader is the demo, and a person scanning for a refusal reads columns
  faster than JSON.
- **Cost.** The printed form is not machine-parseable; anything that wants to
  post-process reads `entries()` instead, or a JSON-Lines writer is added
  later. The column layout is pinned by a test, so widening a column is a test
  change. A test also asserts that no file in `mandate/` so much as mentions
  `process.stdout`, which is a crude guard but the one that matches the risk.

## D47 · A mandate whose own limits or window are unusable is refused, not thrown — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `mandate_limits_invalid` and `mandate_window_invalid` are
  reason codes like any other, so an unusable mandate is refused and logged.
- **Alternative.** Throwing, on the grounds that a signed mandate with a
  fractional cap is a bug at the issuer, not a policy outcome.
- **Why.** The mandate arrives over the wire from outside the merchant. A
  merchant should refuse what it cannot evaluate and write that down, not
  crash a tool call; and the refusal then reaches the audit log through the
  one path every other decision takes.
- **Cost.** A class of issuer bug surfaces as a refused order rather than
  loudly at the issuer. The refusal message says which kind of field is
  unusable, which is as much as can be said without quoting the mandate back.

## D48 · The audit log records checks, not settlements — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The only way into the log is `record(decision)`. What was
  actually spent lives in the ledger.
- **Alternative.** Logging `recordSpend` too, so the log reads as a statement
  of account rather than a record of decisions.
- **Why.** One entrance means a check cannot go unlogged, which is the
  property worth having (`checkMandate()` records before it returns, so a
  caller cannot forget). A settlement is a different kind of event and would
  need an event type on every entry.
- **Cost.** The log shows that a purchase was allowed, not that it was paid,
  so an auditor needs the log and the ledger together. T07b owns the rail call
  and is the natural place to add a settlement entry; doing so means adding a
  kind to `AuditEntry` and widening the one entrance.

## D49 · `mandate/` declares its own clock — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `mandate/clock.ts` exports `Clock`, `systemClock` and
  `fixedClock`, duplicating the `Clock` type and `systemClock` that
  `merchant/cart.ts` already has.
- **Alternative.** Importing the merchant's `Clock`, or hoisting a shared one
  into a new top-level directory.
- **Why.** The mandate layer is the part of this repo a reader might lift on
  its own, and it should not depend on the merchant to know the time. A new
  shared directory is also outside the directories T04 may touch.
- **Cost.** Two identical declarations that can drift. T07a imports both
  packages, so it has to alias one of the two `systemClock`s. T10 consolidates
  the docs and could hoist the type then.

## D58 · The amount must be positive, not merely non-negative — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The request-amount gate in `checkMandate()` requires a whole
  number of minor units **above zero**. An amount of 0 is refused, with the
  existing `amount_not_integer_minor_units` code and a message that now reads
  "above zero". `isPositiveMinorUnits()` is the new check; the non-negative
  form stays for the mandate's own caps and for a recorded spend.
- **Alternative.** Allow 0, as D42 and the original gate first read it: zero
  is a non-negative integer, it breaks no cap, and the checks below it are all
  well defined.
- **Why.** A zero-value purchase has no meaning — there is nothing to
  authorise, so there is nothing for a mandate to authorise it against — and
  T05's `StubRail` already refuses one (`amount_invalid`, "a whole number of
  minor units above zero"). With the mandate layer allowing what the rail
  would then reject, an order could pass every policy check and still die at
  the rail, which is the one outcome a reference implementation should not
  demonstrate. The two packages now agree on what counts as money.
- **Cost.** Two money predicates where there was one, and the difference
  between them is exactly the value zero, which is the kind of distinction a
  reader skims past. The reason why is written at both call sites and pinned
  by a test that asserts the two forms differ on zero and only on zero. The
  reason code still says `integer` rather than `positive`; renaming it would
  change the refusal vocabulary T07a is about to build on, so the wording
  moved and the code did not. T10 may want to rename it while consolidating.

## D59 · The amount refusal is named `amount_invalid` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Rename the reason code `amount_not_integer_minor_units` to
  `amount_invalid`, the name T05's `StubRail` already uses for the same case.
  One name now covers both things the gate refuses: an amount that is not a
  whole number of minor units, and an amount of zero. Nothing else changes —
  same check, same message, same position in the union.
- **Alternative.** Keep `amount_not_integer_minor_units` and rename in T10, as
  D58's cost first proposed, on the grounds that renaming a refusal code
  changes vocabulary other tasks are about to read.
- **Why.** Zero *is* an integer, so after D58 the old name no longer described
  what the check does: it refused things the name said were fine. `StubRail`
  already declines the same case as `amount_invalid`, and T07a is about to
  build its tool-level refusals on this vocabulary — so the moment to settle
  on one word is before that happens, not after, when the old name would be
  in the merchant's error envelope as well.
- **Cost.** The ruled entries above still carry the old name. D58 names
  `amount_not_integer_minor_units` in its Decision, and its Cost then argues
  for exactly the rename this entry records, so it reads as a loose end that
  is only tied off here. D40 to D49 describe the gate in prose rather than by
  code, so none of them needs a correction. Those entries are ruled and are
  not edited, which means a reader going through the file in order meets the
  old name once before reaching this entry. T10 consolidates this file and
  should fold D42, D58 and D59 together, at which point the old name leaves
  the repository entirely.

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

## D50 · A decline is a result; only a broken rail throws — ACCEPTED (Andrea, 28 Oct)

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

## D51 · One request object per call, and no knowledge of the mandate — ACCEPTED (Andrea, 28 Oct)

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

## D52 · `capture` takes the authorisation id and takes the lot — ACCEPTED (Andrea, 28 Oct)

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

## D53 · A decline carries a code, a message and an origin — ACCEPTED (Andrea, 28 Oct)

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

## D54 · The stub logs through an injected sink, and is silent by default — ACCEPTED (Andrea, 28 Oct)

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

## D55 · The stub is deterministic by construction — ACCEPTED (Andrea, 28 Oct)

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

## D56 · `order_ref` is a reference, not an idempotency key — ACCEPTED (Andrea, 28 Oct)

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

## D57 · The rail refuses the second capture, not the merchant — ACCEPTED (Andrea, 28 Oct)

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

---

## T07a · Merchant place_order with mandate

D60 to D69 are T07a's. All were accepted by Andrea on 28 Oct (D64 and D65 as recommended: see each entry).

The contract `place_order` is built to — input `{ quote_id, agent, mandate }`,
the merchant's own id as configuration, the amount and currency read from the
quote, `awaiting_confirmation` plus a `confirmation_token` above the
human-confirm threshold, and a structured error carrying every policy reason —
was fixed in the task brief, because T08's buyer agent is being written against
it in parallel. The decisions below are the choices that brief left open.

## D60 · The merchant's own id and its trusted issuer are configuration, read from the environment — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `merchant/config.ts` reads two variables: `ACR_MERCHANT_ID`
  (default `merchant-demo`) and `ACR_MANDATE_PUBLIC_KEY`, the issuer's Ed25519
  public key in the form `exportPublicKey()` writes (DER SPKI, base64url,
  unpadded — D24). `MerchantState` carries both as `merchant_id` and `policy`,
  and `merchant/stdio.ts` reads the environment once at startup. A key that
  cannot be read throws there and then. A merchant started with no key still
  serves its catalogue, carts and quotes, and refuses `place_order` with the
  new code `merchant_misconfigured`. `createMerchantState()` now takes an
  options object instead of three positional arguments, because T07a added a
  third store and two pieces of configuration.
- **Alternative.** Take the merchant id, or the public key, as arguments to
  `place_order` — which is what every other identifier in this merchant does
  (`cart_id`, `quote_id`) and would have needed no new file. Or put the key in
  a file the merchant reads, or generate a key pair at startup and have the
  issuer ask the merchant for it.
- **Why.** Both facts have to be outside the caller's reach or the checks that
  use them are theatre. If the agent supplied the merchant id,
  `merchant_mismatch` could never fire: the agent would echo whatever its
  mandate says. If it supplied the public key, `signature_invalid` could never
  fire: it would sign a mandate itself and hand over the matching key. The
  environment rather than a file because T09's demo issues the mandate, exports
  the public key and spawns the server in one process, and because a public key
  is not a secret — nothing secret is read here and no key is ever logged.
  Serving the catalogue without a key, rather than refusing to start, keeps
  T08 able to browse a merchant it cannot buy from.
- **Cost.** The merchant's identity now lives in two places — a default in the
  code and a variable in the environment — and a demo that forgets the variable
  gets a merchant that looks healthy until the order is placed. There is one
  trusted issuer, not a list and no key rotation, so a second issuer means a
  second server. The policy is built per server instance, which means a spend
  ledger and an audit log per stdio connection: D44's cost, one level finer.
  And `createMerchantState`'s signature changed, so anything written against
  the positional form (one test) had to move.

## D61 · The agent id is a caller-supplied argument, and is not authenticated — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `place_order` takes `agent` as a string argument and passes it
  to `checkMandate()` as the agent making the purchase. The merchant does
  nothing to establish that the caller is that agent.
- **Alternative.** Derive the agent from the transport — MCP's authorisation
  framework, an mTLS client certificate, an API key per agent — and refuse any
  `agent` argument at all. Or drop the argument and read the agent off the
  mandate, treating the mandate as proof of who is calling.
- **Why.** The argument is in the contract T08 is being built against, and
  Stage 1 has no notion of an authenticated caller: a stdio server's client is
  whoever spawned the process. Reading the agent off the mandate instead would
  be worse than useless — `agent_mismatch` could then never fire, because the
  mandate would be compared with itself. Taking it as an argument at least
  keeps the comparison honest and makes the gap visible in the tool's schema.
- **Cost.** **This is the weakest link in the authorisation story.** Any caller
  that holds a mandate can present itself as the agent that mandate names, so
  `agent_mismatch` catches an honest misconfiguration and nothing else: it is
  not a defence against a stolen mandate. The mandate's signature binds the
  agent's *name*, but nothing binds the caller to that name — there is no
  agent key, no challenge, no proof of possession. A real deployment needs the
  agent to authenticate and the merchant to derive the id from that
  authentication, at which point the argument disappears. It is said out loud
  here and in the tool's own schema, where the `agent` argument's description
  names the gap, rather than left for a reader to notice; T10 should carry it
  into `docs/ARCHITECTURE.md` as a stated limitation of Stage 1.

## D62 · The approved status word is `approved`, and the success body is two fields — ACCEPTED (Andrea, 28 Oct)

- **Decision.** An order the mandate covers comes back as
  `{ status: 'approved', order_id }`, and one above the threshold as
  `{ status: 'awaiting_confirmation', order_id, confirmation_token }`. Nothing
  else is on the wire. The advertised `outputSchema` is one object with
  `status`, `order_id` and an optional `confirmation_token`, not a union.
- **Alternative.** `authorised`, which is what a payments reader might expect;
  `pending_payment`; or ACP's checkout statuses, which include
  `pending_approval` for the held case and `complete_in_progress` for the
  approved one (D37's cost anticipated using `pending_approval` here). For the
  body: return the whole order, with the amount, the currency and the lines.
- **Why.** `authorised` is the one word this status must not use: authorisation
  is what the rail does to money, and the rail has not been called — T07b calls
  it. `approved` says what happened (the merchant and the mandate agreed) and
  not what has not. ACP's statuses were rejected because they describe a
  *checkout session* being filled in, not an order, and because the contract
  fixes `awaiting_confirmation`, which is not an ACP token: one ACP word beside
  one of ours would read as conformance where there is none. The body stays at
  two fields because the agent already has the price from the quote, and a
  second copy of it in the order response is a second place for the two to
  disagree. One object rather than a union because `outputSchema` is advertised
  as JSON Schema and has to describe an object; the union lives on the stored
  `Order` type, where the compiler can keep a token off an approved order.
- **Cost.** `approved` is our word, not a standard's, so the demo and the docs
  have to explain the three-state life of an order (approved, then paid, or
  held then paid) that no specification names. An agent that has lost the quote
  cannot read the amount back off the order: there is no `get_order` tool, and
  T07b will want one. And a client that validates `confirmation_token` as
  required on the awaiting path has to read `status` first, because the
  advertised schema only says the field is optional.

## D63 · Orders are held server-side, and the confirmation token is not the order id — ACCEPTED (Andrea, 28 Oct)

- **Decision.** An `OrderStore` holds orders in the server process, mirroring
  `CartStore` and `QuoteStore`: random `order_<uuid>` ids by default,
  `sequentialOrderIds()` injectable for tests and the T09 demo. The
  confirmation token is a separate value from a separate injectable factory,
  `confirm_<uuid>` by default, kept server-side and indexed so T07b can find
  the held order by token. Orders are frozen on the way in.
- **Alternative.** Use the order id as the confirmation token, since both are
  unguessable UUIDs and the order is the thing being confirmed. Or hold no
  order at all for the approved case and only remember the held ones.
- **Why.** The two values do different jobs: an order id is a *name*, which
  will appear in logs, in the demo transcript and in the rail's `order_ref`
  (D56), while the confirmation token is a *capability* — whoever holds it can
  complete the purchase. Giving one value both jobs means anything that learns
  the name can exercise the capability, which is the mistake a reference
  implementation should not teach. Recording approved orders as well as held
  ones is what makes a quote single use (D64) and gives T07b something to turn
  into a payment.
- **Cost.** A third in-memory store with the same costs as the first two:
  orders die with the process, nothing is evicted, and a horizontally scaled
  merchant would need a real one. Two id factories to inject instead of one, so
  a deterministic demo transcript now takes four. The token has no expiry — a
  held order waits for a human forever — and there is no way to cancel one;
  T07b or T12 should give it a lifetime.

## D64 · A quote is single use; the cart is left alone — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The order store indexes orders by `quote_id`, and
  `place_order` refuses a second order against a quote that already has one —
  including one still awaiting confirmation — with the new code
  `quote_already_ordered`. A refused order creates nothing, so a quote whose
  order was refused can be used again once the mandate is fixed. The cart is
  not changed at all: not emptied, not closed, and no stock is decremented
  (D17).
- **Alternative.** Let a quote be ordered repeatedly, and rely on the mandate's
  caps to bound the damage. Or close the cart when an order is placed, so that
  the cart, not the quote, is the thing that is used up. Or delete the quote on
  use, so a second attempt reads `quote_not_found`.
- **Why.** A quote is a priced promise for one purchase, and the double-submit
  is the oldest failure in checkout: without this, an agent that retried a
  timed-out call would buy twice. Held orders have to count too, or an agent
  could collect confirmation tokens for one quote until a human said yes to one
  of them. Keeping the quote and naming it in the refusal, rather than deleting
  it, follows D39's reasoning: the refusal should say what happened, not that
  the id is unknown. The cart is left alone because re-quoting a cart is
  legitimate — a person may well buy two of the same thing — and because
  closing carts is machinery D17 already declined to build for stock.
- **Cost.** The guard is per quote and not per cart, so an agent can re-quote
  the same cart and order it again: only the mandate's caps and budget stand
  between it and buying the same basket twice. That is deliberate, but it means
  "single use" is a narrower promise than it sounds, and **this is the entry I
  would most like overruled if you read it the other way.** A quote whose held
  order is abandoned is also stuck forever — there is no release path — so the
  agent must change the cart and re-quote. And an order refused by the policy
  leaves the quote free, which is right for a mistyped mandate and is also a
  small retry oracle.

## D65 · The mandate check is the last gate, so refusals before it leave no audit entry — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `place_order` runs its checks in this order: the merchant is
  configured, the quote is current (D38), the quote is unused (D64), the stock
  is still there (D17), and only then `checkMandate()`. Anything refused before
  the last step is refused without a policy check and therefore without an
  audit entry. The task's definition of done asks for "one entry per
  `place_order` call"; what is implemented is one entry per call that reaches
  the mandate check, and the tests assert both halves — three calls that reach
  it leave three entries, a call refused for an unknown quote or missing stock
  leaves none.
- **Alternative.** Check the mandate first, so that every `place_order` call
  appears in the audit log whatever else is wrong with it. Or log the
  non-policy refusals to the audit log too, widening `AuditEntry` with a kind.
- **Why.** The audit log answers "why was this purchase allowed, or refused,
  and by which rule?" (`mandate/audit.ts`). An `allow` entry written for an
  order that was then refused for want of stock would be a lie told to the one
  reader who matters: it records a purchase the merchant allowed and did not
  make. Checking the mandate last also keeps the money question behind the
  cheap questions, and means a sold-out catalogue line does not become an
  opportunity to probe a mandate.
- **Cost.** An order refused for a stale quote or missing stock leaves no trace
  anywhere: the merchant has no request log of its own, so those attempts are
  invisible after the call returns. D48 already decided the log records checks
  rather than settlements, and this is the same boundary seen from the other
  side. If Andrea wants the literal reading of the DoD — every call logged —
  the fix is D48's widening, an entry kind on `AuditEntry`, and it should be
  T07b's or T10's, not a second log here.

## D66 · The refusal envelope carries the policy reasons, in a list, under the existing shape — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `MandateRefusedError extends MerchantError` with code
  `mandate_refused`, and `toErrorBody()` adds a `reasons` array to D13's body:
  `{"error":{"code":"mandate_refused","message":"…","reasons":[{"reason","message"},…]}}`.
  The reasons are the mandate layer's own `PolicyRefusal` objects, passed
  through unchanged and in check order. The message names every reason code, so
  a person reading a transcript sees the whole answer in one line. Everything
  else about D13 is unchanged: `isError: true`, one text block, no
  `structuredContent`.
- **Alternative.** A list of reason codes only, without the messages. Or one
  merchant error code per policy reason — `mandate_expired`,
  `budget_exceeded` and nine more in `MerchantErrorCode` — which would have
  needed no new field. Or a second error envelope for mandate refusals.
- **Why.** D42 decided that every failed check is reported at once; an envelope
  that carried only the first would throw that away at the last step, and one
  code per reason cannot express two failures in one answer at all. The
  messages travel with the codes because the policy writes them for exactly
  this reader and they carry the specifics a code cannot ("1450 is more than
  the 1000 GBP left of this mandate's total cap of 1000"). Keeping D13's shape
  means an agent still learns one failure envelope, as D13 intended.
- **Cost.** `MerchantErrorBody` now has a field that is present on one code
  only, so a client that reads `reasons` unconditionally gets `undefined`
  everywhere else. The merchant's vocabulary and the mandate's are now mixed in
  one body — `mandate_refused` is the merchant's word, `budget_exceeded` the
  mandate's — and a reader has to know that the inner list comes from another
  package. A refusal also now quotes the mandate's own limits back to the
  caller in those messages, which D42's cost already accepted for a correctly
  signed mandate.

## D67 · The mandate's wire schema describes shape, not validity — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `merchant/mandate-wire.ts` describes the mandate argument with
  zod as strings and plain `number`s: no `int()`, no datetime format, no
  minimum. It is a `looseObject`, so unknown fields are passed through rather
  than stripped. Validity is the policy's business, and only the policy's.
- **Alternative.** Describe the mandate properly: `z.int()` on the money
  fields, ISO-8601 validation on the window, `z.strictObject` to reject
  anything unexpected. The SDK would then refuse a malformed mandate before the
  handler ever ran.
- **Why.** Two things would break. First, the refusals would move: a fractional
  cap or an unreadable window would come back as an SDK protocol error — no
  reason code, no audit entry, and the merchant's own policy never consulted —
  and `mandate_limits_invalid` and `mandate_window_invalid` would become
  unreachable through the server, which is most of what D47 exists to do.
  Second, zod's `object` strips unknown keys, and T03 signs *every field
  present*: a field added to a mandate after it was signed has to reach
  `verify()` to break the signature, and a schema that quietly removed it first
  would hand the policy a mandate that verifies. T12's tampering suite depends
  on this; a test here already pins it.
- **Cost.** The advertised JSON Schema is looser than the mandate's real rules,
  so a client that reads the schema alone learns less than it could, and a
  mandate with a string where a number belongs is refused by zod with a
  protocol error rather than by the policy. The policy's reason codes are the
  real contract, which means the tool's description has to point at them. And
  `additionalProperties` is open on the mandate object, so a client generator
  will produce a permissive type.

## D68 · `amount_invalid` is unreachable through `place_order`, and is left unreached — ACCEPTED (Andrea, 28 Oct)

- **Decision.** No test fakes an invalid amount through the server. A comment
  in `test/merchant/place-order.test.ts` states why the reason cannot be
  reached, and a test pins the invariant that makes the statement true: every
  quote this merchant issues totals a positive safe integer.
- **Alternative.** Reach it by force — a quote object written straight into the
  store with a total of zero or 14.5, or a stubbed `totalOf` — so that the
  refusal matrix is visibly complete. Or add a defensive check in
  `place_order` that refuses a non-positive total before the policy sees it.
- **Why.** The amount comes from the stored quote, never from the caller (the
  contract, and D39's reasoning), and a quote is only ever issued for a cart
  with at least one line (D37), where every line has a whole quantity of at
  least one (D19) at an integer unit price (D16). So the total is always a
  positive integer. A test that reached the refusal by building an impossible
  quote would assert that the policy works — which `test/mandate/policy.test.ts`
  already does, where the amount can be anything — while implying the merchant
  has a path it does not have. A defensive check would be dead code with a dead
  test attached.
- **Cost.** The refusal matrix for `place_order` has a hole in it, and a reader
  counting reason codes will find eleven tested out of twelve; the comment is
  the only thing that explains the twelfth. If a later task introduces a
  zero-priced line, a discount that cancels a cart out, or a quote built from
  something other than a cart, the invariant goes and nothing in `place_order`
  would catch it — only the invariant test, which is why it exists.

## D69 · The audit log is reachable from the server state, and from no tool — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The policy lives on `MerchantState`, so `state.policy?.audit`
  is reachable by anything holding the state — T09's demo prints it with
  `print(process.stderr)` (D46). No MCP tool exposes it, and nothing in the
  merchant writes it anywhere.
- **Alternative.** A `get_audit_log` tool, so an agent could read back why it
  was refused. Or keep the log out of the state entirely and have the demo hold
  its own `AuditLog` and pass it into the policy it builds.
- **Why.** The demo has to print the log — it is most of what the demo is for —
  and threading a second handle through when the policy already carries one is
  ceremony. A tool is a different matter: the log holds every decision the
  server has made, including other mandates' and other agents', and D42's cost
  already notes that an accumulated refusal is a generous oracle for someone
  probing a mandate. A readable log would be a better one, and the party asking
  is the party the mandate exists to bound.
- **Cost.** Anything in the server process can read every decision, so the
  isolation is process-level and nothing finer; a multi-tenant merchant would
  need a log per principal and a reader that filters. An agent cannot read back
  why it was refused except from the refusal it was given, which is deliberate
  but means the refusal body has to be good enough on its own (D66). And the
  log is reached through an optional field, so a caller writes `policy?.audit`
  and has to consider the unconfigured merchant (D60).

D70 to D79 are T08's, the buyer agent. All were accepted by Andrea on 28 Oct.

## D70 · The planner decides, the runner calls, and neither can do the other's job — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `agent/` has two halves with one interface between them.
  `Planner.next(memory): PlanStep` is synchronous, pure, and returns a
  *description* of a tool call. `runPlan()` in `agent/run.ts` owns the loop,
  makes every call, and folds each answer back into the memory. A `Planner` is
  handed no connection, no client and no credentials, so it cannot call a tool
  even by accident; the runner is handed no shopping logic, so it cannot
  decide what to buy.
- **Alternative.** One object with the connection on it, deciding and calling
  in the same method — the shape most agent examples use, and the shape
  `runPlan` would collapse into if `next()` were allowed to be `async`.
- **Why.** The interesting questions about an agentic checkout are decisions:
  which product, how many, when to re-price, when to stop, and whether to
  confirm its own order. With this seam those questions are answered by
  calling a pure function with a literal — `test/agent/planner.test.ts` has
  twenty-one such tests and starts no server, opens no transport and holds no
  mandate. The reverse also holds: `test/agent/flow.test.ts` drives the runner
  with a three-line planner to check the plumbing with no shopping logic in
  the way. A reader who wants to see how the agent thinks reads one file,
  `agent/scripted.ts`, which contains no `await` at all.
- **Cost.** Two files and an interface where one class would do, and a step
  type that has to be kept in step with the merchant's tool list by hand: add
  a tool and both `PlanStep` and the runner's `switch` change. The memory also
  has to carry everything a planner might want, so a planner that wanted to
  see, say, the audit log would need `PlanMemory` widened rather than just
  reaching for it.

## D71 · A plan is a state machine over what came back, not a list of steps to replay — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `next()` takes the accumulated {@link PlanMemory} — products,
  cart, quote — not a step index. `ScriptedPlanner` answers the first question
  still open, so the order of the steps is fixed but each step is recomputed
  from what the merchant actually said.
- **Alternative.** A literal script: an array of six steps, replayed in order,
  with the runner walking the index.
- **Why.** Two things in this design make a tape wrong. A quote is good only
  for the cart version it priced (D38), so a cart that moved under the agent
  needs a fresh `get_quote` rather than an order against a stale price — the
  merchant would refuse that order (`quote_stale`), and noticing first is the
  difference between an agent that recovers and one that reports a failure.
  And `add_to_cart` merges lines (D11), so what is in the cart after two adds
  is not always what the agent asked for; comparing against the returned cart
  catches a partly filled line, which counting its own adds would not.
- **Cost.** The planner carries state logic, so its tests have to construct
  memories rather than assert on a list, and a planner bug can loop. D73's
  step budget is the answer to the second half of that.

## D72 · The agent id and the mandate travel together, injected, and one step reads them — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `AgentIdentity { agent, mandate }` is handed to `runPlan()` by
  whoever starts the agent. Nothing in `agent/` reads either from the
  environment, from a file, or from a module-level variable, and the only code
  that touches them is `agent/order.ts`. The agent id goes on the wire as its
  own `place_order` argument as well as being inside the mandate's `agent`
  claim.
- **Alternative.** A module-level configured agent, or a `BuyerAgent` class
  holding the mandate as a field available to every method.
- **Why.** Three reasons, in order of weight. A mandate is a credential, and
  code that can reach a credential from anywhere can leak it from anywhere;
  here it is in scope in one file. The demo (T09) has to run the same agent
  twice under two different mandates to show the human-confirm path, which is
  a parameter, not a reconfiguration. And the duplication of the agent id is
  deliberate: the mandate says who the authority was *granted to*, the
  argument says who is *using it*, and the merchant's policy check compares
  them — that comparison (`agent_mismatch`) is the check that stops one agent
  presenting another's mandate, so an agent that filled the argument in from
  the mandate it is holding would be answering the question for the verifier.
  `test/agent/order.test.ts` asserts the two can differ.
- **Cost.** Every caller has to build an identity, including the tests, and
  there is no ambient default to fall back on. A caller that passes a mandate
  for a different agent gets a refusal from the merchant rather than a local
  error — which is correct, but it is a round trip to find out.

## D73 · A refusal is a returned value; a broken connection still throws — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A tool answering `isError: true` becomes a `MerchantRefusal`
  on the outcome: `callTool` returns `{ ok: false, refusal }`, and `runPlan`
  stops at the first refusal and returns `{ kind: 'refused', step, refusal }`
  naming the step that earned it. A broken connection, a tool the server does
  not have, and a body the agent cannot parse all still throw.
  `RunOptions.maxSteps` (default 24) bounds the loop and reports an overrun as
  a `stopped` outcome with its reason.
- **Alternative.** Throwing a typed `MerchantRefusalError`, which is what a
  `try`/`catch` reader expects of a failed call.
- **Why.** A refusal is not a failure. The connection worked, the request was
  understood, and the mandate layer did the job this repository exists to
  show — so it belongs in the return type, where the compiler makes the caller
  handle it, rather than in an exception a caller can forget. The split is the
  useful part: `refused` means the merchant decided something about this
  purchase, and a throw means nobody decided anything. The step budget is
  there because a planner is ordinary code that can have a bug, and an agent
  with a mandate and an unbounded loop is an agent that spends until the cap
  stops it.
- **Cost.** Callers switch on `outcome.kind` rather than wrapping in `try`.
  The two categories are also not perfectly clean: the SDK answers an
  input-schema violation with `isError: true`, so an agent bug arrives as a
  refusal rather than a throw. D78 names it `tool_error` so it at least does
  not masquerade as a merchant refusal code.

## D74 · On `awaiting_confirmation` the agent stops and hands back the token — ACCEPTED (Andrea, 28 Oct)

- **Decision.** When `place_order` answers
  `{ status: 'awaiting_confirmation', confirmation_token, order_id }`, the run
  ends with `{ kind: 'awaiting_confirmation', held }`. The agent does not call
  `confirm_order`, does not retry under a different quote, and does not
  re-quote a smaller cart to get under the threshold. The token is returned to
  whoever started the agent, and the decision is theirs.
- **Alternative.** Hold the token and expose `confirm()` on the agent, or take
  a callback the host supplies for the human's answer.
- **Why.** `human_confirm_above_minor` exists so that a person says yes above
  a figure the person chose. An agent that confirms its own order has removed
  the control it was built to respect, and an agent that *can* confirm is one
  mis-wired host away from doing so — so the capability is absent rather than
  guarded. Retrying smaller would be worse: it is the agent deciding that the
  user's threshold was really a suggestion.
- **Cost.** The caller has to carry the token to `confirm_order` itself, and
  the agent cannot complete a purchase in one call when the amount is above
  the threshold — which is the behaviour, not a limitation. T09 holds the
  token between the two halves of the demo.

## D75 · The client negotiates the newest revision both ends know: 2026-07-28, verified — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The agent constructs its client with
  `versionNegotiation: { mode: 'auto' }`, which probes with `server/discover`
  before the handshake and falls back to the 2025-era `initialize` when the
  server does not answer it. Nothing is pinned. The connection records what it
  got — `MerchantConnection.protocolVersion` and `.protocolEra` — so a caller
  reads the answer rather than assuming it.
- **Alternative.** The SDK's default, `mode: 'legacy'`, which runs the 2025
  handshake and never probes; or `{ pin: '2026-07-28' }`, which demands the
  modern era and fails the connection without it.
- **Why.** The repository claims to implement MCP revision 2026-07-28 (D09),
  and until this task nothing had checked it: T06a could not add the client
  package, so its tests drove the server with hand-written JSON-RPC and pinned
  `2025-11-25`, and TASKS.md recorded the 2026-07-28 opening exchange as
  UNVERIFIED. **It is now verified.** On
  `@modelcontextprotocol/client` 2.4.0 against
  `@modelcontextprotocol/server` 2.4.0, `test/agent/protocol.test.ts` spawns
  the real `merchant/stdio.ts` over a pipe and the two ends settle on
  **`2026-07-28`**, era `modern`, with `server/discover` reporting
  `supportedVersions: ['2026-07-28']`. `auto` rather than a pin because a
  reference client that refuses to talk to a 2025 server teaches the wrong
  lesson about a protocol in transition, and the fallback is free.
- **Cost.** One extra round trip on connect, and for the SDK's stdio transport
  the probe runs in a disposable sibling process — so connecting spawns the
  server command twice. There is a second, sharper cost worth writing down:
  **the revision depends on how the server is mounted, not only on the SDK
  version.** `serveStdio` owns the era decision for its connection and serves
  the modern opening; an `McpServer` connected straight to a transport, which
  is what the in-memory tests do, has no such entry point and serves
  `2025-11-25` / `legacy`. Both are asserted (`protocol.test.ts` and
  `client.test.ts`) so the difference is recorded rather than discovered. A
  reader should not conclude from "SDK v2" that a connection is 2026-07-28.

## D76 · `place_order` is one isolated function over the tool-calling seam — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `agent/order.ts` holds `placeOrder(caller, identity, quoteId)`
  and nothing else. Its only dependency is a `ToolCaller`, so it runs against
  anything that can call a tool. It is tested against a stub MCP server in
  `test/agent/stub-server.ts` that registers `place_order` with the agreed
  contract.
- **Alternative.** Fold the call into the runner's `switch` with the other
  five tools, and wait for T07a before testing any of it.
- **Why.** The immediate reason is scheduling: `place_order` is T07a's tool
  and was not on main when this was written, so isolating it means the real
  end-to-end check T09 owns is a change of argument and not a change of code.
  `test/agent/flow.test.ts` already runs the whole plan against the **real**
  merchant for all five shipped tools and routes only `place_order` to the
  stub, so the seam is load-bearing today rather than scaffolding. The reason
  that outlasts T07a: every other step reads a catalogue or moves a cart, and
  this one presents a signed mandate and may cause a charge. Code that can
  spend should be short enough to read in one sitting and reachable from one
  place.
- **Cost.** `place_order` is the one tool whose argument shape lives in two
  places — the step and the runner's terminal branch. The order and held-order
  bodies are also read loosely: `order_id` and `status` are required and the
  rest of the body travels unread, because the shipped shape is T07a's to fix.
  See the UNVERIFIED note on the refusal field name in the PR.

## D77 · The agent validates only the fields it reads, and type-checks the rest against the merchant — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `agent/wire.ts` declares its own zod schemas for the bodies
  the agent reads, listing only the fields it uses and ignoring everything
  else rather than rejecting it. It then imports the merchant's own types and
  asserts, at compile time only, that each one is assignable to the agent's
  shape (`MerchantShapesAreReadable`).
- **Alternative.** Import the merchant's zod schemas and validate against them
  whole — one definition, no duplication — or validate nothing and cast.
- **Why.** A buyer agent in the world does not ship with the merchant's
  source. It reads the fields it needs and tolerates whatever else arrives;
  validating the merchant's whole object would make this agent break on a
  merchant that *added* a field, which is exactly the coupling an
  agentic-commerce protocol exists to remove. So the runtime check is the
  agent's own and deliberately narrow. The compile-time assertion buys back
  the thing duplication usually costs: if the merchant renames or retypes a
  field the agent reads, `npm run build` fails in `agent/wire.ts` with the
  field named, rather than a demo failing in front of a reader. Casting was
  never on the table — the agent would then trust a body it never checked.
- **Cost.** Two descriptions of the same wire shapes, which can drift in the
  one direction the compiler cannot see: a field the merchant *adds* and the
  agent should start reading will not announce itself. The assertion is also a
  conditional type, which is a small piece of cleverness in a file otherwise
  written to be read.

## D78 · One `ToolCaller` seam, and a refusal that is not the envelope becomes `tool_error` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Everything above `agent/client.ts` reaches the merchant
  through one method, `callTool(name, args)`, returning a body or a refusal.
  A refusal body that does not parse as `{ error: { code, message } }` — the
  SDK's own input-schema rejection is a plain sentence — becomes the code
  `tool_error` with that text as its message.
- **Alternative.** A method per tool on the connection, typed to each tool's
  arguments; and for the unparseable body, throwing, since it is not a
  merchant refusal.
- **Why.** The narrow seam is what makes the runner testable against a stub, a
  router (`routeTools` puts two servers behind one caller) or a plain object,
  and it means a plan step cannot reconnect, change the protocol revision or
  reach another client's state — it can only call tools. Typing is not lost:
  it moved to `agent/wire.ts`, where the body is parsed once per tool.
  `tool_error` rather than a throw because the agent should report one shape of
  "no" to its caller, and the SDK has already decided to deliver this one as
  `isError: true`; a distinct code keeps it from masquerading as something the
  merchant's `MerchantErrorCode` list contains.
- **Cost.** `callTool` takes `Record<string, unknown>`, so a typo in an
  argument name is caught by the merchant's input schema at runtime rather
  than by the compiler. And `tool_error` lumps together an agent bug and
  anything else that arrives off-envelope, so a caller reading only the code
  cannot tell them apart — the message is the only distinguisher.

## D79 · Everything in `agent/` is deterministic: no randomness, no clock reads — ACCEPTED (Andrea, 28 Oct)

- **Decision.** No file under `agent/` calls `Math.random`, `Date.now`,
  `new Date()` or `randomUUID`. Planners are pure functions of their memory.
  Which products get bought is a `ProductChoice`, a pure function of the
  listed catalogue; the default, `twoCheapest`, takes the two lowest-priced
  products and breaks ties on product id. The only time the agent has the
  current time, it is the merchant's `expires_at`, read off the quote.
- **Alternative.** Inject a clock, as `mandate/` (D49) and `merchant/` do, and
  use it to check the quote's expiry before ordering.
- **Why.** An injected clock is right for a *verifier*, which has to decide
  whether a window has closed. The agent is not the verifier: the merchant
  re-checks the quote's expiry at order time and refuses `quote_expired`, so a
  clock here would duplicate the check in the one place whose answer does not
  count. Leaving it out buys an agent that produces byte-identical runs, which
  is what lets `flow.test.ts` assert a cart total of 2045 pence rather than a
  shape, and what will let T09's demo print the same transcript every time.
  Ties are broken on product id because a sort that is not total is not
  deterministic — two products at the same price must never swap places
  between runs.
- **Cost.** The agent will cheerfully present an expired quote and take a
  refusal for it, where a clock would have let it re-quote first. That is a
  round trip, and T09 or T12 may want it; the fix is a `ProductChoice`-shaped
  injection of a clock into the planner, not a `Date.now()` in the runner.

---

D90 to D93 are T08's second round, written after T07a's `place_order` merged
into main while T08 was in review. Each one amends an entry in T08's own
D70 to D79 range, which was already full; Andrea gave this round its own
numbers (28 Oct) rather than have the changes sit as unnumbered prose.
**D70 to D79 are unchanged** — read each entry below as amending the one it
names, and T10 may fold each into its target when it consolidates.

## D90 · Amends D76: the stub no longer stands in for `place_order`, and is kept for two bodies only — ACCEPTED (Andrea, 28 Oct, as corrected)

D76 was written when `place_order` was not on main, and its reasoning leaned
on that: the agent's order step ran against a stub, and `flow.test.ts` drove
"the real merchant for all five shipped tools" with the sixth routed
elsewhere. Both halves of that are now out of date.

- `flow.test.ts` drives **all six** of the merchant's tools, stub-free. The
  plan runs end to end against the real policy check and the real order store.
- `order.test.ts` drives the order step against the **real** tool for all
  three of its answers, and pins the shipped combination: `approved` with an
  `order_id` and no token; `awaiting_confirmation` with both; `mandate_refused`
  with `error.reasons` naming every failed check. It also covers
  `quote_already_ordered` (D64) and `merchant_misconfigured` (D60).
- The seam D76 argued for held up in one respect: the order step is still one
  function over a `ToolCaller`, and it now runs against the real tool.
  Correction, 28 Oct, by the build lead before acceptance, from the
  pre-reviewer's diff of `fa2cc24` to `667178a`: this entry first said the move
  changed only the tests' arguments and not `agent/order.ts`. That was wrong.
  Round 2 changed `agent/order.ts` (+29/-26, including the removal of
  `unwrap()`, which had guessed at an envelope the shipped tool does not use),
  `agent/refusal.ts`, `agent/wire.ts` and `agent/index.ts`. Every change is
  tested.

- **Decision.** Keep the stub, cut to a third of its size, for the one job the
  real merchant cannot do: answering with a body a well-behaved merchant never
  sends. Two of those are claims about the agent and nothing else — an approved
  order whose status word is **not** `approved` (T07b's paid path, which the
  agent must carry through rather than reject), and a success body that is
  neither documented shape, which must throw rather than become a refusal
  (D73). Its input schema is now the merchant's own `mandateWireSchema`,
  imported rather than copied, so a field added to the mandate reaches the stub
  with nobody remembering to update it. That also deleted a cast: the
  merchant's schema already parses to a `Mandate`.
- **Alternative.** Delete the stub outright, now that the real tool has
  shipped — the tidier-looking option, and the one the pre-review raised. The
  other alternative, keeping it standing in for `place_order` as before, is
  simply worse than testing against the real thing and was never in question.
- **Why.** Deleting it would take those two tests with it, and they are the
  agent's only coverage for meeting a merchant it was not compiled against —
  which is the normal case for a buyer agent and the whole premise of D77. The
  real merchant cannot produce either body, by construction: a well-behaved
  merchant is exactly the thing that never sends them. So the choice is
  between 116 lines and having no test at all for the case the agent is most
  likely to meet in the world.
- **Cost.** A test helper now imports from `merchant/`, so a breaking change
  there breaks a test in `test/agent/`. That is the right direction for a file
  whose purpose is to imitate the merchant, and it is the opposite of what the
  agent itself does (D77) — a reader should not take the stub's import as
  licence for the agent to do the same. The stub also has to be kept honest by
  hand: nothing stops it drifting into answering things the real merchant
  would, which would quietly turn it back into the stand-in D90 just retired.

## D91 · Amends D76 and D77: the refusal list is `error.reasons`, and only that — ACCEPTED (Andrea, 28 Oct)

D76's cost paragraph pointed at an UNVERIFIED note about which field
`place_order` would use for the failed mandate checks. **It is `error.reasons`,
and the note is withdrawn.** T07a's `MerchantErrorBody` declares it, D66 ruled
it, and `toErrorBody` fills it only on `mandate_refused`.

- **Decision.** `agent/refusal.ts` reads `error.reasons` and nothing else.
- **Alternative.** Keep accepting `error.refusals` and a list of bare code
  strings as well — the tolerance the first draft shipped, written before the
  tool existed.
- **Why.** The pre-review asked for a reason to keep the tolerance or to drop
  it, and there is no good reason to keep it. `refusals` is a field no
  merchant has ever sent: the tolerance was a guess, and the test that covered
  it pinned fiction, which is worse than no test because it reads like
  evidence. It also cost a reader something real — two alternative shapes to
  rule out before learning the one that is true. D77's tolerance argument does
  not reach this far: that argument is about **ignoring fields the agent does
  not read**, which keeps working against a merchant that adds one, and says
  nothing in favour of guessing at names for a field the agent *does* read.
- **Cost.** If a future merchant names it something else, the agent reports
  the refusal with its code and message and an empty reason list rather than
  the reasons. That is a visible, debuggable loss of detail rather than a
  silent one, and `refusal.test.ts` has a test asserting exactly this
  behaviour for `refusals`, so the choice is recorded where it would be
  rediscovered.

## D92 · Amends D77: money off the wire is read as `number`, not `int` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The money fields in `agent/wire.ts` are `z.number()`. Counts —
  `quantity` and `cart_version` — stay `z.int()`.
- **Alternative.** `z.int()` for money too, as the first draft had it and as
  the merchant's own internal schemas use.
- **Why.** D67 made this argument for the merchant's mandate schema and it
  transfers unchanged to the agent's reader: a schema that enforces a rule
  turns a breach of it into a parse failure. With `z.int()`, a merchant
  quoting a fractional amount made the agent say *"`get_quote` returned a body
  the agent cannot read"* and throw — losing the amount, the quote id and any
  chance of reporting what actually happened. Whether an amount is a legal
  integer of minor units is the mandate policy's call (`amount_invalid`, D58),
  made against the merchant's own stored quote, and an agent re-deciding it
  earlier and less well can only destroy information. Counts keep `int`
  because they are not money and a fractional quantity is nothing the agent
  could act on or report usefully.
- **Cost.** The agent will carry a fractional price as far as `place_order`
  and let the merchant refuse it, where the old code failed at the quote. One
  more round trip, in exchange for a refusal that names the real problem.

## D93 · Amends D70: one builder for the merchant's stores, with the ids asserted by name — ACCEPTED (Andrea, 28 Oct)

T07a replaced `createMerchantState`'s positional arguments with an options
object (D60). That change was caught by the compiler — three arguments where
one was expected — and the three call sites in T08's tests were a hard build
error, not a silent one.

The silent failure was next door, and worth writing down because it bit this
task once already. `CartStore` and `QuoteStore` take an **all-optional**
options object, and in the first draft they were called positionally:
`new CartStore(CATALOGUE, sequentialCartIds())`. A function satisfies an
object type whose every property is optional, so that compiled, and the id
factory was quietly dropped — the stores fell back to random UUIDs while the
tests went on asserting nothing about the ids. It surfaced only because one
test named `cart_000001` and failed. The pre-review flagged the same hazard
for this round, which is the right instinct: the compiler cannot see a
positional-to-options migration when every field is optional.

- **Decision.** Every construction of the merchant's stores goes through one
  builder, `deterministicMerchant()` in `test/agent/harness.ts`, which sets the
  cart, quote, order and confirmation-token factories and a mandate policy on a
  frozen clock. Tests assert `cart_000001`, `quote_000001`, `order_000001` and
  `confirm_000001` **by name**.
- **Alternative.** Fix the three call sites where they stand, each assembling
  its own stores with its own factories — the smaller diff, and what the
  compiler error strictly asked for.
- **Why.** The compiler error was never the real problem; the dropped factory
  was, and that one is invisible. Three call sites are three chances to drop a
  factory again on the next migration, and a test that asserts nothing about
  an id cannot tell you it happened. One builder means one place to follow when
  `createMerchantState` changes again, and asserting the ids by name means a
  factory that stops arriving **fails a test** rather than silently weakening
  one. D70's seam is what made this cheap: the tests needed a merchant, not a
  rewrite.
- **Cost.** The agent suites share one merchant builder, so a test wanting a
  different merchant passes options rather than assembling stores itself. That
  is the trade D60 already made one level down. The general lesson is the part
  worth keeping: when an options object is entirely optional, the test that
  proves the options arrived has to assert on their **effect** — a named id —
  and never on the shape of the call.

---

## T07b · Merchant confirm_order and rail call

D80 to D89 are T07b's. All were accepted by Andrea on 28 Oct.

This section sits *after* D90 to D93 because the file is ordered by task and
not by number: T08's round-2 addendum took the next free numbers while T07b
was in review, and this range was allotted before it. The file already orders
ranges this way — T04's D58 and D59 sit before T05's D50 to D57 for the same
reason — and it is append-only, so the alternative was editing above.

T07a stopped at the authorisation decision: `place_order` returned `approved`
and neither the rail nor `recordSpend()` was called. This task closes that
gap, which means it owns three things T07a left open — what the states of an
order actually are, what `confirm_order` has to re-check after a human has
been thinking for ten minutes, and what the merchant does with each of the
four ways a payment can fail. Two of those four are not failures the rail's
own tests could show, because `StubRail` deliberately never pretends to be a
bank (D55).

## D80 · Five order states, and a store that refuses any other transition — ACCEPTED (Andrea, 28 Oct)

- **Decision.** An order is `approved`, `awaiting_confirmation`, `authorised`,
  `paid` or `declined`. Six transitions exist: `approved` and
  `awaiting_confirmation` each go to `authorised` or `declined`, `authorised`
  goes to `paid`, and a refused capture leaves `authorised` where it is. Every
  other pairing of a state and a transition throws a plain `Error` —
  `internal_error` on the wire — rather than being quietly allowed. `paid` and
  `declined` are terminal. The transitions are a table in
  `test/merchant/order.test.ts`: six legal rows asserted, and the whole 5 × 4
  matrix walked so that each of the fourteen illegal pairs is asserted to
  throw. An order's payment steps carry no merchant timestamp: the rail stamps
  its own `authorised_at` and `captured_at`, and a second clock's opinion of
  the same event is a field that can disagree with itself.
- **Alternative.** Three states — held, paid, failed — with the rail's
  answers kept in a separate payment record. Or a free `status` field with no
  guard, since one function (`settle()`) does all the writing and could be
  trusted to write only sensible values. Or an `expired` state for a lapsed
  hold, swept by a timer.
- **Why.** `authorised` is the state the repo exists to make visible. A
  merchant that authorised and could not capture is holding somebody's money
  without having sold them anything, and a model with only "paid" and "failed"
  has to file that under one of the two, both of which are lies. The word is
  D62's own: `approved` is what the merchant decided, `authorised` is what the
  rail did to money. The guard is there because the illegal transitions are
  precisely the bugs that cost money — capturing a declined order, paying a
  held order twice — and a test that walks the whole matrix is the only kind
  that still fails when somebody adds a sixth state and forgets a branch. A
  lapsed hold is computed on read rather than stored, exactly as an expired
  quote is (D38, D39): no sweeper, no timer, and the refusal can name the
  window the order had.
- **Cost.** Five words a reader has to hold, two of which (`approved`,
  `authorised`) are one letter apart in meaning if you skim. `approved` is
  also nearly invisible: on the direct path the order passes through it inside
  a single call, so only a test with a paused rail can observe it — there is
  such a test, which is the only reason the state is worth persisting at all.
  And the matrix test has to be kept honest by hand: adding a state without
  adding its rows leaves the new state untested rather than failing.

## D81 · A refused capture leaves the order `authorised`, with its own error code — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `authorise` declined marks the order `declined` and refuses
  with `payment_declined`; nothing was held. `capture` declined leaves the
  order `authorised`, writes the decline onto it as `capture_decline`, and
  refuses with a *different* code, `capture_failed`, whose message says the
  authorisation is outstanding.
- **Alternative.** One code, `payment_declined`, for both, with the rail call
  named in the message. Or marking the order `declined` after a failed
  capture, on the grounds that the purchase did not happen either way.
- **Why.** The two outcomes differ in the only way that matters to the person
  whose card it is. After a declined authorisation there is nothing
  outstanding and the agent can re-quote and try again. After a declined
  capture the rail is holding funds that this interface cannot release — there
  is no cancel and no refund by the PRD, and a real card authorisation sits
  for about seven days (D57's cost) — so somebody has to reconcile it by hand.
  An agent that saw one code for both would retry the second case and
  double-authorise. Calling it `declined` would be worse still: it would erase
  the outstanding hold from the merchant's own record.
- **Cost.** A state that needs a human and has no tool to help them: nothing
  in the repo lists stuck orders, and `state.orders.orders()` is the only way
  to find one. The agent is told the hold exists and can do nothing about it.
  Stage 2 wants a cancel on the rail interface — which is an addition D51's
  request objects make cheap — and T12 or a later task wants a reconciliation
  path. Said here rather than left for a reader to discover.

## D82 · A hold lasts fifteen minutes, and the quote behind it is never re-read — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `holdForConfirmation` stamps the order with
  `expires_at = placed_at + HELD_ORDER_TTL_SECONDS` (900, the same window a
  quote gets), and `confirm_order` refuses a lapsed hold with `order_expired`,
  naming the instant it ran out. The quote is not consulted at confirmation:
  not its expiry, not its cart, not its price. The order carries its own
  priced snapshot — the lines, the amount, the currency — and that snapshot is
  what the human is being asked about.
- **Alternative.** No expiry at all, which is what T07a shipped and what D63's
  cost asked a later task to fix. Or tie the hold to the quote's own
  `expires_at`, so the two windows end together. Or tie it to the mandate's
  `valid_until`, so a hold can never outlive the authority behind it.
- **Why.** A token with no expiry is a capability that never dies, which is
  the wrong shape for the one value in this repo that can move money on its
  own. Fifteen minutes because it is the number already in the system (D38)
  and a reader should meet one duration rather than two. The quote is left out
  because re-reading it would break the common case for no gain: a quote
  issued ten minutes before the order would leave the human five minutes to
  answer, and a cart the agent touched afterwards would cancel a purchase a
  person had already agreed to. The *price* cannot drift, because the order
  stored it. What can drift is the stock and the mandate, and those are
  re-checked (D83).
- **Cost.** A fourth duration-shaped thing in the repo after the quote TTL,
  the mandate window and the rail's notional authorisation life, and the hold
  can outlive the quote it came from — so a reader comparing `expires_at` on
  an order with `expires_at` on its quote will find two different instants and
  have to be told why. A hold can also still outlive the mandate's window,
  which is caught at confirmation by the policy rather than by the hold's own
  clock: the refusal then reads `mandate_expired`, not `order_expired`, which
  is the more accurate of the two. And there is still no way to cancel a hold:
  it lapses or it is confirmed.

## D83 · `confirm_order` re-runs the whole mandate check, against the mandate it stored — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A held order keeps the `Mandate` it was placed under, and
  `confirm_order` calls `checkMandate()` again with it, against the clock and
  the spend ledger as they are at confirmation time. A `refuse` outcome is a
  refusal; `confirm_required` is *not* — being above the threshold is the
  reason the token exists, so treating it as a refusal would make every held
  order unconfirmable.
- **Alternative.** Trust the check made at the hold, and re-verify nothing: the
  mandate was good when the order was taken and a human has now said yes.
  Or re-check only the window and the budget, skipping the signature. Or take
  the mandate as a second argument to `confirm_order`, so the merchant need
  not store a credential.
- **Why.** The hold is exactly the window in which the facts the mandate
  depends on go stale. Two of them bite in practice: the mandate's own
  `valid_until` can pass while a human is deciding, and another order under
  the same mandate can eat the budget in between — which is D45's named gap,
  reachable here without any concurrency at all, because the direct path pays
  immediately. Both have a test. The signature half of the re-check cannot
  fail, since this is the merchant's own stored copy that no caller has
  touched, and it is re-run anyway because `checkMandate()` is one call and
  splitting it to skip a cheap check would be the kind of cleverness that
  later turns out to have skipped the wrong one. Storing the mandate rather
  than asking for it again keeps the input at one argument, which is what lets
  the *principal* confirm: the person is not the agent (D61, D74) and may never
  have held the mandate at all.
- **Cost.** **The merchant now holds a credential in memory for up to fifteen
  minutes**, and D69's process-level isolation is all that bounds it: anything
  in the server process can read a held order's mandate. That is a real
  widening of what the merchant keeps, and it is the entry here most worth
  arguing about — the alternative is passing the mandate back on
  `confirm_order`, which moves the credential onto the wire a second time and
  hands the confirming party a job that is not theirs. The re-check also means
  two audit entries for one purchase (D65 stays as ruled), and a held order can
  now be refused at confirmation for a reason that did not exist when the human
  was asked, which is correct and still reads as the merchant changing its mind.

## D84 · The token is spent by the attempt that reaches the rail — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A confirmation token releases one payment *attempt*. A
  confirmation that gets as far as `settle()` moves the order out of
  `awaiting_confirmation`, and the same token afterwards is refused:
  `order_already_paid` when it went through, `order_not_awaiting_confirmation`
  when the rail declined or the order is stuck `authorised`. A confirmation
  refused *before* the rail — unknown token, lapsed hold, stock gone, mandate
  refused — changes nothing, so the token stays live and the human's yes still
  counts. The token index is kept rather than deleted, so a second attempt is
  told what happened to its order instead of being told the token is unknown.
- **Alternative.** Delete the token on first use, so every second attempt reads
  `confirmation_token_unknown`. Or treat only a *successful* payment as
  spending it, so a declined card could be retried with the same token.
- **Why.** "Spent at the rail" is the line that cannot be crossed twice: it is
  what stops a second confirmation double-authorising, which is a real hazard
  because `order_ref` is not an idempotency key (D56) and the rail would
  cheerfully grant a second hold. Before the rail, nothing has happened, so
  refusing the token as well would punish the human for the merchant's stock
  going — the reasoning D64 gives for leaving a quote free after a refused
  order, one level up. Keeping the index follows D39: the refusal should say
  what happened, not that the id is unknown. Two codes rather than one because
  "already paid" is benign news an agent should not treat as a failure, and
  prose in a message is not something a client should have to parse (D66).
- **Cost.** A declined card ends the order: the token will not send it again,
  so the agent has to re-quote and the human has to be asked a second time.
  That is deliberate — a retry loop on a held order is an agent spending
  against a decision a person made once — but it is friction a real checkout
  would not accept, and a `retry_order` tool with its own rules is the honest
  fix rather than loosening this. The two codes also split a case a client may
  not care about, so a client that only wants "not confirmable" has to match
  two.

## D85 · A rail that throws is `rail_unavailable`, and its message does not travel — ACCEPTED (Andrea, 28 Oct)

- **Decision.** An exception out of `authorise` or `capture` becomes
  `RailUnavailableError`, code `rail_unavailable`, with a fixed message saying
  the payment state is unknown and nothing has been recorded as paid. The
  order keeps the state it was in — `awaiting_confirmation` or `approved` if
  `authorise` threw, `authorised` if `capture` did — nothing is written to the
  spend ledger, and the thrown error is kept as `cause` rather than put on the
  wire. There is no `decline` field on the body, because nothing was declined.
- **Alternative.** Mark the order `declined`, which is what a `catch` that
  treats every failure alike would do. Or invent a sixth state,
  `payment_unknown`, for exactly this. Or pass the rail's own message through,
  as every other `MerchantError` does.
- **Why.** D50 made this argument at the rail's own seam and it transfers
  unchanged: a timeout is not a decline, because the payment may have gone
  through, and code that records one as the other books a successful charge as
  a refused card. The order therefore keeps the last thing that was actually
  *known* about it, and a status word is never written on a guess — which is
  why no sixth state was added: `payment_unknown` would be a state word
  recording the absence of information, and `authorised` after a failed
  capture already says the true thing. The message is the one exception to
  passing a refusal through verbatim, because a real rail's internal errors
  carry hosts, URLs, request bodies and sometimes credentials, and this body
  goes to the agent.
- **Cost.** The direct path can now leave an order `approved` forever: there
  is no token to retry with, no `get_order` to read it back (D62's cost asked
  for one), and the quote is used up (D64), so that purchase cannot be
  completed or retried at all — the agent must re-quote the cart. A retry
  after a throw would also double-authorise, and nothing in the repo stops it
  (D56's cost). Swallowing the rail's message also means a developer debugging
  a broken rail has to read the server's own output rather than the tool
  result; the `cause` is there for them.

## D86 · The decline rides on the error body; the audit log is left alone — ACCEPTED (Andrea, 28 Oct; the audit gap it records is closed by T07c)

- **Decision.** `MerchantErrorBody` gains one more conditional field,
  `decline: { code, message, origin }`, present on `payment_declined` and
  `capture_failed` only, carrying the rail's own `RailDecline` unchanged
  (D53). Everything else about D13 is unchanged: `isError: true`, one text
  block, no `structuredContent`. The audit log is **not** widened: a rail
  failure leaves no audit entry, and the only entries a payment produces are
  the policy checks that preceded it.
- **Alternative.** Flatten the decline into the message, as a sentence. Or one
  merchant error code per decline code, which would need eight more entries in
  `MerchantErrorCode`. Or take up D48's and D65's invitation and add an entry
  kind to `AuditEntry`, so a settlement appears in the audit log beside the
  check that allowed it.
- **Why.** `origin` is the field a product reader should see named — an issuer
  refusing a cardholder's money is a different event from the payment system
  rejecting a request — and it cannot survive being folded into prose. Passing
  the rail's object through unchanged is the same choice D66 made for the
  policy's reasons, for the same reason: the vocabulary of *why the money did
  not move* belongs to the rail. The audit log is left alone for a blunter
  reason than principle: widening `AuditEntry` means changing `mandate/`,
  which is **not among the directories T07b may touch**, so the choice here is
  between not doing it and doing it out of scope. D48 and D65 are both ruled
  and both read the right way as they stand — the log records decisions, and a
  settlement is a different kind of event.
- **Cost.** The error body now has two fields that appear on some codes only,
  so a client reading either unconditionally gets `undefined` most of the
  time — D66's cost, doubled. And an auditor needs **three** sources to see one
  purchase through: the audit log for the decisions, the rail's own log for
  what the rail did, and the spend ledger for what was actually taken. A
  declined payment appears in two of the three and leaves the audit log
  reading `confirm_required, confirm_required` with no hint that the card was
  refused. **If Andrea wants the settlement in the audit log, this is the entry
  to overrule** — the change is D48's widening, it belongs to T10 or to a task
  whose directories include `mandate/`, and a test here already pins the
  present behaviour so the change would be visible.
- **Ruling, 28 Oct (Andrea).** Fix it: the settlement goes into the audit log,
  in a new task, T07c, whose directories include `mandate/` and `merchant/`.
  This entry stays as the record of the gap until T07c lands; T07c's decisions
  (D94 to D99) amend it, and the test that pins the present behaviour is
  updated there.

## D87 · The ledger records the amount the rail took — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `recordSpend()` is called with the `amount_minor` off the
  `Capture` the rail returned, not with the amount the policy checked and not
  with the order's stored total. It is called after the order is marked `paid`.
- **Alternative.** `recordSpend(policy, decision)`, which is the call D45 names
  as the usual one and which uses the amount the check was made against. Or
  the order's own `amount_minor`.
- **Why.** The three figures are one number by construction — the authorise
  request is built from the order and a capture settles it in full (D52) — and
  that is exactly why the captured one is the right source: D51's cost names
  the hazard that nothing in the type system ties the amount checked to the
  amount authorised, and a ledger fed from the far end of the sequence closes
  the loop rather than restating the near end. A budget is a record of money
  that left, so it should be written from the thing that reports money
  leaving. Two tests pin the three figures together, on both paths.
- **Cost.** A divergence from D45's stated call shape, which means a reader
  following D45 to this code finds a different argument than the one it names.
  If the three figures ever *did* disagree, this choice would leave a correct
  ledger behind an incorrect authorisation rather than failing loudly — there
  is no assertion that they match, because a defensive check here would be
  dead code with a dead test attached (D68's reasoning). The order of the last
  two steps is also a choice with a losing side: marking `paid` first means a
  throw out of `recordSpend` would leave a paid order with budget unconsumed,
  and the reverse would leave a consumed budget on an order that does not read
  `paid`. The money has moved by then, so the order's own record goes first.

## D88 · `place_order` pays on the direct path, and `approved` leaves the wire — ACCEPTED (Andrea, 28 Oct)

- **Decision.** An order the mandate covers outright is authorised, captured
  and recorded inside the one `place_order` call, which answers
  `{ status: 'paid', order_id }`. `approved` is no longer a body the merchant
  sends; it survives only as a stored state (D80). `place_order`'s advertised
  `status` enum is therefore `['paid', 'awaiting_confirmation']`, and
  `confirm_order` advertises the literal `'paid'`. Both bodies stay at the two
  fields D62 settled, and both tools go through one `settle()` in
  `merchant/pay.ts`. The functions are now `async`, and `server.ts` has one
  `run()` wrapper that awaits a handler which may or may not be synchronous.
- **Alternative.** Keep `approved` on the wire and make paying a second call —
  `confirm_order` for everything, or a new `pay_order` — so that every order
  is placed and then paid. Or two statuses on the direct path, `approved` when
  the rail is slow and `paid` when it is not.
- **Why.** The PRD's own sequence diagram ends `M-->>A: paid` on both paths,
  and an agent that had to call a second tool to finish a purchase the mandate
  already authorised would be carrying a step that exists for no one's benefit:
  there is nobody to ask, which is the whole difference between this path and
  the held one. One `settle()` for both because the sequence — authorise,
  capture, record, in that order and no other — is the part of this repository
  where a mistake costs money, and there should be exactly one copy of it to
  read and one set of tests against it.
- **Cost.** **This is a wire change.** `place_order` answered `approved` on
  main and answers `paid` now, so anything written against the T07a body has
  to read the new word. T08's buyer agent was the one caller, and what it cost
  is worth recording because it is the measure of whether D76's seam and D77's
  narrow reader were worth their price: **no production code in `agent/`
  changed at all.** `approvedSchema` already read `status` as a plain string —
  D90 put it that way for exactly this path — and `run.ts` switches on the
  agent's own outcome word, so a `paid` body arrives as an `ordered` run with
  nothing recompiled. Six assertions in `test/agent/` were claims about the
  merchant rather than about the agent, and those did have to move: the
  six-tool list, a test that relied on `confirm_order` being absent, and four
  bodies reading `status: 'approved'`. The agent's behaviour is unchanged: it
  carries the success status through and still stops on
  `awaiting_confirmation` without confirming (D74). `place_order` is also no
  longer a cheap call: it waits for a payment rail, so a slow rail is a slow
  tool call, and there is no progress reporting. And an order that fails at the
  rail now takes its quote with it (D64 frees a quote only for a *refused*
  order), so a declined card means re-quoting the cart.

## D89 · The rail is configuration, and never absent — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `MerchantState.rail` is a required `Rail`, defaulted by
  `createMerchantState()` to `new StubRail()` with every stub default:
  sequential authorisation ids, the stepping clock from `STUB_RAIL_EPOCH`, and
  a log that writes nowhere. A caller that wants a transcript or Stage 2's
  Stripe rail passes one in. `merchant/stdio.ts` passes none, so a spawned
  merchant pays through a silent deterministic stub.
- **Alternative.** Make `rail` optional like `policy`, so a merchant with no
  rail serves its catalogue and refuses to pay, with a
  `merchant_misconfigured`-shaped refusal. Or read it from the environment as
  D60 reads the merchant id and the issuer key.
- **Why.** The two pieces of configuration are not alike. A merchant with no
  trusted issuer has something useful left to do — T08 browses a merchant it
  cannot buy from (D60) — whereas a merchant with no rail has no degraded mode
  to offer, so an optional field would buy one more `undefined` check at every
  call site and nothing else. The default is a stub rather than nothing because
  Stage 1 *is* the stub (PRD R9) and a reference implementation should run from
  a fresh clone with no configuration at all. Silence is the only safe default
  for the log, since the merchant's stdout is a protocol channel (D54), and T09
  is the place to pass `writeTo(process.stderr)` for the demo.
- **Cost.** Every construction of a merchant state now carries a rail whether
  the test cares or not, and the default one keeps authorisations in a process
  `Map` that is never evicted (D57's cost, one level up). A merchant started
  from `stdio.ts` also records nothing about its payments anywhere, which looks
  broken until you read this entry or D54 — the demo is where that gets fixed,
  and T09 has to remember to.

## D94 · Settlements go in the audit log, as a second kind of entry — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `AuditEntry` becomes a discriminated union on a new `kind`
  field: `mandate_check`, which is the entry that existed before, and
  `settlement`, which records what the rail did about the money. Both kinds
  live in the **one** log, appended in the order they happened, so a payment
  reads directly under the decision that allowed it. A settlement entry
  carries `at`, `mandate_id`, `order_id`, `amount_minor`, `currency`,
  `outcome`, and — on a decline — the rail's `code` and `origin`. It does not
  carry the agent or the merchant: the check immediately above it does, and
  the two share a `mandate_id`.
- **Alternative.** A second log beside the first, `policy.settlements`, with
  its own `print()`: no change to `AuditEntry` at all, and no union for a
  reader to narrow. Or one flat entry type with every field of both kinds
  optional, which needs no `kind` at all. Or leave it as D86 had it, with the
  decline on the error body only.
- **Why.** The order is the thing an auditor cannot reconstruct afterwards.
  "Allowed at 12:00:00, declined at 12:00:01" is one story in one list; the
  same two facts in two lists have to be interleaved by timestamp by whoever
  reads them, and a reader who has only one of the two lists cannot tell
  whether the other exists. PRD R5 asks for one log, and the gap D86 named is
  exactly that a reader of the log could not see the refusal. A union rather
  than optional fields because the compiler then refuses to let anyone read
  `reasons` off a settlement or `order_id` off a check — the shape T04 chose
  for `PolicyDecision` (D41) and T07b for `Order` (D80), used a third time.
- **Cost.** **This is a type change in `mandate/`.** Anything that read
  `entries()[0].agent` now has to narrow on `kind` first, which is why the
  three readers in `test/merchant/support/merchant-harness.ts` exist and why
  `test/mandate/policy.test.ts` grew a `kind` in one assertion. T09's demo is
  being written in parallel: `print()` is unchanged, so a demo that prints the
  log is unaffected, but one that reads `entries()` field by field will need
  the same narrowing. A settlement line also cannot be read on its own — it
  names no agent — so the log is a record to be read in order rather than a
  set of self-contained rows, which is a fair description of a journal and a
  poor description of a table.

## D95 · One log, two entrances, and the check lines do not move — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `AuditLog` gains a second entrance, `recordSettlement()`,
  beside `record()`. Each builds and freezes its own entry and pushes it; there
  is still no way to amend or remove one. `formatEntry` dispatches on `kind`
  and prints both kinds in the same six columns — time, outcome, amount, who
  or what, mandate, detail — with the order id where a check puts the parties,
  and the decline (or the unanswered call) where a check puts its reasons. The
  settlement outcome words are the merchant's existing ones: `paid` from the
  order status and the success body, and `payment_declined`, `capture_failed`
  and `rail_unavailable` from `MerchantErrorCode`. A check line is byte-for-byte
  what it was before.
- **Alternative.** One entrance, `append(entry)`, taking a finished entry of
  either kind: fewer methods, and a caller that can build whatever it likes.
  Or new, shorter words sized to the column (`declined`, `unavailable`). Or a
  separate `formatSettlement()` and let the demo decide what to call.
- **Why.** One entrance per kind keeps the property that makes this log worth
  reading: a caller cannot write an entry the log did not build, so no entry
  can be malformed or unfrozen, and `checkMandate()` still cannot forget to
  log (D48's reason, now twice). The words are the merchant's own because a
  word that means one thing on the wire and another in the log is a word a
  reader has to translate: an agent told `payment_declined` should find
  `payment_declined` in the log. And they happen to fit — `confirm_required`,
  `payment_declined` and `rail_unavailable` are all exactly sixteen
  characters, so the existing column width held and no check line moved, which
  a test asserts by checking that the amount starts at the same offset on
  every line of either kind.
- **Cost.** Two entrances mean two places to keep in step if the log ever
  grows a third kind; a third would be the moment to reconsider the flat
  `append`. The sixteen-character coincidence is load-bearing for the layout
  and nothing enforces it beyond a test: a fifth outcome word of seventeen
  characters would silently push one line's columns right. And the two kinds
  share columns that do not mean quite the same thing — column four is a pair
  of parties on one line and an order id on the next — which reads well in a
  terminal and would not survive being parsed as a table (D46's cost, which is
  why `entries()` exists).

## D96 · The audit line carries the decline's code and origin, and not its message — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A settlement entry's `decline` is `{ code, origin }`, both
  typed `string` in `mandate/audit.ts` rather than imported from `rail/`. The
  rail's `message` is not copied into the log, and neither is anything from a
  rail that threw: that entry carries only `rail_call`, the call that went
  unanswered.
- **Alternative.** Pass the whole `RailDecline` through, message included, as
  the error body does (D86) — and import `DeclineCode` and `DeclineOrigin`
  from `rail/` so the log's vocabulary is the rail's closed union.
- **Why.** Two reasons, and they point the same way. First, dependencies:
  nothing in `mandate/` imports `rail/`, because the mandate layer is the part
  of this repo a reader might lift on its own (D49), and a structural
  `{ code, origin }` is satisfied by a `RailDecline` unchanged — the merchant
  passes one in and the compiler checks it, with no coupling either way.
  Second, content: `origin` is the field that has to survive (D53, D86), the
  `code` is what a reader branches on, and the message is prose that already
  travels on the error body and in the rail's own log. For a rail that *threw*
  the message is worse than redundant — D85 keeps it off the wire because a
  real rail's internal errors carry hosts, URLs and sometimes credentials, and
  this log is printed to a terminal in the demo, so the same rule applies with
  more force.
- **Cost.** The log's `code` is `string` where the rail's is a closed union, so
  a typo in a hand-built entry would compile; the merchant's only call site
  passes the rail's object through, so the narrowing is enforced where it
  happens rather than where it is stored. An auditor who wants the decline's
  sentence needs the rail's log or the error body, which is one more source for
  one more detail — but the code and the origin are the two things D86 said a
  reader must not have to parse out of prose, and they are both here.

## D97 · The settlement line is stamped from the policy's clock, and carries the amount the rail took — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The `at` on a settlement entry comes from `policy.clock()`,
  the same clock the mandate decisions are stamped from, read at the moment
  the outcome is known. The rail's `authorised_at` and `captured_at` stay
  where they are, on the order. `amount_minor` is the captured amount on
  `paid`, and the amount attempted — the order's own total — on the three
  failures.
- **Alternative.** Stamp the line with the rail's own timestamp, which is the
  time the money actually moved. Or carry both. Or always record the order's
  amount, so every line about one order reads the same number.
- **Why.** A log whose lines come from two clocks cannot be read in order, and
  reading it in order is the whole point of putting settlements in it (D94).
  `StubRail`'s clock starts at a synthetic epoch nine months before the
  merchant's, so a rail-stamped settlement would sort above the decision that
  caused it; a real rail's clock would merely be a few seconds out and skew
  invisibly. The entry's `at` therefore means what it means on a check line —
  when this log recorded this event — which is also why this is not the second
  opinion of one event that D80 refused to add. The amount follows D87 one
  step along: a budget is a record of money that left, so the line that says
  money left says how much the rail reported taking, and the line above it
  says what was authorised. When they differ, an auditor sees the difference
  instead of having to reconcile the ledger against the rail.
- **Cost.** The log does not say when the rail says it moved the money; that
  is on the order and in the rail's log, and the two can be minutes apart for
  a slow rail with no way to tell from the log alone. And one order can now
  show two amounts in the log — authorised above, captured below — which is
  the truth and is also the kind of discrepancy a reader may read as a bug
  before reading this entry.

## D98 · `settle()` is the one writer, and it writes before the ledger — ACCEPTED (Andrea, 28 Oct; the write order is pinned by a test added to T12)

- **Decision.** Every settlement entry is written inside `settle()` in
  `merchant/pay.ts`, at the point each outcome becomes known: after the order's
  own state transition, and on the paid path *before* `recordSpend()`.
  `place_order` and `confirm_order` write none of their own and know nothing
  about it. A rail that threw gets a line too.
- **Alternative.** Write the line in each tool after `settle()` returns or
  throws, which is where the tool knows what the agent will be told. Or inside
  `AuditLog`, by handing it the rail's result. Or after `recordSpend()`, so a
  line is written only once budget and log agree.
- **Why.** The sequence authorise-capture-record is the part of this repo where
  a mistake costs somebody money, and D88 put exactly one copy of it in one
  function for that reason; the record of what that sequence did belongs in the
  same place, or the two copies drift and one tool starts logging what the other
  does not. Writing before the ledger follows from what each step means: once
  the capture succeeded the money has moved, so the auditor's line is true from
  that instant, and a throw out of `recordSpend` then leaves a log that still
  says so. A rail that threw gets a line because "we asked and got no answer"
  is precisely what an auditor needs to see — it is not a claim about the
  money, and D85's refusal to guess at the order's state is not a reason to
  leave the attempt invisible.
- **Cost.** The audit log and the ledger can now disagree in a new way: on the
  paid path the log says `paid` a moment before the budget is consumed, so a
  failure between the two leaves a log that is right and a ledger that is
  short. That window is the non-atomic step T12 already owns (it is D87's
  ordering cost, one line further on), and this choice picks which of the two
  records is the one to trust. `settle()` also now needs the policy's clock as
  well as its ledger and log, which it already had through `PaymentContext`, so
  nothing in the signature changed — but a reader looking for the audit writes
  has to know to look in `pay.ts` and not in the tools.

## D99 · A refusal that never reached the rail settles nothing, and logs nothing — ACCEPTED (Andrea, 28 Oct)

- **Decision.** A `confirm_order` call refused before the rail — unknown or
  spent token, lapsed hold, stock gone, or a mandate re-check that refused —
  leaves **no settlement entry**. The mandate re-check leaves its own
  `mandate_check` entry when it runs, as it already did; the three refusals
  before it leave nothing. D65 stays exactly as ruled for `place_order`: a
  stock refusal there still leaves no entry of either kind.
- **Alternative.** Log every refused call now that the log has a `kind` to
  distinguish events with — a third kind, `refusal`, so that every
  `place_order` and `confirm_order` call appears somewhere, which is the
  literal reading of T07a's definition of done that D65 declined.
- **Why.** The log answers two questions — was this purchase authorised, and
  what happened to the money — and a call refused for a lapsed hold answers
  neither: nothing was decided about the mandate and nothing was settled. The
  symmetry with D65 is the point: that entry's reasoning was that an `allow`
  written for an order then refused for want of stock would be a lie told to
  the one reader who matters, and a `settlement` written where no rail was
  called would be the same lie about the money. A third kind would also change
  what this log *is* — a record of decisions and settlements, not a request
  log — and a merchant request log is a different thing with a different
  retention story, which is Stage 2's at the earliest.
- **Cost.** The hole D65 named is still there and is now visible from one more
  side: an expired hold, a spent token and a sold-out line leave no trace
  anywhere once the call has returned, so an auditor cannot tell a human who
  was asked and never answered from one who was never asked. The refusal is in
  the error body the agent got and nowhere else. T10 lists this among the known
  limits, and if Andrea wants every call logged, the fix is a third kind here
  and not a second log.

## D100 · The demo hosts the merchant in its own process — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `npm run demo` builds the merchant inside the demo process and
  reaches it over the MCP SDK's `InMemoryTransport` pair, which
  `agent/connect(transport)` already accepts. The demo therefore holds the
  `MandatePolicy` it configured the merchant with, and can print that policy's
  audit log. The process path — a spawned `merchant/stdio.ts` reading its
  configuration from the environment — is covered by
  `scripts/stdio-smoke.test.ts` instead, which runs the same agent against the
  same plan and asserts both the revision that opening negotiates and a paid
  order.
- **Alternative.** Start `merchant/stdio.ts` as a child process, as
  `agent/client.ts` and `merchant/stdio.ts` both anticipated, and have the
  child print its own audit log to its stderr for the parent to relay.
- **Why.** The audit log lives in the merchant's policy, in the merchant's
  process, and it is half of what the demo exists to show: the PRD's R5 and
  the README both promise that every mandate check is written down. A stdio
  child cannot hand its log to the demo, and relaying it would mean the demo
  printing a stream it cannot order against its own narration — the log lines
  would arrive whenever the child flushed, not where the text needs them. The
  in-memory transport is the SDK's own answer to "a server without a process",
  and `agent/connect` exists because T08 needed exactly this.
- **Cost.** The demo does not exercise a process boundary, a pipe, or
  `serveStdio`'s era negotiation, so it proves less than the command looks
  like it proves — and it negotiates MCP **2025-11-25** rather than the
  2026-07-28 a spawned merchant gives (D75), which the output says plainly: a
  `THE CONNECTION` section prints the revision read off
  `MerchantConnection.protocolVersion`, with one sentence on why it is the
  2025-era handshake here and what a spawned merchant answers instead. Read
  off the connection rather than stated, because a stated revision is a
  sentence that can go out of date without anything failing. The smoke test is
  what keeps the real path covered, and it is one test rather than a second
  demo. The demo also sees state no MCP client could
  reach: the policy, the ledger and the order store. That is honest for a
  process that *is* the merchant, but a reader has to notice which side of the
  seam each printed fact came from, so the sections say so.

## D101 · Two MCP clients, two server instances, one merchant state — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The demo opens a fresh `McpServer` over the shared
  `MerchantState` for every connection, and opens two of them in run 2: one
  the agent shops on, and one the principal uses to call `confirm_order`. The
  agent's connection is closed before the principal's is opened.
- **Alternative.** Reuse the agent's one connection for the confirmation. Or
  connect two clients to a single `McpServer`, which the SDK refuses ("use a
  separate Server instance per connection"). Or call `confirmOrder(state, …)`
  as a function, bypassing MCP.
- **Why.** The confirmation is the principal's step, and the whole argument of
  the human-confirm threshold is that it is made by someone who is not the
  agent (D61, D74). A demo that confirmed down the agent's own channel would
  print the right words over the wrong wiring. Sharing the state behind two
  server instances is also what a real merchant is: one backend, many
  connections — the per-connection isolation in `merchant/stdio.ts` is a
  property of that entry point, not of the merchant.
- **Cost.** It diverges from `stdio.ts`, where one connection means one cart
  store and one ledger (D11, D60), so the demo shows a sharing model the
  shipped entry point does not have. The principal's client also holds the
  full tool surface, including `place_order`, where a real one would hold a
  confirmation endpoint and nothing else; the demo relies on it calling only
  the one tool rather than on being unable to call the others.

## D102 · The whole demo, audit log included, goes to stdout — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `runDemo()` takes one `OutputStream` and writes everything to
  it — narration, steps, order, rail log and the audit log, the last through
  `AuditLog.print(stream)` with a small indenting adapter. The entry point
  passes `process.stdout`.
- **Alternative.** The audit log to `process.stderr`, which is what
  `mandate/audit.ts` anticipated for the demo, with the narration on stdout.
- **Why.** The reason `print()` has no default stream (D46) is that the
  merchant may be an MCP stdio server, where stdout carries protocol frames.
  In this demo the merchant is reached over an in-memory transport (D100), so
  no part of this process's stdout is a protocol channel and the hazard does
  not exist. What does exist is a reader: splitting the output across two
  streams means `npm run demo > demo.txt` loses the audit log, and on a
  terminal the two streams interleave in an order nothing guarantees. The log
  is the point of the demo, not a diagnostic beside it.
- **Cost.** The file comment in `mandate/audit.ts` says the demo passes
  `process.stderr`, and it no longer does; the code is unaffected — `print()`
  still takes the stream — but the sentence is now wrong, and T10 should
  correct it (this task may not edit `mandate/`). A caller that wants the
  stderr split still has it: `runDemo()` takes the stream, so the choice is
  one argument away.

## D103 · Determinism: fixed clock, fixed ids, and no key material printed — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Two runs of `npm run demo` print byte-identical text. The
  merchant's cart, quote and order stores and the mandate policy all read
  `fixedClock('2026-10-25T09:00:00.000Z')`; ids come from
  `sequentialCartIds`, `sequentialQuoteIds`, `sequentialOrderIds` and
  `sequentialConfirmationTokens`; each run's `mandate_id` is a literal; the
  stub rail keeps its own deterministic defaults (D89). The Ed25519 key pair
  is generated fresh in memory on every run, and **nothing derived from it is
  printed** — not the private key, not the public key, not the signature,
  which appears in the mandate's JSON as
  `<Ed25519 over the ten fields above, base64url — not printed>`.
  `scripts/demo.test.ts` pins the byte-identical property and searches the
  output for every encoding of both halves of an injected key pair.
- **Alternative.** A fixed key pair, committed to the repository so the
  signature and the public key could be printed and asserted on.
- **Why.** A committed private key in a public reference implementation is a
  bad habit even when the key secures nothing: it trains the reader's eye to
  accept one, and it trips every secret scanner that ever looks at the repo.
  `generateMandateKeyPair()` takes no seed and this task may not change
  `mandate/`, so a fixed pair would have to be a literal in `scripts/`.
  Generating one and printing nothing from it gets the determinism without the
  literal — and a signature is 86 characters of base64url that no reader can
  check by eye, so withholding it costs the output nothing.
- **Cost.** What is **not** deterministic, and what a reader should therefore
  not expect to be stable: the mandate's signature and the key pair behind it
  (new on every run, never printed); the merchant's reported version and
  wall-clock duration, neither of which is printed. The one printed value that
  is not the demo's own to control is the negotiated MCP revision (D100): it
  is the same on every run against a pinned SDK, which is what keeps the two
  runs byte-identical, but an SDK upgrade that changed the in-memory
  transport's handshake would change that line and fail the test in
  `scripts/demo.test.ts` that pins it. That is the intended behaviour — the
  revision is a fact about the connection, and a demo that printed a stale one
  would be worse than a test that says the fact moved. The frozen clock also
  means the demo always prints dates in October 2026, which will read as stale
  from 2027 onward — the output says the clock is frozen, and the alternative
  is a demo whose text changes every day and whose README mandate expires.

## D104 · The rail's transcript is collected, not written to stderr — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The demo passes the stub rail a `RailLogSink` that appends to
  an array, and prints that array as its own section after the order. It does
  not pass `writeTo(process.stderr)`.
- **Alternative.** `new StubRail({ log: writeTo(process.stderr) })`, which is
  what D89's reasoning expected T09 to do.
- **Why.** Same reason as D102 one level down: a sink that writes straight to
  a stream puts its lines wherever the rail happens to be called, which is in
  the middle of a tool call, between the demo's own sections. Collecting them
  lets the demo print "here is what the rail did for this order" under a
  heading, next to the amount it captured. `RailLogSink` is a callback for
  precisely this reason (D54) — `writeTo` is one of its uses, not its
  definition.
- **Cost.** The demo holds the rail's entries in memory, which a long-running
  merchant would not, and a rail that threw before returning would leave the
  section empty rather than showing a partial line on stderr. Neither matters
  for a two-order demo on a stub.

## D105 · The stdio smoke test builds its own transport — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `scripts/stdio-smoke.test.ts` constructs the SDK's
  `StdioClientTransport` directly, with `env` set to
  `getDefaultEnvironment()` plus `ACR_MERCHANT_ID` and
  `ACR_MANDATE_PUBLIC_KEY`, and hands it to `agent/connect(transport)`.
- **Alternative.** Use `agent/connectStdio({ command, args })`, which is the
  agent's own stdio helper.
- **Why.** The merchant needs a trusted issuer key in its environment to
  accept an order at all (D60), and `connectStdio`'s `StdioServerCommand` has
  no `env` field — the SDK's default environment is a safe allowlist, so an
  `ACR_*` variable set in the parent does not reach the child. `connect` is
  the seam that exists for a caller holding its own transport, so the test
  uses it rather than this task editing `agent/`.
- **Cost.** The test does not exercise `connectStdio`, so the one helper a
  reader would reach for is covered only by `test/agent/protocol.test.ts`,
  against a merchant with no issuer configured. Giving `StdioServerCommand` an
  optional `env` is a small, obvious change to `agent/client.ts` and a
  candidate for T10 or Stage 2; it is outside this task's directories.

## D106 · The two runs differ by exactly one mandate field — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Both runs buy the same basket with the same planner —
  `scriptedPlanner()` with its shipped default choice, the two cheapest
  products — under mandates that are identical except for
  `human_confirm_above_minor`: 3000 in run 1, the README's 2000 in run 2. The
  basket is 2045 pence, so the threshold is the only thing that decides
  whether a human is asked.
- **Alternative.** Name the two products with `pickIds(...)`, as
  `agent/scripted.ts` anticipated the demo would. Or vary the basket between
  the runs — a cheap one that passes and an expensive one that does not.
- **Why.** A demo that changed both the basket and the mandate would leave a
  reader unsure which one mattered. Holding everything else still makes the
  argument in one line: the same agent, the same cart, the same price, and the
  outcome turns on a number the principal chose. `twoCheapest` rather than
  `pickIds` because it is the planner's default, it is already deterministic
  (ties broken on product id, D79), and "the agent picked the two cheapest"
  is a sentence about an agent making a choice rather than about a demo
  hard-coding one.
- **Cost.** The demo never shows a refusal — no expired mandate, no wrong
  merchant, no breached cap — so the third of the policy's three answers is
  visible only in the tests (`test/mandate/policy.test.ts`,
  `test/merchant/place-order.test.ts`) and in PRD R10, which is Stage 2. A
  third run would show it; the task asked for two, and a refusal is better
  read as a test than as a paragraph.

## D107 · Money is printed as pounds and pence beside the minor units — ACCEPTED (Andrea, 28 Oct)

- **Decision.** Every amount in the demo's output is rendered
  `£20.45 (2045 pence)`, by `money()` in `scripts/demo.ts`. `pounds()` does
  the conversion with integer arithmetic — `Math.trunc(minor / 100)` and
  `minor % 100` — and never produces a float.
- **Alternative.** Minor units only, which is what every number in the
  repository actually is. Or pounds only, which is what a person reads. Or
  `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })`.
- **Why.** Both halves are load-bearing for different readers: the pounds are
  what a person checks against the mandate they signed, and the pence are the
  only thing any field in this repository holds (D16). Printing one would make
  the other a translation the reader has to do. `Intl` is not used because its
  output depends on the runtime's ICU data and on the host locale's grouping
  and spacing, which would make the demo's text non-deterministic across
  machines (D103) for the sake of a thousands separator.
- **Cost.** Every amount costs about fifteen characters, so lines are longer
  than they would be otherwise, and the formatter is GBP-only: it hard-codes
  `£` and two decimal places, which is wrong for a zero-decimal currency and
  wrong for anything but Stage 1's single currency (D16). It is a demo
  formatter and lives in `scripts/`, not in `mandate/` or `merchant/`.

## D108 · The demo configures its merchant through `configFromEnvironment` — ACCEPTED (Andrea, 28 Oct)

- **Decision.** The demo exports the issuer's public key with
  `exportPublicKey()`, puts it in a synthetic environment object beside
  `ACR_MERCHANT_ID`, and reads both back with `configFromEnvironment(env)`.
  The policy is then built with `createMandatePolicy({ publicKey, clock })`
  rather than with `policyFor(config)`.
- **Alternative.** Hand the `KeyObject` straight to `createMandatePolicy`,
  skipping the environment entirely — the demo has the key pair in scope. Or
  set the variables on the real `process.env` so `configFromEnvironment()`
  reads them from there.
- **Why.** The export-to-string-and-import-back round trip is the one the
  shipped entry point makes (D60), and it is worth exercising: a demo that
  passed the key object directly would never catch an encoding that
  `importPublicKey` cannot read. A synthetic object rather than the real
  `process.env` because `configFromEnvironment` takes one for exactly this
  reason, and mutating the process environment in a function a test calls four
  times is a side effect waiting to leak. `policyFor` is not used because it
  takes no clock, and the frozen clock is what makes the output reproducible
  (D103).
- **Cost.** The policy is assembled in two steps where `policyFor(config)` is
  one, so a reader following the configuration path has to notice why the
  demo stops short of it. The `undefined` branch of
  `MerchantConfig.issuerPublicKey` also has to be handled in the demo even
  though the demo just put the key there, which is one unreachable-looking
  throw in `startMerchant()`.

## D109 · `scripts/demo.ts` is a module with an entry guard — ACCEPTED (Andrea, 28 Oct)

- **Decision.** `scripts/demo.ts` exports `runDemo(stream, options?)`, which
  returns a `DemoReport` of what both runs produced, and runs itself only
  under an `import.meta.url === process.argv[1]` guard — the shape T01's
  placeholder had (D03). `scripts/demo.test.ts` calls `runDemo()` with a
  collecting stream, so the tests drive the same code `npm run demo` does.
- **Alternative.** A script that writes to `console.log` and returns nothing,
  tested by spawning `npm run demo` and matching its stdout.
- **Why.** The demo is the PRD's S1 and S2 success criterion, so it needs
  tests that fail when it breaks — and a demo tested only through a spawned
  process can be asserted on only by pattern-matching its prose, which makes
  every wording change a test failure. Returning a report lets the assertions
  name the outcome, the order id and the audit outcomes, and keeps the text
  assertions to the few phrases that are themselves promises (that the
  confirmation is the human's step, that amounts carry both forms).
- **Cost.** `runDemo` has a return type that exists only for the tests, and
  the demo's own narration is checked by a handful of `toContain` assertions
  that will need updating when the wording changes — deliberately few, but not
  zero. The spawned-process path is not tested at all: nothing asserts that
  `npm run demo` exits 0, which is checked by hand in the fresh-clone run
  recorded in the pull request, and by CI only to the extent that the build
  compiles the file.

---

## T10 · Docs

D110 to D115 are T10's. All are PROPOSED: they are this task's own choices
about the documentation, and nothing here changes code or amends a ruled
entry.

## D110 · An index, not a consolidation — PROPOSED

- **Decision.** `docs/DECISIONS.md` is left exactly as it stands — no entry
  rewritten, reordered, renumbered or deleted, and no status changed — and
  `docs/DECISIONS_INDEX.md` is added beside it: a generated table of all 109
  entries with their ids, titles and statuses verbatim, a map of which entry
  amends which, and ten decisions picked out for a reader with five minutes.
  No cross-reference lines were appended to the amended entries either, though
  the task allowed them.
- **Alternative.** The literal reading of the T10 row: consolidate the file.
  Fold D21 into D06, D59 into D42 and D58, D90 to D93 into D70, D76 and D77,
  D94 to D99 into D48, D65 and D86 — which is what D21, D49, D58, D59 and the
  D90 preamble each explicitly invite T10 to do. Or the middle option: leave
  the entries alone but append "amended by D##" to each target.
- **Why.** Several of the entries a consolidation would fold together are
  *about* the fact that an earlier entry went stale and was amended rather than
  edited. D21 exists because a worker inserted a dated note into a ruled entry
  and pre-review was right that an insertion is not an append. D90 carries a
  correction made by the build lead from a diff, recording that the entry's
  first draft was wrong about what changed. D59's cost is a paragraph about the
  old name surviving in ruled entries above it. Folding those in would delete
  the evidence and leave a file that reads as though the decisions had been
  right first time — which is the opposite of what a reader judging this
  repository should see. The amendment chains are also only eight rows; they
  are a navigation problem, and an index solves navigation problems without
  touching the thing being navigated. The file is append-only by Andrea's
  ruling of 26 Oct, and "T10 consolidates it" is the one instruction in the
  queue that asks a worker to edit ruled entries — worth declining rather than
  doing quietly.
- **Cost.** The invitations in D21, D49, D58, D59 and D90 go unanswered, so a
  reader following any of them to "T10 consolidates this file" finds that it
  did not. `amount_not_integer_minor_units` therefore still appears in D58 as a
  name the repository no longer uses, and D06 still cites an SDK that D09
  replaced — both correct as ruled, both stale as code. A second file also has
  to be kept in step with the first: the index is generated from the headings,
  so the table survives an append, but the amendment map and the ten picks are
  hand-written and will drift if later tasks add entries without revisiting
  them. **This is the entry I would most like overruled if you read the T10 row
  literally** — the consolidation is a mechanical afternoon's work and the file
  would be shorter; I think it would also be less honest.

## D111 · Every claim is tied to a file or a decision, in brackets — PROPOSED

- **Decision.** Every statement in `ARCHITECTURE.md`, `SEQUENCE.md` and
  `MANDATE.md` about how the code behaves carries its source inline, in
  brackets: either the file that implements it (`merchant/pay.ts`) or the
  decision that ruled it (D98), usually both. Each section was written, then
  re-read against the code or the decision before it was kept. Where a claim
  could not be grounded it was cut rather than softened, and where a fact could
  not be established it is written UNVERIFIED and listed as such.
- **Alternative.** Prose with a short "see also" list per document, which reads
  better and is how most architecture documents are written. Or citing only the
  decisions, since they are the authority.
- **Why.** The failure mode this repository is most exposed to is a confident
  sentence about code that is wrong — a reader who clones it and finds the docs
  describing a different program stops trusting the whole thing, including the
  parts that are right. Inline citation makes a wrong claim *cheap to catch*:
  a reviewer sampling ten rows can check ten files. Citing the decision alone
  would not have been enough, and the audit of this task found why: in four
  places a ruled decision and the shipped code disagree, because a later
  decision changed the code and an older comment stayed (the list is in this
  task's pull request). A document citing only decisions would have reproduced
  all four errors faithfully.
- **Cost.** The prose is noisier than it would otherwise be, and a reader who
  trusts the documents does not need any of the brackets. The citations are
  also a maintenance surface of their own: a file renamed in Stage 2 leaves a
  dead reference in three documents, and nothing automated checks them —
  the compiler cannot see inside a code fence. Decision numbers are the stabler
  half of each citation, which is why most claims carry both.

## D112 · AP2 was re-opened for the mapping, not taken from SOURCES.md — PROPOSED

- **Decision.** The AP2 mapping in `docs/MANDATE.md` was written from pages
  opened on 2026-10-28, not from SOURCES.md's notes of 2026-10-27. Five pages
  were read: the specification and the Checkout Mandate, which SOURCES.md
  lists, plus the Payment Mandate, Agent Authorization and Implementation
  Considerations pages, which it does not. `MANDATE.md` §7 names all five,
  records the three places where the pages carry detail SOURCES.md does not,
  and marks three things UNVERIFIED rather than inferring them.
- **Alternative.** Build the mapping from SOURCES.md, which was written by T02
  for exactly this purpose, was verified by a worker that opened the URLs, and
  is one day old.
- **Why.** SOURCES.md's AP2 section is accurate and it is also not enough for a
  field-by-field mapping, because it was never meant to be: its Payment Mandate
  notes come from the *specification* page, which summarises the Payment
  Mandate and points at a dedicated page for the fields. That page — the one
  holding `transaction_id`, `payee`, `payment_amount`, `payment_instrument`,
  `pisp`, `execution_date` and `risk_data` — is not in SOURCES.md, so a mapping
  built from SOURCES.md alone would have had to guess at half the table or
  leave it blank. D10 asks for the gap to be *described*, and a description
  assembled from a summary of a summary would be the kind of unverified claim
  the factory rules forbid. Opening the pages also settled the PRD's open
  question about revocation, which no amount of re-reading SOURCES.md could
  have done.
- **Cost.** This task read pages SOURCES.md does not list, and SOURCES.md
  belongs to T02 and may not be edited here — so the repository now has a
  document citing sources its own source list does not carry. The three
  refinements and the two extra URLs are recorded in `MANDATE.md` §7 and in
  this task's pull request so that a later task can fold them into SOURCES.md,
  but until then the two files disagree about what has been read. A reader
  checking SOURCES.md for the Payment Mandate page will not find it.

## D113 · The docs count the policy checks as two gates and then seven — PROPOSED

- **Decision.** `ARCHITECTURE.md` and `MANDATE.md` both describe
  `checkMandate()` as **two gates, then seven checks**, with the seven listed
  by name and the window treated as one check with three possible reasons.
- **Alternative.** Count the gates among the checks and say "nine checks", or
  count each reason code separately and say "twelve". Or follow the demo's
  wording exactly — `scripts/demo.ts` prints "the seven checks, in the order
  they run" for `mandate/policy.ts`, naming the seven and leaving the gates
  implicit.
- **Why.** The demo's seven and the code's seven are the same seven: D42's own
  wording is "all seven scope and limit checks run", and the function has two
  gates above them. So "two gates, then seven checks" is the one phrasing that
  agrees with the demo, with D42 and with the code at the same time, while
  saying out loud the thing the demo's line leaves implicit. Counting twelve
  would be counting reason codes, not checks — three of the twelve belong to
  one window check and two to the gates — and a reader who counted the table
  rows against the refusal list would find the two numbers disagreeing with no
  explanation. The docs and the demo are read side by side, so they must not
  present two counts of one function.
- **Cost.** The demo's line still says "the seven checks" without mentioning
  the gates, so a reader going from the terminal to the docs meets seven and
  then nine things. `scripts/` is outside this task's directories, so the
  wording was not changed there; it is reported in the pull request instead. If
  it is ever edited, "the two gates and the seven checks" is the phrase that
  would match these documents.

## D114 · Known limits are one list in ARCHITECTURE.md, not scattered — PROPOSED

- **Decision.** Every gap in Stage 1 is stated in one section,
  `ARCHITECTURE.md` §6, each with the decision that ruled it: the unauthenticated
  agent id (D61), the in-memory ledger (D44), the double-spend window between
  check and record (D45), the stock refusal that leaves no audit entry (D65,
  D99), the credential held for fifteen minutes (D83), the declined card that
  ends the order (D84), concurrent confirmations granting two authorisations,
  the non-atomic paid-then-ledger step (D87, D98), `StdioServerCommand` having
  no `env` field (D105), and revocation as a non-goal. The two items T12 now
  owns — the test pinning `settle()`'s write order and the comment fix in
  `mandate/audit.ts` — are named there as accepted and scheduled rather than as
  open gaps.
- **Alternative.** Put each limit next to the mechanism it limits, so a reader
  of the audit-log section learns there what the audit log does not record.
  Or leave them in the decisions, where each already has a Cost paragraph
  saying the same thing.
- **Why.** The reader this repository is written for is judging whether the
  author understands the authorisation problem, and the fastest way to answer
  that is to see what the author says it does *not* do. Scattered through nine
  sections, those admissions read as caveats; collected, they read as an
  assessment — and a hiring manager with ten minutes can find the whole of it
  in one scroll. The decisions' Cost paragraphs are the authority but not the
  summary: there are 109 of them and the limits that matter are in ten. Several
  limits also belong to no single mechanism — the double-spend window is the
  policy and the ledger and the rail call together — so they have no obvious
  home anywhere else.
- **Cost.** Each limit is now stated twice, in the decision's Cost and in the
  list, and the two can drift: a later task that changes D84's behaviour will
  update the decision and may not update the list. The section is also long
  enough to be read as a catalogue of faults by a reader who skips the first
  sentence saying they are deliberate. And collecting them makes the weakest
  parts of the repository the easiest thing to find in it, which is the right
  trade for a reference implementation and would be the wrong one for a
  product.

## D115 · Code and comments that disagree with a decision are reported, not fixed — PROPOSED

- **Decision.** Four places where a code comment contradicts a ruled decision
  or the shipped behaviour were found while grounding these documents, and none
  was fixed. They are listed in this task's pull request, the documents describe
  the code as it actually behaves, and `ARCHITECTURE.md` says in its opening
  that where a file and a decision disagree the file wins.
- **Alternative.** Fix them — they are four comments, the changes are
  two-line edits, and leaving a known-wrong comment in a repository a hiring
  manager will read is a real cost. Or soften the documents to agree with both,
  which would mean writing a sentence that is true of neither.
- **Why.** T10's directories are `docs/` and the README status table. A docs
  task that edited `agent/order.ts` because it had found a stale comment would
  be doing exactly the thing that produced the stale comments: a worker making
  a small change outside its brief because it looked obviously right. One of
  the four is already owned by T12 (the `mandate/audit.ts` comment about the
  demo's stream, D102), which shows the factory's own route for this works.
  Reporting also puts the list in front of Andrea, who can hand it to a task
  with the right directories in one line, rather than burying four
  unreviewed edits in a docs pull request.
- **Cost.** The comments stay wrong until somebody schedules them, and three of
  the four have no task yet. A reader of `agent/order.ts` is told that nothing
  is paid there and that the merchant answers `approved`, both of which D88
  changed — and that reader has no reason to go looking for a pull request
  comment contradicting the file in front of them. That is a worse failure than
  a stale decision, because a comment sits where the code is read. The honest
  summary is that this decision is right about process and leaves a real defect
  in place; the list is the mitigation, and it is a weak one.
