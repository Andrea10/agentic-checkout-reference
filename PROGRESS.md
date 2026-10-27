# PROGRESS.md

Worker log for agentic-checkout-reference. Append-only.

T02 claimed 2026-10-27T00:27:54Z

## T02 notes (2026-10-27)

Network access: available. All four required sources were opened with WebFetch and read;
no `UNVERIFIED` items and no `UNVERIFIED (no network)` markers are needed.

Sources opened and confirmed (UTC 2026-10-27):

- https://modelcontextprotocol.io/specification/2026-07-28 (current MCP revision)
- https://modelcontextprotocol.io/specification/2025-06-18 (prior revision, for the diff)
- https://github.com/modelcontextprotocol/typescript-sdk + raw main README
- https://github.com/agentic-commerce-protocol/agentic-commerce-protocol + raw main README
- https://ap2-protocol.org/ , /ap2/specification/ , /ap2/checkout_mandate/

URLs tried that do not exist (not listed in SOURCES.md): 
`modelcontextprotocol.io/specification/versions`, `ap2-protocol.org/topics/core-concepts/`,
`ap2-protocol.org/topics/mandates/` — all 404.

Deviation from the T02 worker prompt, step 1: the prompt says to confirm T01 is merged to
main. It is not — PR #2 (`task/T01`) was still open when this run started. TASKS.md lists
T02 as `depends: none` and `dirs: SOURCES.md only`, so there is no dependency and no file
overlap with T01, T03 or T06a. Rather than exit with nothing delivered, this run built
T02 on current main and flagged the condition at the top of the PR. Andrea's call whether
to merge PR #2 first; nothing in this PR requires it.

Not written here (T02 has no access to docs/DECISIONS.md): two PROPOSED decisions, on the
MCP TypeScript SDK major version and on the mandate vocabulary. Both are in the PR body.

T02 PR #4 opened 2026-10-27T00:30:59Z
