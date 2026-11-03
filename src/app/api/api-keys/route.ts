import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { routeTimer, recordRejection } from "@/lib/api/observe";
import { saveKeySchema } from "@/lib/validators/schemas";
import { saveApiKey, getUserKeys } from "@/lib/db/queries/api-keys";
import { validateApiKey } from "@/lib/mastra";
import { apiKeyRateLimiter, API_KEY_RATE_LIMIT, getRateLimitHeaders, isRateLimitBackendUnavailableError } from "@/lib/rate-limit";
import { ZodError } from "zod";

export async function GET() {
    const done = routeTimer("GET", "/api/api-keys");
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const keys = await getUserKeys(session.user.id);
        done(200);
        return NextResponse.json({ keys });
    } catch (error) {
        console.error("Failed to list API keys:", error);
        done(500);
        return NextResponse.json({ error: "Failed to load API keys" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const done = routeTimer("POST", "/api/api-keys");
    const rejection = guardMutationRequest(request, true);
    if (rejection) {
        done(rejection.status);
        return rejection;
    }

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Consume a per-user quota only after authentication, never a supplied IP.
        const rateLimitResult = await apiKeyRateLimiter.check(session.user.id);
        if (rateLimitResult.limited) {
            recordRejection("/api/api-keys", session.user.id);
            done(429);
            return NextResponse.json(
                {
                    error: "Too many requests",
                    retryAfter: rateLimitResult.retryAfter,
                },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter),
                        ...getRateLimitHeaders(rateLimitResult.remaining, rateLimitResult.resetTime, API_KEY_RATE_LIMIT),
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
                done(400);
                return NextResponse.json(
                    { error: errorMsg },
                    { status: 400 }
                );
            }
            validationSkipped = false;
        }

        // isValid records "confirmed valid with the provider". A skipped validation is
        // intentionally stored as isValid:false (unvalidated), so the providers view can
        // prompt the user to verify it. A passed validation stores isValid:true.
        await saveApiKey(session.user.id, providerId, apiKey, !validationSkipped);
        done(200);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        if (isRateLimitBackendUnavailableError(error)) {
            done(503);
            return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
        }
        console.error("Failed to save API key:", error);

        if (error instanceof ZodError) {
            done(400);
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }

        done(500);
        return NextResponse.json(
            { error: "Failed to save API key" },
            { status: 500 }
        );
    }
}
