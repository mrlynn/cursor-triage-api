/**
 * Cursor Triage API - a teaching-grade reference service.
 *
 * Same four product routes as mrlynn/claude-triage-api, different primitives:
 *   POST /v1/triage    prompt-for-JSON, then Zod in our process
 *   POST /v1/resolve   local Agent + customTools, authority re-check in our code
 *   POST /v1/draft     Run.stream() as SSE
 *   POST /v1/estimate  usage after a run; no count_tokens
 *   GET  /v1/limits    Cursor.me() + documented rate limits
 */
import "./lib/env.js";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { PORT } from "./config.js";
import { assertCredentials } from "./lib/agent.js";
import { draftRoute } from "./routes/draft.js";
import { estimateRoute } from "./routes/estimate.js";
import { limitsRoute } from "./routes/limits.js";
import { resolveRoute } from "./routes/resolve.js";
import { triageRoute } from "./routes/triage.js";

export const app = new Hono();

app.use("*", logger());

app.get("/", (c) =>
  c.json({
    service: "cursor-triage-api",
    sibling: "https://github.com/mrlynn/claude-triage-api",
    runtime: "local Agent.create({ local: { cwd }, customTools })",
    routes: {
      "POST /v1/triage": "Classify a ticket. JSON is parsed and Zod-validated after the agent run.",
      "POST /v1/resolve": "Decide what to do with local custom tools, then re-check authority in code.",
      "POST /v1/draft": "Stream a customer-ready reply over SSE from run.stream().",
      "POST /v1/estimate": "Report usage after a run. Cursor has no pre-call count_tokens.",
      "GET /v1/limits": "Cursor.me() key info plus documented rate limits.",
      "GET /healthz": "Liveness.",
    },
    docs: "See README.md, docs/comparison.md, and curriculum/.",
  }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/v1/triage", triageRoute);
app.route("/v1/resolve", resolveRoute);
app.route("/v1/draft", draftRoute);
app.route("/v1/estimate", estimateRoute);
app.route("/v1/limits", limitsRoute);

app.notFound((c) => c.json({ error: "not_found", detail: "No such route." }, 404));

if (import.meta.url === `file://${process.argv[1]}`) {
  assertCredentials();
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`\n  cursor-triage-api  ->  http://localhost:${info.port}`);
    console.log("  runtime: local Agent.create\n");
  });
}
