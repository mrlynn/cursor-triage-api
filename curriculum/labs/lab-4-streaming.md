# Lab 4 - Streaming: Run.stream / SSE

**Time:** 25 minutes · **Prerequisites:** Lab 1

## The comparison

Claude's twin uses `messages.stream()` and maps `text_delta` /
`thinking_delta` to SSE, then `finalMessage()` for usage.

Cursor gives you two layers:

1. `run.stream()` - normalized `SDKMessage` events (`assistant`, `thinking`,
   `tool_call`, `usage`, ...)
2. `onDelta` on `send()` - raw `InteractionUpdate` (`text-delta`,
   `thinking-delta`, tool-call deltas, `turn-ended`)

This route uses `run.stream()` and writes SSE:

| SDK event | SSE event |
|---|---|
| `assistant` text blocks | `text` |
| `thinking` | `thinking` |
| `usage` (per turn) | `usage` |
| after `wait()` | `done` with status, `request_id`, cumulative usage |

HTTP is already 200 once the stream starts. Failures go out as `event: error`.
If the client disconnects, we `run.cancel()`.

## What to do

1. Read `src/routes/draft.ts` and `src/lib/sse.ts`.
2. Optional live:

   ```bash
   curl -N localhost:8787/v1/draft -H 'content-type: application/json' -d '{
     "message": "Order NW-48211 zipper failed on the second wear. I want a replacement."
   }'
   ```

3. Notice usage may arrive as a mid-stream `usage` event *and* on `done`.
   The mid-stream event is per turn. `done.meta.usage` is cumulative
   (`run.usage`).

## Check

- [ ] You can name `run.stream()` vs `onDelta` and when you would pick each.
- [ ] You know a disconnect must cancel the Run.
