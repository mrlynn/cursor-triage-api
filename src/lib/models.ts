/**
 * Live model catalog. Do not hardcode a fake list of ids.
 *
 * Source of truth: Cursor.models.list()
 * (REST: GET https://api.cursor.com/v1/models)
 *
 * Cursor Router is `auto-smart` plus an `optimize_for` parameter
 * (cost | balanced | intelligence). It only appears when Router is enabled
 * for the API key's team. We never send optimize_for unless the catalog
 * lists that parameter on auto-smart.
 */
import { Cursor, type ModelListItem, type ModelSelection } from "@cursor/sdk";

/**
 * Fallback order when the caller does not pass `?model=`, newest first.
 *
 * These are the three models in Cursor's first-party "Cursor Models" pool.
 * They are the right default for this service for a billing reason rather
 * than a quality one: third-party models in the catalog (the Claude, Gemini
 * and GPT entries) draw from the separate "Other Models" pool and, on Teams
 * and Enterprise plans, add a $0.25/MTok Cursor Token Rate on top of the
 * model's own API price. A default should not quietly spend from the pool
 * the reader did not choose.
 *
 * This is a PREFERENCE, not a catalog. Every id here is still checked
 * against Cursor.models.list() before it is used, and an id missing from
 * the live catalog is skipped rather than sent.
 *
 * Source: https://cursor.com/docs/models-and-pricing
 * Verified: 2026-08-30. If this list goes stale the service still works —
 * it falls through to the first catalog entry — but the default silently
 * stops being the model this course claims to be teaching, so re-check it
 * when the numbers in docs/comparison.md are refreshed.
 */
const DEFAULT_PREFERENCE = ["grok-4.6", "grok-4.5", "composer-2.5"] as const;

let cached: ModelListItem[] | null = null;

export async function listModels(): Promise<ModelListItem[]> {
  if (cached) return cached;
  cached = await Cursor.models.list();
  return cached;
}

export function resetModelCache(): void {
  cached = null;
}

export class UnknownModelError extends Error {
  readonly knownIds: string[];

  constructor(requested: string, knownIds: string[]) {
    super(
      `Model "${requested}" is not in Cursor.models.list() for this API key. ` +
        `Known: ${knownIds.join(", ") || "(empty catalog)"}.`,
    );
    this.name = "UnknownModelError";
    this.knownIds = knownIds;
  }
}

/**
 * Resolve a ModelSelection from an optional ?model= query.
 *
 * - If `requested` is set, it must appear in the live catalog.
 * - If that model is auto-smart AND the catalog defines optimize_for, we
 *   attach the requested (or first allowed) value.
 * - If auto-smart is requested but optimize_for is missing from the catalog,
 *   we send `{ id: "auto-smart" }` with no params rather than inventing one.
 * - If nothing is requested, walk DEFAULT_PREFERENCE in order, else the first
 *   catalog id, else the documented `{ id: "auto" }` server fallback.
 */
export async function resolveModelSelection(
  requested?: string | null,
  optimizeFor?: string | null,
): Promise<ModelSelection> {
  const models = await listModels();
  const knownIds = models.map((m) => m.id);

  if (requested) {
    const found = models.find((m) => m.id === requested || m.aliases?.includes(requested));
    if (!found) {
      throw new UnknownModelError(requested, knownIds);
    }
    return selectionFor(found, optimizeFor);
  }

  for (const id of DEFAULT_PREFERENCE) {
    const preferred = models.find((m) => m.id === id);
    if (preferred) return selectionFor(preferred, optimizeFor);
  }

  const first = models[0];
  if (first) return selectionFor(first, optimizeFor);

  return { id: "auto" };
}

function selectionFor(model: ModelListItem, optimizeFor?: string | null): ModelSelection {
  if (model.id !== "auto-smart") {
    return { id: model.id };
  }

  const optimize = model.parameters?.find((p) => p.id === "optimize_for");
  if (!optimize) {
    return { id: model.id };
  }

  const allowed = new Set(optimize.values.map((v) => v.value));
  const value = optimizeFor && allowed.has(optimizeFor) ? optimizeFor : undefined;
  if (!value) {
    // Catalog has the knob, but the caller did not pick a documented value.
    // Do not invent "balanced". Local create still needs an id; params stay off.
    return { id: model.id };
  }

  return {
    id: model.id,
    params: [{ id: "optimize_for", value }],
  };
}
