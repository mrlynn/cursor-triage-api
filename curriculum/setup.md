# Setup

## What you need

- **Node.js 22.13 or later.** `@cursor/sdk` requires it. This machine should
  print `v22.13.0` or higher from `node -v`.
- A **Cursor user API key** or **service-account key** from
  [Cursor Dashboard -> API Keys](https://cursor.com/dashboard).
- Team Admin API keys are not supported by the SDK. User and service-account
  keys work for local and cloud runs.

Spend shows up on the team's usage dashboard under the SDK tag. User keys
bill to that user's plan. Service-account keys bill to the owning team.

## Install

```bash
npm install
cp .env.example .env
```

Put the key in `.env` as `CURSOR_API_KEY`. That is the only required variable.
A real shell variable always wins over the file.

## Check the toolchain

```bash
npm run typecheck
npm test
```

Those two do not call Cursor. They cover Zod parse failure on `/v1/triage`
and the authority re-check on resolve.

## Run the service

```bash
npm run dev
```

The process listens on `http://localhost:8787` (override with `PORT`).

```bash
curl -s localhost:8787/healthz
curl -s localhost:8787/v1/limits | jq
```

`GET /v1/limits` calls `Cursor.me()`. If the key is wrong you will see
`upstream_auth_failed` (mapped from `AuthenticationError`).

A first triage call (this spends money and is slower than a Claude Messages
call):

```bash
curl -s localhost:8787/v1/triage -H 'content-type: application/json' -d '{
  "message": "Order NW-48211 arrived Monday and the zipper separated the second time I wore it. I want a replacement."
}' | jq
```

Optional: pin a model that `Cursor.models.list()` actually returned:

```bash
curl -s 'localhost:8787/v1/triage?model=composer-2.5' ...
```

If you pass an id that is not in the catalog, the route returns 400
`unknown_model` and lists the ids your key can see.

## If install fails

- Node too old: `@cursor/sdk` will refuse to load the local agent stack.
- Missing native helper: sandboxing needs the per-platform `@cursor/sdk--*`
  package. This slice leaves sandbox off (`sandboxOptions.enabled` defaults
  to false), so a missing helper should not block Day 1.
- Auth: generate a new user key from the dashboard. Do not commit `.env`.
