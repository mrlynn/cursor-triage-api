/**
 * POST /v1/resolve - capped agentic loop with order + policy lookup.
 *
 * Local customTools expose lookup_order, lookup_customer, and search_policy.
 * Custom tools are local-only; this route does not start a cloud agent.
 *
 * Cursor's Run owns the tool loop. We cap it in execute() (MAX_TOOL_CALLS)
 * and re-check the recommended action in OUR code via enforceAuthority.
 */
import { Hono } from "hono";
import { MAX_TOOL_CALLS } from "../config.js";
import { oneShot } from "../lib/agent.js";
import { toHttpError } from "../lib/errors.js";
import { resolveModelSelection, UnknownModelError } from "../lib/models.js";
import { parseResolutionOutput } from "../lib/parse-output.js";
import { applyResolveGuardrails } from "../lib/resolve-result.js";
import { wrapUntrusted } from "../lib/untrusted.js";
import { buildPrompt, volatileContext } from "../prompts.js";
import { TicketInput } from "../schemas.js";
import { createCustomTools, type ToolCallRecord } from "../tools/index.js";

export const resolveRoute = new Hono();

resolveRoute.post("/", async (c) => {
  const parsedBody = TicketInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json({ error: "invalid_request", detail: parsedBody.error.issues }, 400);
  }

  const ticket = parsedBody.data;
  const startedAt = Date.now();
  const trace: ToolCallRecord[] = [];

  try {
    const model = await resolveModelSelection(c.req.query("model"), c.req.query("optimize_for"));
    const { text, meta } = await oneShot({
      model,
      customTools: createCustomTools(trace),
      prompt: buildPrompt(
        "resolve",
        wrapUntrusted(ticket.message),
        volatileContext({
          channel: ticket.channel,
          customerEmail: ticket.customer_email,
        }),
      ),
    });

    const parsed = parseResolutionOutput(text);
    if (!parsed.ok) {
      return c.json(
        {
          error: parsed.error,
          detail: parsed.detail,
          raw: parsed.raw,
          tool_trace: trace,
          meta: {
            ...meta,
            iterations: trace.length,
            hit_iteration_cap: trace.length >= MAX_TOOL_CALLS,
            latency_ms: Date.now() - startedAt,
          },
        },
        502,
      );
    }

    const guarded = applyResolveGuardrails(parsed.data, trace, MAX_TOOL_CALLS);

    return c.json({
      resolution: guarded.resolution,
      tool_trace: guarded.tool_trace,
      meta: {
        ...meta,
        guardrails: guarded.guardrails,
        iterations: trace.length,
        hit_iteration_cap: guarded.guardrails.hit_tool_cap,
        latency_ms: Date.now() - startedAt,
        schema_enforcement: "after_the_fact_zod",
      },
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
