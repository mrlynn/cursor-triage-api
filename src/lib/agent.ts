/**
 * Local Agent.create wrapper.
 *
 * Default runtime is local: Agent.create({ local: { cwd }, customTools }).
 * All inference still goes through Cursor's hosted models. "Local" means the
 * agent loop and filesystem access run in this Node process.
 *
 * Built-in tools default to [] so a support ticket does not start editing
 * this repo. Custom tools (resolve only) still register via MCP as
 * custom-user-tools unless you disallow "mcp".
 */
import { Agent, type ModelSelection, type Run, type SDKCustomTool, type TokenUsage } from "@cursor/sdk";
import { WORKSPACE_CWD } from "../config.js";
import { summarizeAgentUsage, toUsageReport, type BilledCost, type UsageReport } from "./usage.js";

export interface AgentRunMeta {
  agent_id: string;
  run_id: string;
  request_id?: string;
  model?: ModelSelection;
  duration_ms?: number;
  usage: UsageReport | null;
  billed: ReturnType<typeof summarizeAgentUsage>;
}

export function assertCredentials(): void {
  if (!process.env.CURSOR_API_KEY) {
    throw new Error(
      "CURSOR_API_KEY is not set. Copy .env.example to .env and paste a user " +
        "or service-account key from Cursor Dashboard -> API Keys.",
    );
  }
}

export async function createLocalAgent(opts: {
  model: ModelSelection;
  customTools?: Record<string, SDKCustomTool>;
}) {
  return Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: opts.model,
    tools: [],
    local: {
      cwd: WORKSPACE_CWD,
      ...(opts.customTools ? { customTools: opts.customTools } : {}),
    },
  });
}

export async function collectBilled(
  agent: { getUsage: (options?: { runId?: string }) => Promise<unknown> },
) {
  try {
    // Local getUsage({ runId }) expects a usage UUID from a previous
    // getUsage().runs[].runId, not the client-side run.id. Passing run.id
    // throws ConfigurationError. Fetch the agent totals instead.
    const billed = await agent.getUsage();
    return summarizeAgentUsage(billed as Parameters<typeof summarizeAgentUsage>[0]);
  } catch {
    // Cost can take a moment to settle; absence is documented, not a failure.
    return null;
  }
}

export function runMeta(
  run: Run,
  extra: { billed?: ReturnType<typeof summarizeAgentUsage> } = {},
): AgentRunMeta {
  return {
    agent_id: run.agentId,
    run_id: run.id,
    request_id: run.requestId,
    model: run.model,
    duration_ms: run.durationMs,
    usage: toUsageReport(run.usage as TokenUsage | undefined),
    billed: extra.billed ?? null,
  };
}

export async function oneShot(opts: {
  model: ModelSelection;
  prompt: string;
  customTools?: Record<string, SDKCustomTool>;
}): Promise<{ text: string; meta: AgentRunMeta }> {
  const agent = await createLocalAgent({
    model: opts.model,
    customTools: opts.customTools,
  });

  try {
    const run = await agent.send(opts.prompt);
    const result = await run.wait();
    const billed = await collectBilled(agent);
    const text = result.result ?? "";
    return { text, meta: runMeta(run, { billed }) };
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

export { Agent };
