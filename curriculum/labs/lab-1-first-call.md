# Lab 1 - First call: Agent.create + send + usage / requestId

**Time:** 25 minutes · **Prerequisites:** Lab 0, a live `CURSOR_API_KEY`

## Why this matters

Claude's first call is `messages.create`. Cursor's first call is
`Agent.create` then `agent.send`. If you skip that difference, every later
lab will feel like a missing `max_tokens` flag.

## What to do

Open `src/lib/agent.ts`. Read `createLocalAgent` and `oneShot` in that order.

The shape, from the
[TypeScript SDK docs](https://cursor.com/docs/sdk/typescript):

```ts
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model, // required for local; discover via Cursor.models.list()
  tools: [],
  local: { cwd },
});

const run = await agent.send(prompt);
const result = await run.wait();

console.log(run.requestId);
console.log(result.usage);
await agent[Symbol.asyncDispose]();
```

Then start the server and make one triage call (see [setup.md](../setup.md)).

On the response, find:

| Field | Where it comes from |
|---|---|
| `meta.agent_id` | `agent.agentId` (`agent-` prefix for local) |
| `meta.run_id` | `run.id` |
| `meta.request_id` | Platform UUID on `Run` and `RunResult`. Log this with errors. |
| `meta.usage` | `run.usage` / `result.usage` (`TokenUsage`) |
| `meta.billed` | `agent.getUsage()` when cost has settled; may be null |

`TokenUsage` fields, quoted from the SDK docs:

- `inputTokens` - prompt tokens sent to the model
- `outputTokens` - tokens generated
- `cacheReadTokens` - tokens served from the prompt cache
- `cacheWriteTokens` - tokens written to the prompt cache
- `totalTokens` - sum of the four above. Excludes `reasoningTokens`.
- `reasoningTokens` - subset of `outputTokens`. Omitted when not reported.

Token counts are not dollars. `getUsage()` returns `UsageCost`
(`rawCostCents`, `chargedCents`) when billing has settled.

## Check

- [ ] You can point at Agent vs Run in `src/lib/agent.ts`.
- [ ] You logged a `request_id` from a real response (or from the type if you
      are offline).
- [ ] You did not look for `stop_reason: max_tokens`. That is a Messages
      concept. A Cursor run ends with `status: finished | error | cancelled`.
