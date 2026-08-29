/**
 * POST /v1/estimate - what this costs / used, after or around a run.
 *
 * Cursor has no messages.countTokens and no documented pre-call tokenizer.
 * This route will not invent one.
 *
 * Honest modes:
 *   1. Default: explain the gap and the fields a finished Run reports.
 *   2. execute: true + message: run a local agent and return run.usage plus
 *      agent.getUsage() billed cost when settled.
 *   3. agent_id (+ optional run_id): Agent.getUsage() without a new run.
 */
import { Agent } from "@cursor/sdk";
import { Hono } from "hono";
import { oneShot } from "../lib/agent.js";
import { toHttpError } from "../lib/errors.js";
import { resolveModelSelection, UnknownModelError } from "../lib/models.js";
import { summarizeAgentUsage } from "../lib/usage.js";
import { wrapUntrusted } from "../lib/untrusted.js";
import { buildPrompt, volatileContext } from "../prompts.js";
import { EstimateInput } from "../schemas.js";

export const estimateRoute = new Hono();

const TOKEN_USAGE_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "totalTokens",
  "reasoningTokens?",
] as const;

estimateRoute.post("/", async (c) => {
  const parsedBody = EstimateInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json({ error: "invalid_request", detail: parsedBody.error.issues }, 400);
  }

  const { message, role, monthly_volume, execute, agent_id, run_id } = parsedBody.data;

  const honesty = {
    pre_call_count_tokens: false,
    note:
      "Cursor has no documented count_tokens / tokenizer endpoint. TokenUsage " +
      "arrives on run.usage after a run. Cache tokens are reported " +
      "(cacheReadTokens, cacheWriteTokens); you do not set cache_control and " +
      "there is no prompt-cache TTL knob. Dollars come from agent.getUsage() " +
      "once cost settles (rawCostCents / chargedCents). chargedCents is 0 for " +
      "plan-included, BYOK, and credit-grant usage.",
    token_usage_fields: TOKEN_USAGE_FIELDS,
    monthly_volume_note:
      "monthly_volume is accepted so the request shape stays comparable to " +
      "the Claude twin. We will not multiply an invented $/MTok table by it.",
    monthly_volume,
  };

  try {
    if (agent_id) {
      const billed = await Agent.getUsage(agent_id, run_id ? { runId: run_id } : undefined);
      return c.json({
        inference_performed: false,
        source: "agent.getUsage",
        agent_id,
        run_id: run_id ?? null,
        billed: summarizeAgentUsage(billed),
        honesty,
      });
    }

    if (execute) {
      if (!message) {
        return c.json(
          {
            error: "invalid_request",
            detail: "execute:true requires a message so there is something to run.",
          },
          400,
        );
      }

      const model = await resolveModelSelection(c.req.query("model"), c.req.query("optimize_for"));
      const { text, meta } = await oneShot({
        model,
        prompt: buildPrompt(
          role,
          wrapUntrusted(message),
          volatileContext({ channel: "email" }),
        ),
      });

      return c.json({
        inference_performed: true,
        source: "run.usage + agent.getUsage",
        preview: text.slice(0, 240),
        meta,
        honesty,
      });
    }

    return c.json({
      inference_performed: false,
      source: null,
      how_to_get_numbers: [
        "POST again with execute:true and a message to run a local agent and read usage.",
        "POST with agent_id (and optional run_id) to read billed usage for an existing agent.",
        "Read meta.usage on /v1/triage, /v1/resolve, or the done event from /v1/draft.",
      ],
      honesty,
    });
  } catch (err) {
    if (err instanceof UnknownModelError) {
      return c.json(
        { error: "unknown_model", detail: err.message, known_models: err.knownIds },
        400,
      );
    }
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});
