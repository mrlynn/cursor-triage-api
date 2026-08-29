/**
 * Deterministic triage scoring - the half of the eval that has a right answer.
 *
 * Four fields, !==, nothing else. sentiment and summary are not scored.
 * Agent calls are slower than Claude Messages; keep the fixture set tiny.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../src/server.js";
import type { TriageResult } from "../../src/schemas.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface EvalCase {
  id: string;
  message: string;
  expected: {
    category: string;
    urgency: string;
    requires_human: boolean;
    requested_remedy: string;
  };
  notes: string;
}

export interface CaseResult {
  id: string;
  model: string;
  passed: boolean;
  failures: string[];
  confidence: number;
  tokens: number | null;
  latency_ms: number;
  notes: string;
}

export function loadCases(file = "dataset.jsonl"): EvalCase[] {
  return readFileSync(join(here, "..", file), "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvalCase);
}

export async function scoreTriage(opts: { model?: string; cases?: EvalCase[] } = {}): Promise<CaseResult[]> {
  const cases = opts.cases ?? loadCases();
  const results: CaseResult[] = [];

  for (const testCase of cases) {
    const started = Date.now();
    const url = opts.model
      ? `/v1/triage?model=${encodeURIComponent(opts.model)}`
      : "/v1/triage";
    const res = await app.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: testCase.message }),
    });

    if (!res.ok) {
      results.push({
        id: testCase.id,
        model: opts.model ?? "unknown",
        passed: false,
        failures: [`HTTP ${res.status}: ${await res.text()}`],
        confidence: 0,
        tokens: null,
        latency_ms: Date.now() - started,
        notes: testCase.notes,
      });
      continue;
    }

    const body = (await res.json()) as {
      triage: TriageResult;
      meta: { model?: { id?: string }; usage?: { total_tokens?: number } };
    };
    const got = body.triage;
    const want = testCase.expected;
    const failures: string[] = [];

    if (got.category !== want.category) {
      failures.push(`category: expected ${want.category}, got ${got.category}`);
    }
    if (got.urgency !== want.urgency) {
      failures.push(`urgency: expected ${want.urgency}, got ${got.urgency}`);
    }
    if (got.requires_human !== want.requires_human) {
      failures.push(
        `requires_human: expected ${want.requires_human}, got ${got.requires_human}`,
      );
    }
    if (got.entities.requested_remedy !== want.requested_remedy) {
      failures.push(
        `requested_remedy: expected ${want.requested_remedy}, got ${got.entities.requested_remedy}`,
      );
    }

    results.push({
      id: testCase.id,
      model: body.meta.model?.id ?? opts.model ?? "unknown",
      passed: failures.length === 0,
      failures,
      confidence: got.confidence,
      tokens: body.meta.usage?.total_tokens ?? null,
      latency_ms: Date.now() - started,
      notes: testCase.notes,
    });
  }

  return results;
}

export function accuracyOf(results: CaseResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.passed).length / results.length;
}

export function calibrationOf(results: CaseResult[]): {
  onPass: number | null;
  onFail: number | null;
  gap: number | null;
} {
  const mean = (xs: number[]) =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
  const onPass = mean(results.filter((r) => r.passed).map((r) => r.confidence));
  const onFail = mean(results.filter((r) => !r.passed).map((r) => r.confidence));
  return {
    onPass,
    onFail,
    gap: onPass !== null && onFail !== null ? onPass - onFail : null,
  };
}

export function fmtMetric(v: number | null, digits = 2): string {
  return v === null ? "n/a" : v.toFixed(digits);
}
