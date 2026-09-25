// src/app/api/api-keys/[providerId]/route.ts
// Delete a user’s API key for a specific provider

import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { guardMutationRequest } from "@/lib/api/csrf";
import { deleteApiKey } from "@/lib/db/queries/api-keys";

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ providerId: string }> }
) {
    const rejection = guardMutationRequest(request);
    if (rejection) return rejection;

    const session = await getServerSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { providerId } = await params;
    if (!providerId) {
        return NextResponse.json({ error: "Missing providerId" }, { status: 400 });
    }

    try {
        await deleteApiKey(session.user.id, providerId);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        // Prisma P2025 means no record found – treat as success (idempotent delete)
        if ((error as { code?: string }).code === "P2025") {
            return NextResponse.json({ success: true });
        }
        console.error("Failed to delete API key:", error);
        return NextResponse.json(
            { error: "Failed to delete API key" },
            { status: 500 }
        );
    }
}
