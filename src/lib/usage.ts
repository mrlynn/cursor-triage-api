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
 * We do not maintain a per-model price table. Cursor bills through the
 * team's usage dashboard; inventing Claude-style $/MTok rates here would
 * be a lie.
 */
import type { AgentUsage, TokenUsage, UsageCost } from "@cursor/sdk";

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
