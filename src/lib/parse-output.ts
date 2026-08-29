/**
 * After-the-fact schema validation.
 *
 * This is the structured-outputs lab in one file. Claude's twin constrains
 * generation with output_config.format. Cursor returns text. We extract JSON
 * and run Zod in our process. A failure is a 502, not a silent coerce.
 */
import { ResolutionSchema, TriageSchema, type Resolution, type TriageResult } from "../schemas.js";
import { extractJsonObject } from "./json.js";

export type ParseFailure = {
  ok: false;
  error: "unparseable_output";
  detail: string;
  raw: string;
};

export type ParseSuccess<T> = { ok: true; data: T };

export function parseTriageOutput(text: string): ParseSuccess<TriageResult> | ParseFailure {
  const extracted = extractJsonObject(text);
  if (extracted === null) {
    return {
      ok: false,
      error: "unparseable_output",
      detail:
        "The agent reply was not JSON we could extract. Cursor does not constrain " +
        "generation to a schema; this service parses and validates after the fact.",
      raw: text.slice(0, 2000),
    };
  }

  const validated = TriageSchema.safeParse(extracted);
  if (!validated.success) {
    return {
      ok: false,
      error: "unparseable_output",
      detail: "The extracted JSON did not validate against the triage schema.",
      raw: text.slice(0, 2000),
    };
  }

  return { ok: true, data: validated.data };
}

export function parseResolutionOutput(text: string): ParseSuccess<Resolution> | ParseFailure {
  const extracted = extractJsonObject(text);
  if (extracted === null) {
    return {
      ok: false,
      error: "unparseable_output",
      detail:
        "The agent reply was not JSON we could extract. Cursor does not constrain " +
        "generation to a schema; this service parses and validates after the fact.",
      raw: text.slice(0, 2000),
    };
  }

  const validated = ResolutionSchema.safeParse(extracted);
  if (!validated.success) {
    return {
      ok: false,
      error: "unparseable_output",
      detail: "The extracted JSON did not validate against the resolution schema.",
      raw: text.slice(0, 2000),
    };
  }

  return { ok: true, data: validated.data };
}
