/**
 * The scoreboard. `npx tsx evals/quick.ts`
 *
 * Three gold cases on purpose. A Cursor agent run is a full agent loop, not
 * one Messages call, so a 12-case sweep is the wrong first instrument.
 *
 *   npx tsx evals/quick.ts              score vs baseline
 *   npx tsx evals/quick.ts --save       write the new baseline
 *   npx tsx evals/quick.ts --gate       exit 1 below 2/3
 */
import "../src/lib/env.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCredentials } from "../src/lib/agent.js";
import { accuracyOf, calibrationOf, fmtMetric, scoreTriage } from "./lib/score.js";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(here, "baseline.json");
const THRESHOLD = 2 / 3;

interface Baseline {
  recorded_at: string | null;
  model: string | null;
  accuracy: number | null;
  passed: number;
  total: number;
  passing_ids: string[];
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

async function main(): Promise<void> {
  assertCredentials();

  const save = process.argv.includes("--save");
  const gate = process.argv.includes("--gate");

  const results = await scoreTriage();
  const accuracy = accuracyOf(results);
  const passed = results.filter((r) => r.passed).length;
  const calibration = calibrationOf(results);

  for (const r of results) {
    console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.id}  conf ${r.confidence.toFixed(2)}  ${r.latency_ms}ms`);
    for (const f of r.failures) console.log(`        ${f}`);
    if (!r.passed) console.log(`        note: ${r.notes}`);
  }

  const baseline = readBaseline();
  const hasBaseline = Boolean(baseline?.recorded_at);
  const delta = hasBaseline && baseline ? passed - baseline.passed : null;
  const deltaText =
    delta === null
      ? "no baseline yet"
      : `delta ${delta > 0 ? "+" : ""}${delta} vs baseline (${baseline!.passed}/${baseline!.total})`;

  console.log(
    `\naccuracy ${passed}/${results.length} (${(accuracy * 100).toFixed(1)}%) · ${deltaText}`,
  );
  console.log(
    `confidence: ${fmtMetric(calibration.onPass)} on passes, ` +
      `${fmtMetric(calibration.onFail)} on failures ` +
      `(gap ${fmtMetric(calibration.gap)})`,
  );

  if (hasBaseline && baseline) {
    const nowPassing = new Set(results.filter((r) => r.passed).map((r) => r.id));
    const wasPassing = new Set(baseline.passing_ids);
    const broke = [...wasPassing].filter((id) => !nowPassing.has(id));
    const fixed = [...nowPassing].filter((id) => !wasPassing.has(id));
    if (broke.length) console.log(`regressed: ${broke.join(", ")}`);
    if (fixed.length) console.log(`newly passing: ${fixed.join(", ")}`);
  }

  if (save) {
    const next: Baseline = {
      recorded_at: new Date().toISOString(),
      model: results[0]?.model ?? null,
      accuracy,
      passed,
      total: results.length,
      passing_ids: results.filter((r) => r.passed).map((r) => r.id),
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`\nbaseline updated: ${BASELINE_PATH}`);
  }

  if (gate && accuracy < THRESHOLD) {
    console.error(
      `\nGATE FAILED: ${(accuracy * 100).toFixed(1)}% is below the ${(THRESHOLD * 100).toFixed(0)}% threshold.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
