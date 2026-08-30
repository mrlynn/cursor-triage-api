/**
 * Token and billed-cost accounting for Cursor runs.
 *
 * Cursor TokenUsage (from run.usage / result.usage):
 *   inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
 *   totalTokens, reasoningTokens?
 *
 * Cursor reports cache tokens. You do not set cache_control. There is no
 * prompt-cache TTL knob in the SDK. Teach that, do not invent one.
 *
 * Token counts say nothing about dollars. For billed usage call
 * agent.getUsage(), which returns UsageCost { rawCostCents, chargedCents }
 * when cost has settled. cost is absent until it does.
 *
 * Cursor DOES publish per-token list prices, per model, including a cache-read
 * rate. See PUBLISHED_PRICES below. An earlier version of this file said the
 * opposite and refused to price a run at all; that was wrong, and it made the
 * cross-runtime cost comparison read as an apples-to-oranges gap when the two
 * sides can in fact be put on one basis.
 *
 * Two different numbers, and they are not interchangeable:
 *   estimatedCostUsd()  from the published list price. Reproducible, and it
 *                       is an ESTIMATE.
 *   agent.getUsage()    UsageCost { rawCostCents, chargedCents }. Settled
 *                       billing, absent until it settles, and it reflects
 *                       your actual plan and pools.
 */
import type { AgentUsage, TokenUsage, UsageCost } from "@cursor/sdk";

/**
 * Cursor's published list prices, USD per million tokens.
 *
 * Source: https://cursor.com/docs/models-and-pricing
 * Verified: 2026-08-30.
 *
 * Only the non-Fast tiers are listed. Fast is a different price and this
 * service does not request it, so quoting it here would price a run we did
 * not make. Cache WRITE is published as "-" for every model below, which is
 * why there is no cacheWrite field: absent, not zero, and not guessed.
 *
 * The first three are first-party (the "Cursor Models" pool). The Claude
 * entries are third-party and are here for ONE reason: `claude-opus-5` is in
 * Cursor's catalog, so the same model can be run through both primitives,
 * which is the only version of this comparison that is not confounded. On
 * Teams and Enterprise plans a third-party model also carries a $0.25/MTok
 * Cursor Token Rate, which estimatedCostUsd does NOT add — it is plan
 * dependent, and a per-plan surcharge does not belong in a list-price
 * estimate. Read it off getUsage() instead.
 */
export const CURSOR_TOKEN_RATE_PER_MTOK = 0.25;

export const PUBLISHED_PRICES: Record<
  string,
  { inputPerMTok: number; cacheReadPerMTok: number; outputPerMTok: number; firstParty: boolean }
> = {
  "grok-4.6": { inputPerMTok: 2, cacheReadPerMTok: 0.5, outputPerMTok: 6, firstParty: true },
  "grok-4.5": { inputPerMTok: 2, cacheReadPerMTok: 0.5, outputPerMTok: 6, firstParty: true },
  "composer-2.5": { inputPerMTok: 0.5, cacheReadPerMTok: 0.2, outputPerMTok: 2.5, firstParty: true },
  "claude-opus-5": { inputPerMTok: 5, cacheReadPerMTok: 0.5, outputPerMTok: 25, firstParty: false },
  "claude-sonnet-5": { inputPerMTok: 2, cacheReadPerMTok: 0.2, outputPerMTok: 10, firstParty: false },
  "claude-fable-5": { inputPerMTok: 10, cacheReadPerMTok: 1, outputPerMTok: 50, firstParty: false },
};

/**
 * List-price estimate for one run, or null when the model is not in the
 * table above.
 *
 * Null rather than 0. A model we have no published price for must not report
 * a free run — that is the failure the whole comparison harness exists to
 * avoid, and it would be indistinguishable from a genuinely cheap call.
 *
 * Cache WRITE tokens are billed at a rate Cursor publishes as "-", so they
 * are counted at the input rate here and that assumption is stated rather
 * than hidden. It is the conservative direction: it cannot make a run look
 * cheaper than it was.
 */
export function estimatedCostUsd(
  usage: UsageReport | null,
  modelId: string | null | undefined,
): { usd: number; assumed_cache_write_at_input_rate: boolean } | null {
  if (!usage || !modelId) return null;
  const price = PUBLISHED_PRICES[modelId];
  if (!price) return null;

  const perTok = (perMTok: number) => perMTok / 1_000_000;
  const usd =
    usage.input_tokens * perTok(price.inputPerMTok) +
    usage.cache_write_tokens * perTok(price.inputPerMTok) +
    usage.cache_read_tokens * perTok(price.cacheReadPerMTok) +
    usage.output_tokens * perTok(price.outputPerMTok);

  return {
    usd,
    assumed_cache_write_at_input_rate: usage.cache_write_tokens > 0,
  };
}

export interface UsageReport {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  reasoning_tokens: number | null;
  cache_hit: boolean;
}

export interface BilledCost {
  raw_cost_cents: number;
  charged_cents: number;
  charged_usd: number;
}

export function toUsageReport(usage: TokenUsage | undefined): UsageReport | null {
  if (!usage) return null;
  return {
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheReadTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    total_tokens: usage.totalTokens,
    reasoning_tokens: usage.reasoningTokens ?? null,
    cache_hit: usage.cacheReadTokens > 0,
  };
}

export function toBilledCost(cost: UsageCost | undefined): BilledCost | null {
  if (!cost) return null;
  return {
    raw_cost_cents: cost.rawCostCents,
    charged_cents: cost.chargedCents,
    charged_usd: Math.round(cost.chargedCents) / 100,
  };
}

export function summarizeAgentUsage(billed: AgentUsage | undefined): {
  usage: UsageReport | null;
  cost: BilledCost | null;
  runs: Array<{ run_id: string; usage: UsageReport | null; cost: BilledCost | null }>;
} | null {
  if (!billed) return null;
  return {
    usage: toUsageReport(billed.usage),
    cost: toBilledCost(billed.cost),
    runs: billed.runs.map((run) => ({
      run_id: run.runId,
      usage: toUsageReport(run.usage),
      cost: toBilledCost(run.cost),
    })),
  };
}
