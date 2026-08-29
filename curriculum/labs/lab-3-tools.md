# Lab 3 - Tools: local customTools vs Claude tools

**Time:** 40 minutes · **Prerequisites:** Lab 2

## The comparison

Claude's twin registers tools on the Messages request and drives
`toolRunner` with `max_iterations: 8`. The SDK loops `stop_reason ===
tool_use` for you.

Cursor custom tools are functions you pass on `local.customTools`. The SDK
registers them as an MCP server named `custom-user-tools`. They run in *your*
process. They are **local-only**. Passing them to a cloud agent throws
`ConfigurationError`.

There is no `max_iterations` on `send()`. This repo caps calls inside
`execute` (`MAX_TOOL_CALLS` in `src/config.ts`). After the cap, the next
tool returns an error string telling the agent to answer.

Built-in tools (shell, edit, write) are offered by default on a local agent.
This service passes `tools: []` so a support ticket does not start rewriting
the repo. Custom tools still work unless you also disallow `"mcp"`.

## Authority is still your code

The agent recommends `issue_refund` and sets `within_agent_authority`.
`enforceAuthority` in `src/lib/authority.ts` re-reads the tool TRACE:

- Clause 2.7: a single refund above $200 escalates
- Clause 5.3: prior 30-day refunds + this amount above $500 escalates
- A refund with no `lookup_customer` result is unverifiable
- If the model claimed authority it lacked, that is a separate violation

The HTTP field `resolution` is the **corrected** object. Tests in
`src/lib/authority.test.ts` prove this without a key.

## What to do

1. Read `src/tools/definitions.ts` (when to call each tool) and
   `src/tools/index.ts` (the execute wrapper + cap).
2. Read `src/lib/resolve-result.ts`. `applyResolveGuardrails` is what the
   route returns.
3. Run:

   ```bash
   npx tsx --test src/lib/authority.test.ts
   ```

4. Optional live: `POST /v1/resolve` with the zipper ticket and
   `customer_email` `dana.k@example.com`. Inspect `tool_trace` and
   `meta.guardrails`.

## Check

- [ ] You can say "custom tools are local-only" without hedging.
- [ ] You know the corrected resolution is the one in `resolution`, not a
      sibling you might forget to read.
