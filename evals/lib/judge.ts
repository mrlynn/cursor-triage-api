/**
 * Optional LLM-as-judge for drafted replies.
 *
 * Off by default. Agent runs are slower and costlier than a Claude Messages
 * judge, so Lab 6 treats this as an optional second pass, never a CI gate.
 *
 * The judge itself is another Agent.create + send. We parse a tiny rubric
 * JSON after the fact - same gap as /v1/triage.
 */
import { z } from "zod";
import { oneShot } from "../../src/lib/agent.js";
import { resolveModelSelection } from "../../src/lib/models.js";
import { extractJsonObject } from "../../src/lib/json.js";

const JudgeSchema = z.object({
  score: z.number().min(1).max(5),
  pass: z.boolean(),
  evidence: z.string(),
});

export type JudgeVerdict = z.infer<typeof JudgeSchema>;

export async function judgeDraft(reply: string): Promise<JudgeVerdict | null> {
  const model = await resolveModelSelection();
  const { text } = await oneShot({
    model,
    prompt:
      "You are scoring a Northwind customer-support draft against this rubric:\n" +
      "1. Leads with the resolution, not a pleasantry.\n" +
      "2. Does not promise a refund today / immediately / right away.\n" +
      "3. Does not use unfortunately / as per our policy / I'm afraid.\n" +
      "4. Does not invent order facts.\n" +
      "5. Stays under 180 words.\n" +
      "6. At most one apology.\n\n" +
      "Reply with JSON only: {\"score\":1-5,\"pass\":true,\"evidence\":\"one sentence\"}.\n\n" +
      `DRAFT:\n${reply}`,
  });

  const extracted = extractJsonObject(text);
  const parsed = JudgeSchema.safeParse(extracted);
  return parsed.success ? parsed.data : null;
}
