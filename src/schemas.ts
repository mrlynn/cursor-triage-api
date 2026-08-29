/**
 * Zod schemas that are the HTTP product contract.
 *
 * Field names match the Claude twin (mrlynn/claude-triage-api) so a storefront
 * can point at either backend. The difference is enforcement:
 *
 *   Claude:  output_config.format = zodOutputFormat(TriageSchema)
 *            plus client.messages.parse()
 *   Cursor:  the prompt asks for this JSON, then YOUR code parses and
 *            Zod-validates the agent text. That gap is a teaching point.
 */
import { z } from "zod";

export const CategoryEnum = z.enum([
  "billing",
  "shipping",
  "product_defect",
  "returns",
  "account",
  "safety",
  "other",
]);
export type Category = z.infer<typeof CategoryEnum>;

export const UrgencyEnum = z.enum(["low", "normal", "high", "urgent"]);
export type Urgency = z.infer<typeof UrgencyEnum>;

export const TriageSchema = z.object({
  category: CategoryEnum.describe(
    "The single best-fitting category, using the definitions in section 8 of the policy handbook.",
  ),
  urgency: UrgencyEnum.describe(
    "Urgency per the definitions in section 8. Safety reports are always 'urgent'.",
  ),
  sentiment: z
    .enum(["angry", "frustrated", "neutral", "positive"])
    .describe("The customer's emotional register, not the severity of the issue."),
  summary: z
    .string()
    .describe(
      "One sentence, under 25 words, stating what the customer wants. Written for an agent skimming a queue.",
    ),
  entities: z
    .object({
      order_ids: z
        .array(z.string())
        .describe("Order identifiers mentioned, verbatim (e.g. 'NW-48211'). Empty array if none."),
      product_names: z
        .array(z.string())
        .describe("Product names mentioned. Empty array if none."),
      requested_remedy: z
        .enum(["refund", "replacement", "information", "cancellation", "escalation", "none"])
        .describe("What the customer explicitly asked for, not what you think they should get."),
    })
    .describe("Structured facts lifted from the message with no inference."),
  requires_human: z
    .boolean()
    .describe(
      "True if policy section 5.3 mandates supervisor escalation, or if a confident automated reply is not possible.",
    ),
  escalation_reason: z
    .string()
    .nullable()
    .describe("Why a human is required, or null when requires_human is false."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Your calibrated confidence in this classification. Use the full range - a genuinely ambiguous ticket should score near 0.5, not 0.9.",
    ),
});
export type TriageResult = z.infer<typeof TriageSchema>;

/** The resolution plan produced by the tool-using agent in /v1/resolve. */
export const ResolutionSchema = z.object({
  recommended_action: z
    .enum([
      "issue_refund",
      "ship_replacement",
      "provide_information",
      "decline_with_goodwill",
      "escalate_to_supervisor",
    ])
    .describe("The single action the agent should take."),
  policy_citations: z
    .array(z.string())
    .describe(
      "Specific handbook clause numbers that justify the action, e.g. ['2.2', '5.3']. Never cite a clause you did not read via the search_policy tool.",
    ),
  refund_amount_usd: z
    .number()
    .nullable()
    .describe("Dollar amount when recommending a refund, otherwise null."),
  within_agent_authority: z
    .boolean()
    .describe("False if the action exceeds the $200 agent refund authority in clause 2.7."),
  reasoning: z
    .string()
    .describe("Two or three sentences an agent can read before acting. Reference the facts you looked up."),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

export const TicketInput = z.object({
  message: z.string().min(1, "message is required").max(20_000),
  customer_email: z.string().email().optional(),
  channel: z.enum(["email", "chat", "phone_transcript"]).default("email"),
});
export type Ticket = z.infer<typeof TicketInput>;

export const EstimateInput = z.object({
  message: z.string().min(1).max(200_000).optional(),
  role: z.enum(["triage", "resolve", "draft"]).default("triage"),
  monthly_volume: z.number().int().positive().max(100_000_000).default(10_000),
  /**
   * When true, actually run an agent and report TokenUsage + billed cost.
   * Cursor has no pre-call count_tokens equivalent; this is the honest path.
   */
  execute: z.boolean().default(false),
  /** Fetch billed usage for an existing agent instead of starting a new run. */
  agent_id: z.string().min(1).optional(),
  /** Optional run id to pass to agent.getUsage({ runId }). */
  run_id: z.string().min(1).optional(),
});
export type EstimateRequest = z.infer<typeof EstimateInput>;
