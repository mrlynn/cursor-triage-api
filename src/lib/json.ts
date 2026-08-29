/**
 * Parsing model output that is supposed to be JSON.
 *
 * Cursor's Agent returns assistant text. There is no output_config.format
 * and no messages.parse(). Extraction and Zod validation live in YOUR code.
 *
 * Returns null rather than throwing so the caller has to write the failure
 * branch. A bare JSON.parse in try/catch that swallows the error is the
 * pattern this repo argues against.
 */
export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Pull a JSON object out of agent text.
 *
 * Agents often wrap JSON in a markdown fence, or add a sentence before the
 * object. We take a fenced block if present, then the outermost `{...}`.
 * This is a repair heuristic, not a guarantee - if it fails, the route
 * returns 502 unparseable_output. That is the teaching point.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return safeJson(candidate.slice(start, end + 1));
}
