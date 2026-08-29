/**
 * Central configuration.
 *
 * Model ids are NOT a hardcoded catalog. Cursor's documented contract is
 * `Cursor.models.list()` (and GET /v1/models). See src/lib/models.ts.
 *
 * Local Agent.create() requires a model selection. When the caller omits
 * `?model=`, we pick from the live catalog (composer-2.5 if present, otherwise
 * the first listed id, otherwise the documented `{ id: "auto" }` fallback).
 * We never invent Router (`auto-smart` + `optimize_for`) unless the catalog
 * actually lists it.
 */

import { fileURLToPath } from "node:url";

export const PORT = Number(process.env.PORT ?? 8787);

/** Project root: local agents run with this cwd. */
export const WORKSPACE_CWD = fileURLToPath(new URL("..", import.meta.url));

/**
 * Hard ceiling on custom-tool executions inside one /v1/resolve run.
 *
 * Cursor's Run is one `agent.send()`, and the SDK owns the internal tool
 * loop. There is no `max_iterations` field on send(). The cap lives in OUR
 * execute wrappers: after this many calls, further tools return an error
 * telling the agent to stop and answer.
 */
export const MAX_TOOL_CALLS = 8;

/**
 * Documented API rate limits that apply to this service's upstream.
 *
 * Source: https://cursor.com/docs/api (Rate Limits by API) and
 * https://cursor.com/docs/cloud-agent/api/endpoints (List GitHub Repositories).
 *
 * Cloud Agents API is published as "Standard rate limiting" with no numeric
 * quota on that page. Do not invent one.
 */
export const DOCUMENTED_RATE_LIMITS = {
  cloud_agents_api: {
    scope: "All Cloud Agents API endpoints",
    published: "Standard rate limiting",
    numeric_quota: null,
    source: "https://cursor.com/docs/api",
  },
  repositories: {
    scope: "GET /v1/repositories",
    published: "1 request / user / minute, and 30 / user / hour",
    numeric_quota: { per_user_per_minute: 1, per_user_per_hour: 30 },
    source: "https://cursor.com/docs/cloud-agent/api/endpoints",
  },
} as const;
