/**
 * Apply deterministic controls to a parsed resolution.
 *
 * Extracted so tests can exercise the authority re-check without a live
 * Cursor run. The HTTP route returns verdict.corrected, not the model's
 * original recommendation.
 */
import { enforceAuthority, type AuthorityVerdict } from "./authority.js";
import { verifyCitations, type CitationReport } from "./citations.js";
import type { Resolution } from "../schemas.js";
import type { ToolCallRecord } from "../tools/index.js";

export interface GuardedResolution {
  resolution: Resolution;
  tool_trace: ToolCallRecord[];
  guardrails: {
    authority_allowed: boolean;
    authority_violations: string[];
    unsupported_citations: string[];
    cited_without_search: string[];
    policy_searched: boolean;
    hit_tool_cap: boolean;
    tool_calls: number;
  };
  citations: CitationReport;
  authority: AuthorityVerdict;
}

export function applyResolveGuardrails(
  resolution: Resolution,
  trace: ToolCallRecord[],
  maxToolCalls: number,
): GuardedResolution {
  const authority = enforceAuthority(resolution, trace);
  const citations = verifyCitations(resolution.policy_citations, trace);

  return {
    resolution: authority.corrected,
    tool_trace: trace,
    guardrails: {
      authority_allowed: authority.allowed,
      authority_violations: authority.violations,
      unsupported_citations: citations.unsupported,
      cited_without_search: citations.cited_without_search,
      policy_searched: citations.searched,
      hit_tool_cap: trace.length >= maxToolCalls,
      tool_calls: trace.length,
    },
    citations,
    authority,
  };
}
