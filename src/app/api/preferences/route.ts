import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { routeTimer } from "@/lib/api/observe";
import { getPreferences, upsertPreferences } from "@/lib/db/queries/preferences";
import { preferencesSchema } from "@/lib/validators/schemas";
import { ZodError } from "zod";

/**
 * GET /api/preferences
 * Returns the current user's preferences (or null if none set yet).
 */
export async function GET() {
    const done = routeTimer("GET", "/api/preferences");
    try {
        const session = await getServerSession();
        if (!session?.user?.id) {
            done(401);
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const prefs = await getPreferences(session.user.id);
        done(200);
        return NextResponse.json({ preferences: prefs });
    } catch (error) {
        console.error("Failed to load preferences:", error);
        done(500);
        return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
    }
}

/**
 * PATCH /api/preferences
 * Partially update the user's preferences. Creates a row if none exists.
 */
export async function PATCH(request: Request) {
    const done = routeTimer("PATCH", "/api/preferences");
    const rejection = guardMutationRequest(request, true);
    if (rejection) {
        done(rejection.status);
        return rejection;
    }

    const session = await getServerSession();
    if (!session?.user?.id) {
        done(401);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = preferencesSchema.parse(body);

        const updated = await upsertPreferences(session.user.id, data);
        done(200);
        return NextResponse.json({ preferences: updated });
    } catch (error: unknown) {
        console.error("Preferences update failed:", error);
        
        if (error instanceof ZodError) {
            done(400);
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        
        done(500);
        return NextResponse.json(
            { error: "Failed to update preferences" },
            { status: 500 }
        );
    }
}
