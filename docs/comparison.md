# Claude API vs Cursor API, for this job

Northwind's product is four HTTP routes. The Claude twin
([mrlynn/claude-triage-api](https://github.com/mrlynn/claude-triage-api))
implements them on the Anthropic Messages API. This repo implements them on
Cursor's Agent SDK and Cloud Agents API.

Sources for the Cursor column, read for this slice:

- [Cursor APIs overview](https://cursor.com/docs/api) (2026 docs)
- [TypeScript SDK](https://cursor.com/docs/sdk/typescript)
- [Cloud Agents API endpoints](https://cursor.com/docs/cloud-agent/api/endpoints)

The Claude column is taken from the twin's public repo, not from memory of
marketing pages.

## Capability matrix

| Capability | Claude twin | Cursor (this repo) | Maps? |
|---|---|---|---|
| **Unit of work** | `POST /v1/messages` with flags | `Agent` + `Run` (`Agent.create`, `agent.send`) | Same product routes. Different primitive. |
| **Structured outputs** | `output_config.format` + `messages.parse()` | Prompt for JSON, then Zod in our process | **Does not map.** Teaching point, not a hidden bug. |
| **Tool use** | Messages `tools` / `toolRunner`, works wherever Messages works | `local.customTools` (local-only). Cloud: MCP servers, not this execute callback | **Partial.** Same idea (model calls your function). Cloud custom tools are not this API. |
| **Streaming** | `messages.stream()` token deltas | `run.stream()` `SDKMessage`, or `onDelta` `text-delta` | **Maps** as "stream the run," not as Messages events. |
| **Prompt cache** | You set `cache_control` breakpoints; ~1024 token minimum; TTL is provider-side ephemeral | `TokenUsage.cacheReadTokens` / `cacheWriteTokens` are reported. You do not set `cache_control`. No documented TTL knob on send() | **Observability maps. Control does not.** |
| **Token count before a call** | `messages.countTokens()` - free, no inference | Not documented. `/v1/estimate` refuses to invent one | **Does not map.** |
| **Usage after a call** | `usage` on the Message (`input_tokens`, cache write/read, `output_tokens`) | `run.usage` `TokenUsage`; dollars via `agent.getUsage()` (`rawCostCents`, `chargedCents`) | **Maps as "read usage," different field names and billing API.** |
| **Batch** | Anthropic Batches API (half rate; cache behavior differs) | No batch-inference API in the docs we read. Cloud agents are a different product (many VMs, not a half-price Messages batch) | **Does not map.** |
| **MCP** | Twin exposes an MCP server *of* the triage tools | Agents consume MCP (`mcpServers` on create/send; file-based `.cursor/mcp.json`; dashboard servers on cloud). Custom tools are registered *as* an MCP server named `custom-user-tools` | **Maps as "MCP is a first-class agent input."** The twin's "we *are* a server" lab is not this slice. |
| **Rate limits** | Twin reads Anthropic rate-limit headers from the last call | Overview table: Admin / Analytics / Bugbot have numbers. Cloud Agents API: "Standard rate limiting" (no number). Repositories: 1/user/min, 30/user/hour. 429 body documented on the overview | **Partial.** We surface `Cursor.me()` + the published text. We do not invent a remaining-request counter. |
| **Auth** | `ANTHROPIC_API_KEY` | `CURSOR_API_KEY` - user or service-account key from Dashboard -> API Keys. Basic (`key:`) or Bearer on Cloud Agents REST. Team Admin keys not supported by the SDK | **Maps as "one env var."** Different dashboard, different key types. |
| **Typed errors** | Anthropic `AuthenticationError`, `RateLimitError`, ... | `AuthenticationError`, `RateLimitError`, `AgentBusyError`, `ConfigurationError`, `NetworkError`, ... all extend `CursorSdkError` | **Maps.** `/v1/resolve` can also see `agent_busy` (cloud 409) which Messages does not have. |
| **Models** | Twin hardcodes a small Claude catalog + list prices | `Cursor.models.list()` / `GET /v1/models`. Router is `auto-smart` + `optimize_for` only when listed | **Do not copy the other catalog.** The live one includes third-party entries, `claude-opus-5` among them. |
| **Vision / images** | Twin accepts a ticket photo as a Messages content block | SDK `send({ text, images })` exists. This slice does not ship the attachment field | Out of scope here. |
| **No-repo cloud agents** | n/a | `cloud: { repos: [] }` on an enabled account | Later lab. Not required to boot locally. |

## What maps, in one paragraph

If you already teach Northwind on Claude, keep the HTTP spine and the Zod
field names. Keep the handbook, the fake OMS, and `enforceAuthority`. Swap
the client: you are no longer sending one Messages request with flags. You
are creating an Agent against a workspace and submitting Runs. Streaming,
usage, auth, and "the model called my function" still exist. They attach to
Agent/Run, not to `output_config` / `cache_control` / `count_tokens`.

## What does not map

Constrained decoding. Pre-call token count. A cache breakpoint you place.
A half-price batch of classifications. Custom tool callbacks on a cloud VM.
A published numeric Cloud Agents rate-limit you can put on a slide without
hedging.

## When you would pick each API for this job

**Pick the Claude Messages API** when the job is classify / draft / cheap
tool loop against your own HTTP backend, you need a JSON schema the API
enforces, you need `count_tokens` for admission control, or you need a
prompt-cache breakpoint on a stable handbook. That is most of Northwind
triage.

**Pick the Cursor Agent SDK** when the job is "run the Cursor agent": a
workspace, repo edits, shell, MCP, cloud VMs, PR creation, or a local loop
that should share the same interface as cloud. Support triage *can* sit on
that agent, which is why this repo exists as a comparison. It is a heavier
primitive. You will parse JSON yourself, pay agent-run latency, and you will
not get a free tokenizer.

**Pick both, side by side,** when the lesson is the difference. That is the
point of these two repos.

## Costs are comparable now, on one basis

An earlier version of this page said we would not run a cost bake-off because
Cursor billed only through a usage dashboard. That was wrong. Cursor publishes
per-token list prices per model, cache-read rate included, at
[Models & Pricing](https://cursor.com/docs/models-and-pricing) — so both sides
of this comparison can be priced from a published table and the two estimates
can honestly be set beside each other. `src/lib/usage.ts` carries that table
with the date it was verified.

Two cautions survive the correction. A list-price estimate is still not an
invoice: it excludes plan discounts and included-usage pools, which is why
`agent.getUsage()` remains the truer number for your own account and why the
envelope tags each figure with a `basis_kind` rather than letting the report
subtract one from the other. And on Teams and Enterprise plans a third-party
model adds a $0.25/MTok Cursor Token Rate on top of its API price — a real
cost, plan-dependent, and deliberately left out of the list-price estimate.

## The confound worth naming

`claude-opus-5` is in Cursor's catalog. That makes one run possible that no
amount of argument replaces:

```bash
npm run eval:compare -- --model claude-opus-5
```

Run that here and on the twin, and the model is fixed while the primitive
varies. Compare each side's *default* instead — grok-4.6 here against
claude-opus-5 there — and two variables move at once while the conclusion
names only one of them.

## What this slice will not claim

We have not run the bake-off yet, only made it possible. We did not copy
Claude list prices onto Cursor tokens; the Cursor figures come from Cursor's
own published table. We did not invent a Cloud Agents requests-per-minute
number. Every figure that lands here should check in the command that
produced it.
