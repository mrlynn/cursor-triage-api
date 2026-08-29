/**
 * POST /v1/triage - classification.
 *
 * Cursor has no output_config.format. We send a prompt that asks for the
 * JSON contract, then parse + Zod-validate in this process. A parse miss
 * is 502 unparseable_output, not a coerced object.
 *
 * Optional ?model= uses ids from Cursor.models.list(). Optional
 * ?optimize_for= is applied only when the catalog lists auto-smart with
 * that parameter.
 */
import { Hono } from "hono";
import { oneShot } from "../lib/agent.js";
import { toHttpError } from "../lib/errors.js";
import { resolveModelSelection, UnknownModelError } from "../lib/models.js";
import { parseTriageOutput } from "../lib/parse-output.js";
import { wrapUntrusted } from "../lib/untrusted.js";
import { buildPrompt, volatileContext } from "../prompts.js";
import { TicketInput } from "../schemas.js";

export const triageRoute = new Hono();

triageRoute.post("/", async (c) => {
  const parsedBody = TicketInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json(
      { error: "invalid_request", detail: parsedBody.error.issues },
      400,
    );
  }

  const ticket = parsedBody.data;
  const startedAt = Date.now();

  try {
    const model = await resolveModelSelection(c.req.query("model"), c.req.query("optimize_for"));
    const { text, meta } = await oneShot({
      model,
      prompt: buildPrompt(
        "triage",
        wrapUntrusted(ticket.message),
        volatileContext({
          channel: ticket.channel,
          customerEmail: ticket.customer_email,
        }),
      ),
    });

    const parsed = parseTriageOutput(text);
    if (!parsed.ok) {
      return c.json(
        {
          error: parsed.error,
          detail: parsed.detail,
          raw: parsed.raw,
          meta: { ...meta, latency_ms: Date.now() - startedAt },
        },
        502,
      );
    }

    return c.json({
      triage: parsed.data,
      meta: {
        ...meta,
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
