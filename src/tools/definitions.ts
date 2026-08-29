/**
 * Provider-neutral tool definitions.
 *
 * The descriptions live here once. src/tools/index.ts wraps them as Cursor
 * SDK `local.customTools` (JSON Schema + execute). Do not fork the text.
 *
 * Custom tools are local-only. Passing them to a cloud agent throws
 * ConfigurationError. This first slice boots locally on purpose.
 */
import type { SDKJsonValue } from "@cursor/sdk";
import { z } from "zod";
import { daysSince, findCustomer, findOrder, searchPolicy } from "./data.js";

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: S;
  jsonSchema: Record<string, SDKJsonValue>;
  run: (input: z.infer<S>) => unknown;
}

const lookupOrder: ToolDef = {
  name: "lookup_order",
  description:
    "Retrieve an order by its identifier. Call this before stating any fact about an order's " +
    "contents, price, status, or delivery date - never rely on what the customer claims. " +
    "Returns found: false when the identifier does not exist, which usually means the customer " +
    "mistyped it or is referring to a different account.",
  inputSchema: z.object({
    order_id: z
      .string()
      .describe("The order identifier, e.g. 'NW-48211'. Case-insensitive."),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      order_id: {
        type: "string",
        description: "The order identifier, e.g. 'NW-48211'. Case-insensitive.",
      },
    },
    required: ["order_id"],
  },
  run: (input) => {
    const { order_id } = input as { order_id: string };
    const order = findOrder(order_id);
    if (!order) return { found: false, order_id };
    return {
      found: true,
      ...order,
      days_since_delivery:
        order.delivered_at === null ? null : daysSince(order.delivered_at),
      days_since_order: daysSince(order.placed_at),
    };
  },
};

const lookupCustomer: ToolDef = {
  name: "lookup_customer",
  description:
    "Retrieve a customer's account standing by email: membership tier, lifetime value, refunds " +
    "issued in the last 30 days, and how many times they have contacted us in 90 days. Call this " +
    "before deciding between a refund, a replacement, and an escalation - policy clause 5.3 " +
    "escalates any account above $500 of refunds in 30 days, and you cannot check that from the " +
    "ticket text alone.",
  inputSchema: z.object({
    email: z.string().describe("The customer's email address on file."),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      email: {
        type: "string",
        description: "The customer's email address on file.",
      },
    },
    required: ["email"],
  },
  run: (input) => {
    const { email } = input as { email: string };
    const customer = findCustomer(email);
    return customer ? { found: true, ...customer } : { found: false, email };
  },
};

const searchPolicyTool: ToolDef = {
  name: "search_policy",
  description:
    "Search the Northwind support policy handbook and return the most relevant sections verbatim. " +
    "Use this whenever a decision depends on a rule - refund windows, escalation triggers, " +
    "shipping timelines, agent authority limits. Cite only clause numbers that appear in text " +
    "this tool returned to you.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Keywords describing the rule you need, e.g. 'lost package replacement threshold' or 'refund authority limit'.",
      ),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Keywords describing the rule you need, e.g. 'lost package replacement threshold' or 'refund authority limit'.",
      },
    },
    required: ["query"],
  },
  run: (input) => {
    const { query } = input as { query: string };
    const sections = searchPolicy(query);
    return sections.length > 0
      ? { matches: sections.length, sections }
      : { matches: 0, sections: [], hint: "Try broader keywords." };
  },
};

export const TOOL_DEFS: ToolDef[] = [lookupOrder, lookupCustomer, searchPolicyTool];
