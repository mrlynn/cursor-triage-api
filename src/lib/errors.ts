/**
 * Mapping Cursor SDK errors onto HTTP responses.
 *
 * Catch a chain, most-specific first. Never string-match on error.message.
 * The distinction that matters to the caller is retryable (429, 5xx) vs not
 * (400, 401, 409).
 *
 * Documented classes (https://cursor.com/docs/sdk/typescript#errors):
 *   AuthenticationError, RateLimitError, ConfigurationError, AgentBusyError,
 *   NetworkError, AgentNotFoundError, IntegrationNotConnectedError,
 *   UnsupportedRunOperationError, UnknownAgentError
 * All extend CursorSdkError (also exported as CursorAgentError).
 */
import {
  AgentBusyError,
  AgentNotFoundError,
  AuthenticationError,
  ConfigurationError,
  CursorSdkError,
  NetworkError,
  RateLimitError,
} from "@cursor/sdk";

export interface ApiErrorBody {
  error: string;
  detail: string;
  retryable: boolean;
  request_id?: string;
}

export function toHttpError(err: unknown): { status: number; body: ApiErrorBody } {
  if (err instanceof AuthenticationError) {
    return {
      status: 500,
      body: {
        error: "upstream_auth_failed",
        detail:
          "The service's Cursor credentials were rejected. Check CURSOR_API_KEY " +
          "(user or service-account key from Cursor Dashboard -> API Keys).",
        retryable: false,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof RateLimitError) {
    return {
      status: 429,
      body: {
        error: "rate_limited",
        detail:
          "Cursor rate limit or usage limit reached. Retry with exponential backoff " +
          "when error.isRetryable is true; a monthly cap needs a plan change.",
        retryable: err.isRetryable,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof AgentBusyError) {
    return {
      status: 409,
      body: {
        error: "agent_busy",
        detail:
          "This cloud agent already has a run in CREATING or RUNNING. Wait, cancel, " +
          "or poll Agent.listRuns() before sending again. Local agents do not return " +
          "agent_busy; use send({ local: { force: true } }) to expire a stuck local run.",
        retryable: false,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof AgentNotFoundError) {
    return {
      status: 404,
      body: {
        error: "agent_not_found",
        detail: err.message,
        retryable: false,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof ConfigurationError) {
    return {
      status: 400,
      body: {
        error: "invalid_configuration",
        detail: err.message,
        retryable: false,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof NetworkError) {
    return {
      status: 503,
      body: {
        error: "upstream_unreachable",
        detail: "Could not reach the Cursor API.",
        retryable: err.isRetryable,
        request_id: err.requestId,
      },
    };
  }

  if (err instanceof CursorSdkError) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    return {
      status,
      body: {
        error: "upstream_error",
        detail: err.message,
        retryable: err.isRetryable,
        request_id: err.requestId,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "internal_error",
      detail: err instanceof Error ? err.message : String(err),
      retryable: false,
    },
  };
}
