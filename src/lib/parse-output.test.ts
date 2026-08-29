/**
 * After-the-fact Zod parse for /v1/triage. No live API key.
 *
 * Cursor returns text. These tests are the contract that a bad payload
 * becomes unparseable_output instead of a silently coerced classification.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseTriageOutput } from "./parse-output.js";
import { app } from "../server.js";

const valid = {
  category: "product_defect",
  urgency: "normal",
  sentiment: "frustrated",
  summary: "Jacket zipper failed; wants a replacement.",
  entities: {
    order_ids: ["NW-48211"],
    product_names: ["Ridgeline 3L Shell Jacket"],
    requested_remedy: "replacement",
  },
  requires_human: false,
  escalation_reason: null,
  confidence: 0.92,
};

test("bare JSON that matches TriageSchema is accepted", () => {
  const parsed = parseTriageOutput(JSON.stringify(valid));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.data.category, "product_defect");
    assert.equal(parsed.data.entities.requested_remedy, "replacement");
  }
});

test("a markdown-fenced JSON object is extracted and accepted", () => {
  const parsed = parseTriageOutput(`Sure.\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\`\n`);
  assert.equal(parsed.ok, true);
});

test("prose with no JSON object is a parse failure", () => {
  const parsed = parseTriageOutput("This looks like a product defect and should be urgent.");
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.error, "unparseable_output");
    assert.match(parsed.detail, /not JSON/i);
  }
});

test("JSON missing a required field fails Zod validation", () => {
  const { confidence: _drop, ...incomplete } = valid;
  const parsed = parseTriageOutput(JSON.stringify(incomplete));
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.error, "unparseable_output");
    assert.match(parsed.detail, /did not validate/);
  }
});

test("an invented category is rejected rather than coerced", () => {
  const parsed = parseTriageOutput(JSON.stringify({ ...valid, category: "warranty" }));
  assert.equal(parsed.ok, false);
});

test("confidence outside 0-1 fails Zod", () => {
  const parsed = parseTriageOutput(JSON.stringify({ ...valid, confidence: 1.4 }));
  assert.equal(parsed.ok, false);
});

test("POST /v1/triage rejects an empty body before any agent call", async () => {
  const res = await app.request("/v1/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "invalid_request");
});

test("POST /v1/triage rejects a missing message field", async () => {
  const res = await app.request("/v1/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: "email" }),
  });
  assert.equal(res.status, 400);
});
