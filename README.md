# Cursor Triage API

A teachable sibling of
[mrlynn/claude-triage-api](https://github.com/mrlynn/claude-triage-api).
Same fictional company (Northwind Outfitters), same HTTP spine, same Zod
field names on classification and resolution. Different API.

Claude's twin teaches the Messages API: one endpoint, flags for structured
outputs, tools, streaming, and prompt cache.

This repo teaches Cursor's real offering: the
[TypeScript SDK](https://cursor.com/docs/sdk/typescript) (`Agent` + `Run`)
and the [Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints).
Those run agent workflows (workspace, tools, commands, edits). They are not
a chat-completions or Messages API. This service does not invent one.

Capability matrix and "when you would pick each":
[docs/comparison.md](docs/comparison.md).

## Quickstart

Node.js **22.13+** (required by `@cursor/sdk`).

```bash
npm install
cp .env.example .env
```

Set `CURSOR_API_KEY` from [Cursor Dashboard -> API Keys](https://cursor.com/dashboard)
(user or service-account key; Team Admin keys are not supported by the SDK).

```bash
npm run typecheck
npm test
npm run dev
```

`typecheck` and `test` do not need a key. `dev` listens on
`http://localhost:8787`.

```bash
curl -s localhost:8787/v1/triage -H 'content-type: application/json' -d '{
  "message": "Order NW-48211 arrived Monday and the zipper separated the second time I wore it. I want a replacement."
}' | jq
```

Full setup: [curriculum/setup.md](curriculum/setup.md).
Domain: [curriculum/scenario.md](curriculum/scenario.md).
Map: [curriculum/00-concept-map.md](curriculum/00-concept-map.md).

## The four routes

| Route | Product job | Cursor primitive |
|---|---|---|
| `POST /v1/triage` | Classification (`category`, `urgency`, `sentiment`, `summary`, `entities`, `requires_human`, `escalation_reason`, `confidence`) | Local `Agent.send`, then Zod in our process |
| `POST /v1/resolve` | Agentic lookup (order, customer, policy), then a recommended action **re-checked in our code** | `local.customTools` (local-only) + `enforceAuthority` |
| `POST /v1/draft` | Streamed reply for a human to read before sending | `run.stream()` as SSE |
| `POST /v1/estimate` | What this cost / used | `run.usage` / `agent.getUsage()` after or around a run. **No `count_tokens`.** |
| `GET /v1/limits` | Key info and published limits | `Cursor.me()` + documented rate-limit text |

Optional `?model=` must be an id from `Cursor.models.list()`. Unknown ids
return 400 with the live catalog. Router (`auto-smart` + `optimize_for`) is
only applied when that pair appears in the catalog.

Default runtime is **local**:
`Agent.create({ local: { cwd }, customTools })`. Custom tools do not work
on cloud. No-repo cloud agents are a later lab.

## Day 1 labs

| Lab | Topic |
|---|---|
| [0](curriculum/labs/lab-0-scoreboard.md) | Tiny eval baseline (3 cases) |
| [1](curriculum/labs/lab-1-first-call.md) | `Agent.create` + `send` + usage / `requestId` |
| [2](curriculum/labs/lab-2-structured-outputs.md) | You own the schema after the fact |
| [3](curriculum/labs/lab-3-tools.md) | Local `customTools` vs Claude tools; authority re-check |
| [4](curriculum/labs/lab-4-streaming.md) | `Run.stream` / SSE |
| [5](curriculum/labs/lab-5-usage.md) | Cache tokens, `getUsage`, no cache TTL knob |
| [6](curriculum/labs/lab-6-evals.md) | Deterministic score + optional judge |

## Out of scope for this slice

Docusaurus course site, Next storefront, Python track, cloud no-repo lab,
ticket-photo / vision path, Anthropic `cache_control` / Batches ports.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Watch the Hono server |
| `npm test` | Unit tests (no API key) |
| `npm run typecheck` | `tsc --noEmit` |

Live scoreboard (needs a key, spends money): `npx tsx evals/quick.ts`
