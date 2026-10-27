# SOURCES.md

Every specification and document this design was taken from. Each URL below was opened
and read in full on the date given; nothing is listed that was not opened. Dates are UTC.

This repository is built from public specifications only. It makes no conformance claim
against any of them; divergences are recorded in `docs/DECISIONS.md`.

## Model Context Protocol (MCP)

### MCP specification, revision 2026-07-28 (current)

- URL: https://modelcontextprotocol.io/specification/2026-07-28
- Also read: https://modelcontextprotocol.io/specification/2026-07-28/basic and https://modelcontextprotocol.io/specification/2026-07-28/deprecated
- Read: 2026-10-27
- Takes: the JSON-RPC 2.0 host/client/server model and the **tools** server feature, which is the surface the merchant exposes (`list_products`, `get_product`, `create_cart`, `add_to_cart`, `get_quote`, `place_order`, `confirm_order`).

Notes: this revision describes the base protocol as "Stateless, self-contained requests"
with "Per-request capability negotiation", and lists server features as Resources,
Prompts and Tools. Client features are Elicitation, Sampling and Roots. Sampling and
Roots are **deprecated** as of this revision (SEP-2577) but remain in the specification
until at least the first revision released on or after 2027-07-28; new implementations
should not adopt them, so Elicitation is the only client feature this design would
consider. (Deprecation confirmed at `/specification/2026-07-28/deprecated`, read
2026-10-27.) It also defines opt-in extensions (Tasks, MCP Apps, Skills over MCP) that
this design does not use.

### MCP specification, revision 2025-06-18

- URL: https://modelcontextprotocol.io/specification/2025-06-18
- Read: 2026-10-27
- Takes: nothing directly; opened to pin down what changed, because the SDK v1.x line implements this revision rather than 2026-07-28.

Notes: this revision describes "Stateful connections" and "Server and client capability
negotiation", and offers Sampling, Roots and Elicitation as client features. The
stateful/stateless difference between the two revisions is the reason the SDK major
version is a decision and not a detail (see the PR for T02).

## MCP TypeScript SDK

- URL: https://github.com/modelcontextprotocol/typescript-sdk
- Also read: https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md
- Read: 2026-10-27
- Takes: `StdioServerTransport` for the merchant's stdio MCP server, and the client library for the buyer agent that drives it.

Notes: the `main` branch is **v2**, implementing the 2026-07-28 specification, and
publishes `@modelcontextprotocol/server` and `@modelcontextprotocol/client`
(`npm install @modelcontextprotocol/server`). The v1.x line lives on a separate branch.
Middleware packages exist for Express, Fastify, Hono and Node.js; the SDK runs on
Node.js, Bun and Deno.

## Agentic Commerce Protocol (ACP)

- URL: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- Also read: https://raw.githubusercontent.com/agentic-commerce-protocol/agentic-commerce-protocol/main/README.md
- Read: 2026-10-27
- Takes: the product-feed and checkout vocabulary that the merchant's product and checkout objects are shaped to, where it fits.

Notes: "The Agentic Commerce Protocol (ACP) is an interaction model and open standard for
connecting buyers, their AI agents, and businesses to complete purchases seamlessly."
Apache 2.0; OpenAI and Stripe are Founding Maintainers; the specification is marked beta.
Latest stable version is **2026-04-17**, laid out as `spec/2026-04-17/openapi/` and
`spec/2026-04-17/json-schema/`, with `openapi.agentic_checkout.yaml` and
`openapi.delegate_payment.yaml` as the two primary OpenAPI files. The surfaces named are
Agentic Checkout API, Delegate Payment API, Product Feed, Orders, Authentication and MCP
integration. Endpoint paths and product-feed field names are in the YAML and JSON Schema
files, not the README; T06b must read those files before shaping anything to them.

## AP2 mandate model

- URL: https://ap2-protocol.org/ap2/specification/
- Also read: https://ap2-protocol.org/ap2/checkout_mandate/ and https://ap2-protocol.org/
- Read: 2026-10-27
- Takes: the core idea this repository is built around — a cryptographically signed, scoped authorisation that the merchant verifies before any money-out, carrying constraints on merchant and contents.

Notes: "Agent Payments Protocol (AP2) is an open protocol for the emerging Agent Economy",
published by Google. Mandates are Verifiable Digital Credentials in **SD-JWT** format.
The current model has **two** mandate types, each with an open and a closed stage:

- **Checkout Mandate** — created by the Shopping Agent, rendered to the User by the
  Trusted Surface, verified by the Merchant. Closed form uses `vct` value
  `mandate.checkout.1` and carries `checkout_jwt` (the base64url-encoded merchant-signed
  JWT of the Checkout payload), `checkout_hash` (base64url-encoded hash of
  `checkout_jwt`), `iat` and `exp`. The open form uses `mandate.checkout.open.1` and
  carries constraints: `checkout.allowed_merchants` and `checkout.line_items`.
- **Payment Mandate** — authorises payment against a specific payment instrument, shared
  with the Credential Provider, networks and the Merchant Payment Processor. Bound to the
  checkout by hash; in autonomous mode it carries the agent's public key as `cnf`.
  The user signs open mandates, the agent signs closed ones, and verifiers confirm the
  closed mandate matches the constraints of the open one.

The mandate type names are **Checkout Mandate** and **Payment Mandate**. Earlier public
commentary on AP2 uses "Intent Mandate" and "Cart Mandate"; those names are not in the
specification as read on the date above, and this repository does not use them.
