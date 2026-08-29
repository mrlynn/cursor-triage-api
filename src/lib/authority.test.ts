/**
 * The money control, tested. No live API key.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_REFUND_LIMIT_USD,
  THIRTY_DAY_REFUND_CEILING_USD,
  enforceAuthority,
} from "./authority.js";
import { applyResolveGuardrails } from "./resolve-result.js";
import type { Resolution } from "../schemas.js";
import type { ToolCallRecord } from "../tools/index.js";

function resolution(over: Partial<Resolution> = {}): Resolution {
  return {
    recommended_action: "issue_refund",
    policy_citations: ["2.7"],
    refund_amount_usd: 100,
    within_agent_authority: true,
    reasoning: "Jacket zipper failed on second wear.",
    ...over,
  };
}

function customerLookup(refunds30d: number | null, found = true): ToolCallRecord {
  return {
    tool: "lookup_customer",
    input: { email: "sam@example.com" },
    output: found
      ? { found: true, refunds_last_30d_usd: refunds30d }
      : { found: false },
    ms: 3,
  };
}

test("a refund exactly at the ceiling is allowed", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: AGENT_REFUND_LIMIT_USD }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.violations, []);
});

test("a refund one cent over the ceiling is not", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: AGENT_REFUND_LIMIT_USD + 0.01 }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_agent_authority"));
});

test("a blocked resolution comes back escalated, not merely flagged", () => {
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 900 }), [
    customerLookup(0),
  ]);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.corrected.recommended_action, "escalate_to_supervisor");
  assert.equal(verdict.corrected.within_agent_authority, false);
  assert.match(verdict.corrected.reasoning, /^\[Automatically escalated:/);
  assert.ok(verdict.corrected.reasoning.includes("Jacket zipper failed"));
});

test("an allowed resolution is returned unmodified", () => {
  const original = resolution({ refund_amount_usd: 50 });
  const verdict = enforceAuthority(original, [customerLookup(0)]);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.corrected, original);
});

test("the model claiming authority it lacks is reported separately", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 900, within_agent_authority: true }),
    [customerLookup(0)],
  );
  assert.ok(verdict.violations.includes("model_claimed_authority_it_lacked"));
});

test("an honest model over the ceiling is blocked without the self-report violation", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 900, within_agent_authority: false }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_agent_authority"));
  assert.equal(verdict.violations.includes("model_claimed_authority_it_lacked"), false);
});

test("the 30-day ceiling is read from the trace, not from the model's prose", () => {
  const verdict = enforceAuthority(
    resolution({
      refund_amount_usd: 200,
      reasoning: "Customer has had no refunds in the last 30 days.",
    }),
    [customerLookup(450)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_30d_ceiling"));
});

test("cumulative spend exactly at the 30-day ceiling is allowed", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: 100 }),
    [customerLookup(THIRTY_DAY_REFUND_CEILING_USD - 100)],
  );
  assert.equal(verdict.allowed, true);
});

test("a refund with no customer lookup is a violation on its own", () => {
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 50 }), []);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_customer_lookup"));
});

test("a customer record that was not found does not count as zero prior refunds", () => {
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 50 }), [
    customerLookup(null, false),
  ]);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_customer_lookup"));
});

test("a refund with a null amount is blocked", () => {
  const verdict = enforceAuthority(
    resolution({ refund_amount_usd: null }),
    [customerLookup(0)],
  );
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_without_amount"));
});

test("non-refund actions are not subject to the refund ceilings", () => {
  const verdict = enforceAuthority(
    resolution({
      recommended_action: "ship_replacement",
      refund_amount_usd: 900,
    }),
    [],
  );
  assert.equal(verdict.allowed, true);
  assert.deepEqual(verdict.violations, []);
});

test("the first usable customer lookup in the trace is the one that counts", () => {
  const verdict = enforceAuthority(resolution({ refund_amount_usd: 100 }), [
    customerLookup(450),
    customerLookup(0),
  ]);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.violations.includes("refund_exceeds_30d_ceiling"));
});

test("applyResolveGuardrails returns the corrected resolution as the product field", () => {
  const guarded = applyResolveGuardrails(
    resolution({ refund_amount_usd: 900 }),
    [customerLookup(0)],
    8,
  );
  assert.equal(guarded.resolution.recommended_action, "escalate_to_supervisor");
  assert.equal(guarded.guardrails.authority_allowed, false);
  assert.ok(guarded.guardrails.authority_violations.includes("refund_exceeds_agent_authority"));
});
