/**
 * Cursor SDK custom tools for the local resolution agent.
 *
 * Custom tools are local-only. The SDK registers them as an MCP server named
 * `custom-user-tools`. Passing local.customTools to a cloud agent throws
 * ConfigurationError - do not pretend they work on cloud.
 *
 * The execute wrapper also owns the iteration cap. Cursor's Run has no
 * max_iterations; after MAX_TOOL_CALLS we refuse further calls in OUR code.
 */
import type { SDKCustomTool } from "@cursor/sdk";
import { MAX_TOOL_CALLS } from "../config.js";
import { TOOL_DEFS } from "./definitions.js";

export interface ToolCallRecord {
  tool: string;
  input: unknown;
  output: unknown;
  ms: number;
}

export function createCustomTools(trace: ToolCallRecord[]): Record<string, SDKCustomTool> {
  const tools: Record<string, SDKCustomTool> = {};

  for (const def of TOOL_DEFS) {
    tools[def.name] = {
      description: def.description,
      inputSchema: def.jsonSchema,
      async execute(args) {
        if (trace.length >= MAX_TOOL_CALLS) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Tool call cap (${MAX_TOOL_CALLS}) reached. Stop calling tools ` +
                  `and return the JSON resolution now.`,
              },
            ],
            isError: true,
          };
        }

        const started = Date.now();
        const parsed = def.inputSchema.safeParse(args);
        if (!parsed.success) {
          const output = { error: "invalid_tool_input", issues: parsed.error.issues };
          trace.push({
            tool: def.name,
            input: args,
            output,
            ms: Date.now() - started,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(output) }],
            isError: true,
          };
        }

        const output = def.run(parsed.data);
        trace.push({
          tool: def.name,
          input: parsed.data,
          output,
          ms: Date.now() - started,
        });
        return JSON.stringify(output, null, 2);
      },
    };
  }

  return tools;
}
