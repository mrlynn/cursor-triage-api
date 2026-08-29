/**
 * GET /v1/limits - remaining headroom / key info.
 *
 * Cursor.me() returns API key identity (apiKeyName, userEmail, createdAt).
 * Documented rate limits are quoted from the public docs, not invented.
 *
 * Cloud Agents API publishes "Standard rate limiting" with no numeric quota
 * on https://cursor.com/docs/api. This response says that.
 */
import { Cursor } from "@cursor/sdk";
import { Hono } from "hono";
import { DOCUMENTED_RATE_LIMITS } from "../config.js";
import { toHttpError } from "../lib/errors.js";

export const limitsRoute = new Hono();

limitsRoute.get("/", async (c) => {
  try {
    const me = await Cursor.me();
    return c.json({
      key: {
        api_key_name: me.apiKeyName,
        user_id: me.userId ?? null,
        user_email: me.userEmail ?? null,
        user_first_name: me.userFirstName ?? null,
        user_last_name: me.userLastName ?? null,
        created_at: me.createdAt,
      },
      rate_limits: DOCUMENTED_RATE_LIMITS,
      remaining_headroom: null,
      note:
        "Cursor.me() identifies the key. It does not return remaining-request " +
        "counters. Cloud Agents API rate limiting is documented as 'Standard " +
        "rate limiting' without a published numeric quota. A 429 maps to " +
        "RateLimitError. The repositories endpoint is separately documented " +
        "at 1/user/minute and 30/user/hour; this service does not call it.",
    });
  } catch (err) {
    const { status, body } = toHttpError(err);
    return c.json(body, status as 400);
  }
});
