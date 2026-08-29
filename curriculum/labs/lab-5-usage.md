# Lab 5 - Usage, cache tokens, getUsage

**Time:** 30 minutes · **Prerequisites:** Lab 1

## What Cursor reports

From the SDK Token usage section:

`run.usage` / `result.usage` is a `TokenUsage` summed across turns that
reported usage. It is `undefined` when no turn did.

Cache fields are on that object. You **do not** set `cache_control`. There
is **no** documented prompt-cache TTL on `Agent.send()`. The Claude twin's
Lab 5 is about placing a breakpoint so a 1,400-word handbook is reused. That
knob does not exist here. Cursor may still write and read a prompt cache
internally; you observe it after the fact.

`agent.getUsage()` is a different view: billed tokens and dollar cost across
the agent's runs. Cloud agents return a per-run breakdown; local agents
return a per-turn breakdown. `cost` is absent until it settles.
`chargedCents` is 0 for plan-included, BYOK, and credit-grant usage.

## What /v1/estimate does

It will not call a tokenizer that does not exist.

- Default body: explains the gap and lists the `TokenUsage` field names.
- `execute: true` + `message`: runs a local agent and returns `meta.usage`
  plus billed cost when available.
- `agent_id` (+ optional `run_id`): `Agent.getUsage()` without a new run.

`monthly_volume` is accepted so the request shape stays comparable to the
Claude twin. We will not multiply it by an invented $/MTok table.

## What to do

1. Read `src/lib/usage.ts` and `src/routes/estimate.ts`.
2. `POST /v1/estimate` with `{}` and read `honesty`.
3. After any triage call, `POST /v1/estimate` with that `meta.agent_id`.
4. Compare `meta.usage.cache_read_tokens` on two similar triage calls if you
   have budget. A zero is not a broken cache you can fix with a TTL flag.
   It is a number the runtime reported.

## Check

- [ ] You can separate `run.usage` (tokens, this run) from `getUsage()`
      (billed record).
- [ ] You did not look for `cache_control: { type: "ephemeral" }` in this
      codebase except as a "we do not set this" comment.
