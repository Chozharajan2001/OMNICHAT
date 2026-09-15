import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { createProject, getProjects } from "@/lib/db/queries/projects";
import { z, ZodError } from "zod";
import { createRateLimiter, getClientIp, getRateLimitHeaders } from "@/lib/rate-limit";
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

export async function GET() {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const projects = await getProjects(session.user.id);
        return NextResponse.json({ data: { projects } });
    } catch (error: unknown) {
        console.error("Failed to fetch projects:", error);
        return NextResponse.json(
            { error: "Failed to fetch projects" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check rate limit
        const rateLimit = writeRateLimiter.check(session.user.id);
        if (rateLimit.limited) {
            return NextResponse.json(
                { error: "Rate limit exceeded" },
                {
                    status: 429,
                    headers: getRateLimitHeaders(0, rateLimit.resetTime, WRITE_RATE_LIMIT),
                }
            );
        }

        const body = await request.json();
        const { name, color } = createProjectSchema.parse(body);
        const project = await createProject(session.user.id, name, color);
        
        return NextResponse.json(
            { data: { project } },
            {
                status: 201,
                headers: getRateLimitHeaders(rateLimit.remaining, rateLimit.resetTime, WRITE_RATE_LIMIT),
            }
        );
    } catch (error: unknown) {
        console.error("Failed to create project:", error);
        
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        
        return NextResponse.json(
            { error: "Failed to create project" },
            { status: 500 }
        );
    }
}
