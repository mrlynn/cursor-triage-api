/**
 * POST /v1/draft - streamed reply over SSE.
 *
 * Uses run.stream() and maps:
 *   assistant text  -> event: text
 *   thinking        -> event: thinking
 *   usage           -> event: usage
 *   terminal        -> event: done  (usage, requestId, stop status)
 *
 * HTTP is already 200 once the stream starts, so errors go out as event: error.
 * Client disconnect cancels the Cursor run so we stop paying for unread tokens.
 */
import { Hono } from "hono";
import { collectBilled, createLocalAgent, runMeta } from "../lib/agent.js";
import { toHttpError } from "../lib/errors.js";
import { resolveModelSelection, UnknownModelError } from "../lib/models.js";
import { SSE_HEADERS, sseEvent } from "../lib/sse.js";
import { wrapUntrusted } from "../lib/untrusted.js";
import { buildPrompt, volatileContext } from "../prompts.js";
import { TicketInput } from "../schemas.js";

export const draftRoute = new Hono();

draftRoute.post("/", async (c) => {
  const parsedBody = TicketInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return c.json({ error: "invalid_request", detail: parsedBody.error.issues }, 400);
  }

  const ticket = parsedBody.data;

  let model;
  try {
    model = await resolveModelSelection(c.req.query("model"), c.req.query("optimize_for"));
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

  const encoder = new TextEncoder();
  const abortSignal = c.req.raw.signal;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      const agent = await createLocalAgent({ model });
      let run: Awaited<ReturnType<typeof agent.send>> | undefined;

      const onAbort = () => {
        void run?.cancel();
      };
      abortSignal.addEventListener("abort", onAbort);

      try {
        run = await agent.send(
          buildPrompt(
            "draft",
            wrapUntrusted(ticket.message),
            volatileContext({
              channel: ticket.channel,
              customerEmail: ticket.customer_email,
            }),
          ),
        );

        for await (const event of run.stream()) {
          switch (event.type) {
            case "assistant":
              for (const block of event.message.content) {
                if (block.type === "text") send("text", { text: block.text });
              }
              break;
            case "thinking":
              send("thinking", { text: event.text });
              break;
            case "usage":
              send("usage", event.usage);
              break;
            case "system":
            case "user":
            case "tool_call":
            case "status":
            case "task":
            case "request":
              break;
            default: {
              const _exhaustive: never = event;
              void _exhaustive;
            }
          }
        }

        const result = await run.wait();
        const billed = await collectBilled(agent);
        send("done", {
          status: result.status,
          request_id: result.requestId,
          result: result.result ?? "",
          meta: runMeta(run, { billed }),
        });
      } catch (err) {
        const { body: errorBody } = toHttpError(err);
        send("error", errorBody);
      } finally {
        abortSignal.removeEventListener("abort", onAbort);
        await agent[Symbol.asyncDispose]();
        controller.close();
      }
    },
    cancel() {
      // Stream cancelled by the client. The abort listener cancels the run.
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
});
