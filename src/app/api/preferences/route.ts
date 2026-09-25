import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { getPreferences, upsertPreferences } from "@/lib/db/queries/preferences";
import { preferencesSchema } from "@/lib/validators/schemas";
import { ZodError } from "zod";

/**
 * GET /api/preferences
 * Returns the current user's preferences (or null if none set yet).
 */
export async function GET() {
    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const prefs = await getPreferences(session.user.id);
    return NextResponse.json({ preferences: prefs });
}

/**
 * PATCH /api/preferences
 * Partially update the user's preferences. Creates a row if none exists.
 */
export async function PATCH(request: Request) {
    const rejection = guardMutationRequest(request, true);
    if (rejection) return rejection;

    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = preferencesSchema.parse(body);

        const updated = await upsertPreferences(session.user.id, data);
        return NextResponse.json({ preferences: updated });
    } catch (error: unknown) {
        console.error("Preferences update failed:", error);
        
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400 }
            );
        }
        
        return NextResponse.json(
            { error: "Failed to update preferences" },
            { status: 500 }
        );
    }
}
