/**
 * Minimal Server-Sent Events writer.
 *
 * Streaming is an HTTP response with Content-Type: text/event-stream that
 * you do not close until you are done. X-Accel-Buffering: no stops nginx
 * from buffering the whole stream into one chunk.
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
