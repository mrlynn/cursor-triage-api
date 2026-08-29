/**
 * Citation verification - existence, not interpretation.
 *
 * The handbook is already in the prompt, so citing 2.7 without a matching
 * search_policy call is legitimate. The check is: does the clause exist?
 * cited_without_search is a diligence signal, not a violation.
 */
import type { ToolCallRecord } from "../tools/index.js";
import { POLICY_HANDBOOK } from "../tools/data.js";

export interface CitationReport {
  cited: string[];
  unsupported: string[];
  cited_without_search: string[];
  searched: boolean;
}

const CLAUSE_PATTERN = /\b\d{1,2}\.\d{1,2}\b/g;

const REAL_CLAUSES: ReadonlySet<string> = new Set(
  [...POLICY_HANDBOOK.matchAll(CLAUSE_PATTERN)].map((m) => m[0]),
);

function clausesSeenInTrace(trace: ToolCallRecord[]): Set<string> {
  const seen = new Set<string>();
  for (const call of trace) {
    if (call.tool !== "search_policy") continue;
    const text = typeof call.output === "string" ? call.output : JSON.stringify(call.output);
    for (const match of text.matchAll(CLAUSE_PATTERN)) seen.add(match[0]);
  }
  return seen;
}

export function verifyCitations(
  citations: string[],
  trace: ToolCallRecord[],
): CitationReport {
  const seen = clausesSeenInTrace(trace);
  const searched = trace.some((c) => c.tool === "search_policy");

  const cited = citations
    .flatMap((c) => [...String(c).matchAll(CLAUSE_PATTERN)].map((m) => m[0]))
    .filter((c, i, arr) => arr.indexOf(c) === i);

  return {
    cited,
    unsupported: cited.filter((c) => !REAL_CLAUSES.has(c)),
    cited_without_search: cited.filter((c) => REAL_CLAUSES.has(c) && !seen.has(c)),
    searched,
  };
}
