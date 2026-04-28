// file: lib/logger/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape that covers both plain Next.js handlers and withRole handlers. */
type AnyHandler = (
  req: NextRequest,
  context?: unknown,
  ...rest: unknown[]
) => Promise<NextResponse | Response>;

// ---------------------------------------------------------------------------
// withLogging
// ---------------------------------------------------------------------------

/**
 * Wraps any Next.js route handler and emits an "api_request" metric after
 * every response — including error responses and thrown exceptions.
 *
 * Usage:
 *   export const POST = withLogging(withRole(["student"])(handler));
 *   export const GET  = withLogging(mySimpleHandler);
 */
export function withLogging<T extends AnyHandler>(handler: T): T {
  return (async function (
    req: NextRequest,
    context?: unknown,
    ...rest: unknown[]
  ): Promise<NextResponse | Response> {
    const start = Date.now();
    let statusCode = 500;

    try {
      const response = await handler(req, context, ...rest);
      statusCode = response.status;
      return response;
    } catch (err) {
      // Re-throw after logging
      throw err;
    } finally {
      logger.metric("api", "api_request", {
        method:     req.method,
        path:       new URL(req.url).pathname,
        statusCode,
        durationMs: Date.now() - start,
      });
    }
  }) as T;
}
