import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { saveKeySchema } from "@/lib/validators/schemas";
import { saveApiKey, getUserKeys } from "@/lib/db/queries/api-keys";
import { validateApiKey } from "@/lib/mastra";
import { apiKeyRateLimiter, getRateLimitHeaders, isRateLimitBackendUnavailableError } from "@/lib/rate-limit";
import { ZodError } from "zod";

export async function GET() {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await getUserKeys(session.user.id);
    return NextResponse.json({ keys });
}

export async function POST(request: Request) {
    const rejection = guardMutationRequest(request, true);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Consume a per-user quota only after authentication, never a supplied IP.
        const rateLimitResult = await apiKeyRateLimiter.check(session.user.id);
        if (rateLimitResult.limited) {
            return NextResponse.json(
                {
                    error: "Too many requests",
                    retryAfter: rateLimitResult.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter),
                        ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetTime, 10),
                    },
                }
            );
        }

        const body = await request.json();
        const { providerId, apiKey, validate = true } = saveKeySchema.parse(body);

        // Validate API key with provider
        let validationSkipped = !validate;
        if (validate) {
            const isValid = await validateApiKey(providerId, apiKey);
            if (!isValid) {
                // In development, provide more context
                const errorMsg = process.env.NODE_ENV === 'development'
                    ? "Invalid API key or provider error. Check terminal for details."
                    : "Invalid API key or provider error";
                return NextResponse.json(
                    { error: errorMsg },
                    { status: 400 }
                );
            }
            validationSkipped = false;
        }

        // Mark as valid if validation passed or was skipped
        await saveApiKey(session.user.id, providerId, apiKey, !validationSkipped);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (isRateLimitBackendUnavailableError(error)) {
            return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
        }
        console.error("Failed to save API key:", error);

        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Failed to save API key" },
            { status: 500 }
        );
    }
}
