import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createProject, DuplicateProjectNameError, getProjects } from "@/lib/db/queries/projects";
import { z, ZodError } from "zod";
import { createRateLimiter, getRateLimitHeaders, isRateLimitBackendUnavailableError } from "@/lib/rate-limit";
import { guardMutationRequest } from "@/lib/api/csrf";
import { routeTimer, recordRejection } from "@/lib/api/observe";
import { WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_MS } from "@/lib/constants";

const createProjectSchema = z.object({
    name: z.string().min(1).max(80),
    color: z.string().max(20).optional(),
});

// Rate limiter for write operations (30 requests per minute)
const writeRateLimiter = createRateLimiter({
    windowMs: WRITE_RATE_WINDOW_MS,
    maxRequests: WRITE_RATE_LIMIT,
    keyGenerator: (userId) => `write:${userId}`,
});


// POST already sits at its complexity ceiling, so the failure mapping lives here:
// a refused write is decided by the error, not by the handler. It deliberately
// does NOT cover the rate-limit-backend error: that one is answered before
// anything is logged, because its message can carry the internal endpoint/token.
function projectWriteErrorResponse(error: unknown): NextResponse | null {
    if (error instanceof DuplicateProjectNameError) {
        // Documented under 400: the (userId, name) pair is already taken. As a
        // 500 it read as a server fault, and the sidebar offered no retry path.
        return NextResponse.json(
            {
                error: error.message,
                details: [{ code: "custom", path: ["name"], message: error.message }],
            },
            { status: 400 }
        );
    }
    if (error instanceof ZodError) {
        return NextResponse.json(
            { error: "Invalid request", details: error.issues },
            { status: 400 }
        );
    }
    return null;
}

export async function GET() {
    const done = routeTimer("GET", "/api/projects");
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const projects = await getProjects(session.user.id);
        // Flat shape: both consumers (the sidebar Projects section and
        // settings/projects) read `{ projects }`, as every other collection route
        // does. The old nested envelope made both lists render empty.
        done(200);
        return NextResponse.json({ projects });
    } catch (error: unknown) {
        console.error("Failed to fetch projects:", error);
        done(500);
        return NextResponse.json(
            { error: "Failed to fetch projects" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const done = routeTimer("POST", "/api/projects");
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

        // Check rate limit
        const rateLimit = await writeRateLimiter.check(session.user.id);
        if (rateLimit.limited) {
            recordRejection("/api/projects", session.user.id);
            done(429);
            return NextResponse.json(
                { error: "Rate limit exceeded" },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimit.retryAfter),
                        ...getRateLimitHeaders(rateLimit.remaining, rateLimit.resetTime, WRITE_RATE_LIMIT),
                    },
                }
            );
        }

        const body = await request.json();
        const { name, color } = createProjectSchema.parse(body);
        const project = await createProject(session.user.id, name, color);

        done(201);
        return NextResponse.json(
            { project },
            {
                status: 201,
                headers: getRateLimitHeaders(rateLimit.remaining, rateLimit.resetTime, WRITE_RATE_LIMIT),
            }
        );
    } catch (error: unknown) {
        if (isRateLimitBackendUnavailableError(error)) {
            done(503);
            return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
        }
        console.error("Failed to create project:", error);
        const handled = projectWriteErrorResponse(error);
        if (handled) {
            done(handled.status);
            return handled;
        }

        done(500);
        return NextResponse.json(
            { error: "Failed to create project" },
            { status: 500 }
        );
    }
}
