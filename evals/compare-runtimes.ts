/**
 * The Cursor side of the cross-runtime comparison. `npm run eval:compare`
 *
 * Runs the three shared cases against this repo's /v1/triage and writes a
 * comparison envelope. The Claude twin
 * (https://github.com/mrlynn/claude-triage-api) runs the identical command
 * against its own service and writes its own envelope. Neither knows about
 * the other. The twin's `eval:compare:report` merges the two by case id.
 *
 * TEACHING NOTE — four disciplines this run enforces. Each one is easy to
 * skip, and each one invalidates the comparison when skipped:
 *
 *   1. CASES RUN SEQUENTIALLY. Latency is the headline of this comparison —
 *      an agent loop against one Messages call — so nothing runs in parallel
 *      beside it. Anything in flight would turn that column into a
 *      measurement of contention.
 *
 *   2. THE SET REPEATS. Three cases give a p95 drawn from three samples,
 *      which is not a p95. The sample count is written into the envelope so
 *      a reader can discount it themselves.
 *
 *   3. UNPARSEABLE IS NOT "WRONG". This is the finding the Cursor column
 *      exists to produce. Cursor has no output_config.format: /v1/triage
 *      prompts for the JSON contract and Zods the result in this process, so
 *      a reply that never becomes a TriageResult is a 502, not a coerced
 *      object. That is a different failure from a well-formed wrong answer,
 *      and collapsing the two into one pass/fail bit deletes the whole
 *      structured-outputs lesson.
 *
 *   4. COST CARRIES ITS BASIS. The dollars here come from agent.getUsage()
 *      chargedCents — settled billing, in cents, from Cursor. The Claude twin
 *      estimates from a checked-in $/MTok table. Both write their basis into
 *      the envelope, and the report refuses to difference figures whose bases
 *      differ. Do NOT multiply Claude list prices onto these tokens.
 *
 * Usage:
 *   npm run eval:compare
 *   npm run eval:compare -- --repeats 5
 *   npm run eval:compare -- --model composer-2.5
 */
import "../src/lib/env.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCredentials } from "../src/lib/agent.js";
import { app } from "../src/server.js";
import type { TriageResult } from "../src/schemas.js";
import { loadCases } from "./lib/score.js";
import {
  COMPARISON_CASE_IDS,
  DEFAULT_REPEATS,
  ENVELOPE_VERSION,
  metricsFor,
  projectCost,
  type ComparisonEnvelope,
  type EnvelopeCase,
} from "./lib/envelope.js";

const here = dirname(fileURLToPath(import.meta.url));

const RUNTIME = "cursor-agent";
const RUNTIME_LABEL = "Cursor Agent SDK";
const REPO = "https://github.com/mrlynn/cursor-triage-api";

/**
 * What this runtime cannot do, and why.
 *
 * Every line here is read off the docs cited in docs/comparison.md, not off
 * a memory of a marketing page. None of it is a defect: an agent SDK is not
 * trying to be a Messages API. The list exists so a reader never mistakes
 * "this API does not expose it" for "nobody bothered to measure it".
 */
const NOT_AVAILABLE: Record<string, string> = {
  api_constrained_schema:
    "There is no output_config.format. The JSON contract is prompted for and " +
    "validated by Zod in our own process, so schema adherence is a MEASURED rate " +
    "here and a structural near-certainty on the Claude twin.",
  pre_call_token_count:
    "No documented count_tokens equivalent. /v1/estimate refuses to invent one, so " +
    "admission control on predicted input size cannot be built on this runtime.",
  cache_control_breakpoints:
    "cacheReadTokens / cacheWriteTokens are REPORTED, but you do not place a " +
    "breakpoint and there is no documented TTL knob on send(). Observability maps; " +
    "control does not.",
  batch_discount:
    "No batch-inference API in the docs read for this repo. Cloud agents are a " +
    "different product — many VMs, not a half-price batch of classifications.",
  cloud_custom_tools:
    "local.customTools is local-only. On cloud the equivalent is an MCP server, not " +
    "this execute callback.",
  published_numeric_rate_limit:
    "Cloud Agents API is published as 'Standard rate limiting' with no number. We " +
    "surface Cursor.me() and the documented text rather than inventing a counter.",
};

function arg(name: string, fallback: string | null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function sdkVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    return String(pkg.dependencies?.["@cursor/sdk"] ?? "unknown");
  } catch {
    return "unknown";
  }
}

interface TriageBody {
  triage: TriageResult;
  meta: {
    model?: { id?: string };
    usage?: { total_tokens?: number } | null;
    billed?: { cost?: { charged_usd?: number } | null } | null;
  };
}

