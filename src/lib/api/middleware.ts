// src/lib/api/middleware.ts
//
// NOTE ON ACTUAL USAGE (audit D4, verified against the route handlers): no route
// imports these helpers. Every /api handler builds its own NextResponse, so the
// "standard envelope" these functions describe is NOT the shipped contract -
// every route returns a bare object ({ projects }, { keys }, { preferences },
// ...). requireAuth is the single exception: src/lib/auth/__tests__/config.test.ts
// imports it as a parity check that this guard and the session helper reject the
// same way. Kept for that assertion and as the intended landing spot for future
// routes; treat any claim of blanket envelope/error standardization as stale.

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getServerSession } from "@/lib/auth/session";

/**
 * Standard API error response format
 */
export interface ApiError {
  error: string;
  details?: unknown;
}

/**
 * Standard API success response format
 */
export interface ApiResponse<T> {
  data: T;
}

/**
 * Handle API errors with consistent formatting
 */
export function handleApiError(error: unknown, context: string): NextResponse<ApiError> {
  console.error(`${context}:`, error);

  // ZodError - validation failed
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: error.issues.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      },
      { status: 400 }
    );
  }

  // Authentication error
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Generic error - don't leak internal details
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

/**
 * Require authentication for API routes
 * @throws Error if not authenticated
 */
export async function requireAuth(): Promise<{ userId: string }> {
  const session = await getServerSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return { userId: session.user.id };
}

/**
 * Wrap API route handlers with consistent error handling
 */
export function withApiHandler<T>(
  handler: () => Promise<NextResponse<T>>,
  context: string
): () => Promise<NextResponse<T | ApiError>> {
  return async () => {
    try {
      return await handler();
    } catch (error) {
      return handleApiError(error, context) as NextResponse<T | ApiError>;
    }
  };
}

/**
 * Create a standard success response
 */
export function apiSuccess<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data });
}

/**
 * Create a standard error response
 */
export function apiError(error: string, details?: unknown): NextResponse<ApiError> {
  return NextResponse.json({ error, details }, { status: 400 });
}

/**
 * Rate limit response helper
 */
export function rateLimitResponse(
  retryAfter: number,
  limit: number,
  remaining: number,
  resetTime: number
): NextResponse<ApiError> {
  return NextResponse.json(
    { error: "Rate limit exceeded" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetTime / 1000)),
      },
    }
  );
}
