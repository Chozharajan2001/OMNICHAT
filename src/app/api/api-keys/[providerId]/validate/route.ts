// src/app/api/api-keys/[providerId]/validate/route.ts
// Re-check a credential that is already stored, so an "unvalidated" key can be
// confirmed without retyping it.

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { getDecryptedKey, markKeyValid } from "@/lib/db/queries/api-keys";
import { validateApiKey } from "@/lib/mastra";
import { getProvider } from "@/lib/mastra/providers";
import { apiKeyRateLimiter, isRateLimitBackendUnavailableError } from "@/lib/rate-limit";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ providerId: string }> }
) {
    const rejection = guardMutationRequest(request);
    if (rejection) return rejection;

    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { providerId } = await params;
        if (!getProvider(providerId)) {
            return NextResponse.json(
                { error: "Unknown provider" },
                { status: 400, headers: { "Cache-Control": "no-store" } }
            );
        }

        // Rate limited because a real provider request is billed on every call;
        // an unthrottled button is a way to spend someone's quota.
        const rateLimit = await apiKeyRateLimiter.check(session.user.id);
        if (rateLimit.limited) {
            return NextResponse.json(
                { error: "Too many requests", retryAfter: rateLimit.retryAfter },
                {
                    status: 429,
                    headers: { "Retry-After": String(rateLimit.retryAfter) },
                }
            );
        }

        const apiKey = await getDecryptedKey(session.user.id, providerId);
        if (!apiKey) {
            return NextResponse.json(
                { error: "No stored key for this provider" },
                { status: 404, headers: { "Cache-Control": "no-store" } }
            );
        }

        const valid = await validateApiKey(providerId, apiKey);
        await markKeyValid(session.user.id, providerId, valid);
        // Only the verdict: this endpoint must never echo the credential back.
        return NextResponse.json(
            { providerId, valid },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error: unknown) {
        if (isRateLimitBackendUnavailableError(error)) {
            return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
        }
        console.error("Failed to validate stored API key:", error);
        return NextResponse.json(
            { error: "Failed to validate API key" },
            { status: 500 }
        );
    }
}