async function main(): Promise<void> {
  assertCredentials();

  const repeats = Math.max(1, Number(arg("repeats", String(DEFAULT_REPEATS))));
  const requestedModel = arg("model", null);
  const all = loadCases();
  const cases = COMPARISON_CASE_IDS.map((id) => {
    const found = all.find((c) => c.id === id);
    // A missing shared case is fatal, not skippable. Quietly running two of
    // three would produce an envelope the report happily merges against a
    // three-case Claude run, comparing different work under one heading.
    if (!found) throw new Error(`Comparison case ${id} is not in evals/dataset.jsonl.`);
    return found;
  });

  console.log(`\n${RUNTIME_LABEL} — ${cases.length} shared cases × ${repeats} repeats, sequential`);
  console.log(`model=${requestedModel ?? "(catalog default)"}  (latency is the measured variable; nothing runs in parallel)\n`);

  const rows: EnvelopeCase[] = [];
  let resolvedModel: string | null = requestedModel;

  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const testCase of cases) {
      const url = requestedModel
        ? `/v1/triage?model=${encodeURIComponent(requestedModel)}`
        : "/v1/triage";
      const started = Date.now();
      const res = await app.request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testCase.message }),
      });
      const latency = Date.now() - started;

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // 502 unparseable_output is the schema-adherence miss — the measured
        // cost of validating after the fact. Every other non-2xx is a
        // transport-or-config failure and is counted apart from it.
        const unparseable = res.status === 502 && body.error === "unparseable_output";
        rows.push({
          id: testCase.id,
          repeat,
          model: resolvedModel,
          outcome: unparseable ? "unparseable" : "transport_error",
          failures: [`HTTP ${res.status}: ${body.error ?? "unknown"}`],
          confidence: null,
          latency_ms: latency,
          total_tokens: null,
          cost_usd: null,
          notes: testCase.notes,
        });
        console.log(`  ${unparseable ? "UNPARSEABLE" : "ERROR"}  ${testCase.id}  r${repeat}  ${latency}ms`);
        continue;
      }

      const body = (await res.json()) as TriageBody;
      resolvedModel = body.meta.model?.id ?? resolvedModel;
      const got = body.triage;
      const want = testCase.expected;
      const failures: string[] = [];

      if (got.category !== want.category) failures.push(`category: want ${want.category}, got ${got.category}`);
      if (got.urgency !== want.urgency) failures.push(`urgency: want ${want.urgency}, got ${got.urgency}`);
      if (got.requires_human !== want.requires_human) {
        failures.push(`requires_human: want ${want.requires_human}, got ${got.requires_human}`);
      }
      if (got.entities.requested_remedy !== want.requested_remedy) {
        failures.push(`remedy: want ${want.requested_remedy}, got ${got.entities.requested_remedy}`);
      }

      // Billed cost settles asynchronously; absence is documented, not a
      // failure. A null here is carried through to the envelope rather than
      // defaulted to 0, which would read as "this run was free".
      const chargedUsd = body.meta.billed?.cost?.charged_usd ?? null;

      rows.push({
        id: testCase.id,
        repeat,
        model: resolvedModel,
        outcome: failures.length === 0 ? "pass" : "fail",
        failures,
        confidence: got.confidence,
        latency_ms: latency,
        total_tokens: body.meta.usage?.total_tokens ?? null,
        cost_usd: chargedUsd,
        notes: testCase.notes,
      });

      console.log(
        `  ${failures.length === 0 ? "PASS" : "FAIL"}  ${testCase.id}  r${repeat}  ` +
          `conf ${got.confidence.toFixed(2)}  ${latency}ms  ` +
          `${chargedUsd === null ? "cost pending" : `$${chargedUsd.toFixed(5)}`}`,
      );
      for (const f of failures) console.log(`        ${f}`);
    }
  }

  const priced = rows.map((r) => r.cost_usd).filter((n): n is number => n !== null);
  const cost = priced.length
    ? projectCost(
        priced.reduce((a, b) => a + b, 0) / priced.length,
        "agent.getUsage() chargedCents, converted to USD (settled billing, not an estimate)",
      )
    : null;

  if (!cost) {
    NOT_AVAILABLE.billed_cost_this_run =
      "agent.getUsage() returned no settled cost while this run was in flight. Cost " +
      "settles asynchronously; re-run later rather than reading the absence as zero.";
  }

  const metrics = metricsFor(rows, {
    schema_enforcement: "after_the_fact_zod",
    cost,
  });

  const envelope: ComparisonEnvelope = {
    envelope_version: ENVELOPE_VERSION,
    runtime: RUNTIME,
    runtime_label: RUNTIME_LABEL,
    repo: REPO,
    recorded_at: new Date().toISOString(),
    command: `npm run eval:compare -- --repeats ${repeats}${requestedModel ? ` --model ${requestedModel}` : ""}`,
    sdk: { name: "@cursor/sdk", version: sdkVersion() },
    node_version: process.version,
    model: resolvedModel,
    case_set: `comparison-${cases.length}`,
    repeats,
    cases: rows,
    metrics,
    not_available: NOT_AVAILABLE,
  };

  const outDir = join(here, "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `compare-${RUNTIME}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(outFile, `${JSON.stringify(envelope, null, 2)}\n`);

  console.log(
    `\naccuracy ${metrics.passed}/${metrics.total} · ` +
      `schema adherence ${(metrics.schema_adherence * 100).toFixed(1)}% (${metrics.unparseable} unparseable) · ` +
      `p50 ${metrics.latency_ms.p50}ms p95 ${metrics.latency_ms.p95}ms`,
  );
  if (cost) {
    console.log(`cost/ticket $${cost.per_ticket.toFixed(5)} → $${cost.monthly_projection.toFixed(0)}/mo @ 4,100/wk`);
    console.log(`  basis: ${cost.basis}`);
  } else {
    console.log("cost: not settled while this run was in flight — see not_available in the envelope");
  }
  console.log(`\nwritten: ${outFile}`);
  console.log(`next: merge it in the Claude twin with\n  npm run eval:compare:report -- <claude-envelope.json> ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
