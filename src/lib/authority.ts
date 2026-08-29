/**
 * Deterministic authority checks.
 *
 * A model-judged boolean is a hypothesis. A control is code.
 *
 * ResolutionSchema has `within_agent_authority`. The agent fills it in.
 * This file re-derives the $200 and $500 ceilings from the tool TRACE, and
 * where the arithmetic disagrees the arithmetic wins.
 */
import type { Resolution } from "../schemas.js";
import type { ToolCallRecord } from "../tools/index.js";

/** Clause 2.7 - an agent may refund up to this without a supervisor. */
export const AGENT_REFUND_LIMIT_USD = 200;

/** Clause 5.3 - cumulative refunds above this in 30 days escalate. */
export const THIRTY_DAY_REFUND_CEILING_USD = 500;

export interface AuthorityVerdict {
  allowed: boolean;
  violations: string[];
  corrected: Resolution;
}

const REFUND_ACTIONS = new Set(["issue_refund"]);

function priorRefunds30d(trace: ToolCallRecord[]): number | null {
  for (const call of trace) {
    if (call.tool !== "lookup_customer") continue;
    const out = call.output as { found?: boolean; refunds_last_30d_usd?: unknown } | null;
    if (out && out.found !== false && typeof out.refunds_last_30d_usd === "number") {
      return out.refunds_last_30d_usd;
    }
  }
  return null;
}

export function enforceAuthority(
  resolution: Resolution,
  trace: ToolCallRecord[],
): AuthorityVerdict {
  const violations: string[] = [];
  const amount = resolution.refund_amount_usd ?? 0;
  const isRefund = REFUND_ACTIONS.has(resolution.recommended_action);

  if (isRefund && amount > AGENT_REFUND_LIMIT_USD) {
    violations.push("refund_exceeds_agent_authority");
  }

  const prior = priorRefunds30d(trace);
  if (isRefund && prior === null) {
    violations.push("refund_without_customer_lookup");
  } else if (isRefund && prior !== null && prior + amount > THIRTY_DAY_REFUND_CEILING_USD) {
    violations.push("refund_exceeds_30d_ceiling");
  }

  if (isRefund && resolution.refund_amount_usd === null) {
    violations.push("refund_without_amount");
  }

  const allowed = violations.length === 0;

  if (!allowed && resolution.within_agent_authority) {
    violations.push("model_claimed_authority_it_lacked");
  }

  const corrected: Resolution = allowed
    ? resolution
    : {
        ...resolution,
        recommended_action: "escalate_to_supervisor",
        within_agent_authority: false,
        reasoning:
          `[Automatically escalated: ${violations.join(", ")}.] ` + resolution.reasoning,
      };

  return { allowed, violations, corrected };
}
