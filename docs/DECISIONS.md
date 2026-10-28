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

D27 to D39 are PROPOSED and await a ruling. All thirteen come out of reading
four ACP files in full on 2026-10-28, under
`agentic-commerce-protocol/agentic-commerce-protocol/spec/2026-04-17/`:
`openapi/openapi.feed.yaml`, `json-schema/schema.feed.json`,
`openapi/openapi.agentic_checkout.yaml` and
`json-schema/schema.agentic_checkout.json`. Nothing below is a conformance
claim: the merchant speaks MCP, not ACP's HTTP endpoints, and these entries are
the list of places the two part company.

## D27 · ACP spec version 2026-04-17, not `unreleased` — PROPOSED (T06b)

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

## D28 · ACP vocabulary on the wire only; the internal types keep `*_minor` — PROPOSED (T06b)

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

## D29 · One ACP variant per catalogue product, with the same id — PROPOSED (T06b)

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

## D30 · `stock` leaves the product object; the quote line carries the number — PROPOSED (T06b)

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

## D31 · The two ACP files disagree on the low-stock word, and each object keeps its own — PROPOSED (T06b)

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

## D32 · The currency code stays upper case — PROPOSED (T06b)

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

## D33 · `list_products` returns the ACP `ProductsResponse` exactly: no `count`, no `currency` — PROPOSED (T06b)

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

## D34 · The cart keeps its own shape; the quote is the ACP checkout object — PROPOSED (T06b)

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

## D35 · Money in a quote is ACP `Total` entries, with the currency stated once — PROPOSED (T06b)

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

## D36 · No `tax` and no `fulfillment` lines at all, rather than zeros — PROPOSED (T06b)

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

## D37 · A quote is `ready_for_payment`, and an empty cart is refused — PROPOSED (T06b)

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

## D38 · A quote expires after fifteen minutes and is tied to one cart version — PROPOSED (T06b)

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

## D39 · Quotes are held server-side and addressed by `quote_id` — PROPOSED (T06b)

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

D40 to D49 are T04's. All are PROPOSED and await a ruling.

## D40 · Policy is a separate call; `verify()` keeps its signature-only contract — PROPOSED (T04)

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

## D41 · Three outcomes, not a boolean — PROPOSED (T04)

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

## D42 · Two gates, then every remaining check reported at once — PROPOSED (T04)

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

## D43 · Currency is checked before the caps, not after as PRD R2 lists them — PROPOSED (T04)

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

## D44 · Remaining budget lives in an injected `SpendLedger`, in memory for Stage 1 — PROPOSED (T04)

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

## D45 · Recording a spend is a separate call, made after the rail succeeds — PROPOSED (T04)

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

## D46 · `print()` takes its stream, and the lines are text, not JSON — PROPOSED (T04)

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

## D47 · A mandate whose own limits or window are unusable is refused, not thrown — PROPOSED (T04)

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

## D48 · The audit log records checks, not settlements — PROPOSED (T04)

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

## D49 · `mandate/` declares its own clock — PROPOSED (T04)

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
