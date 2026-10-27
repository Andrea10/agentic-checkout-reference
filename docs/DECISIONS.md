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
